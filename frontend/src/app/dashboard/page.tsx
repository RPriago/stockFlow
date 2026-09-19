'use client';

import React, { useState, useEffect, useRef } from 'react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import { ProductListResult } from '@/types/product';
import { Product, ProductListResult } from '@/types/product';
import { InventoryStats } from '@/types/inventory';
import { POStats } from '@/types/po';
import { SOStats } from '@/types/so';
import { POStats, PurchaseOrder } from '@/types/po';
import { SOStats, SalesOrder } from '@/types/so';
import {
  Package,
  Boxes,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Plus,
  FileDown,
  ChevronRight,
  TrendingUp,
  Inbox,
  Check,
  Building2,
} from 'lucide-react';
import Link from 'next/link';

interface RecentMovement {
  id: string;
  item_name: string;
  sku: string;
  type: string;
  warehouse: string;
  location: string;
  qty: number;
  time: string;
}

interface FlowPoint {
  label: string;
  inbound: number;
  outbound: number;
  date?: string;
}

interface WarehouseCapacityItem {
  warehouse_id: string;
  name: string;
  current_stock: number;
  capacity: number;
  percentage: number;
}

interface WarehouseCapacityResponse {
  warehouses: WarehouseCapacityItem[];
  total_capacity: number;
  total_on_hand: number;
  utilization_rate: number;
}

interface InventoryMovement {
  id?: string;
  _id?: string;
  product_name?: string;
  product_sku?: string;
  type: string;
  warehouse_name?: string;
  location_code?: string;
  quantity: number;
  created_at: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [invStats, setInvStats] = useState<InventoryStats | null>(null);
  const [poStats, setPoStats] = useState<POStats | null>(null);
  const [soStats, setSoStats] = useState<SOStats | null>(null);
  const [movements, setMovements] = useState<RecentMovement[]>([]);

  // Detailed lists for dynamic KPI velocity calculation
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [poList, setPoList] = useState<PurchaseOrder[]>([]);
  const [soList, setSoList] = useState<SalesOrder[]>([]);
  const [flowTotals, setFlowTotals] = useState<{ inbound: number; outbound: number }>({ inbound: 0, outbound: 0 });

  // Real Analytics States
  const [flowPoints, setFlowPoints] = useState<FlowPoint[]>([]);
  const [capacityData, setCapacityData] = useState<WarehouseCapacityResponse | null>(null);

  // Interactive Date Range State
  const [selectedDateRange, setSelectedDateRange] = useState('today');
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  // Interactive Chart Period State
  const [chartPeriod, setChartPeriod] = useState<'monthly' | 'daily'>('daily');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const dateOptions = [
    { id: 'today', label: language === 'id' ? 'Hari Ini' : 'Today' },
    { id: 'last_7d', label: language === 'id' ? '7 Hari Terakhir' : 'Last 7 Days' },
    { id: 'this_month', label: language === 'id' ? 'Bulan Ini' : 'This Month' },
    { id: 'last_30d', label: language === 'id' ? '30 Hari Terakhir' : 'Last 30 Days' },
    { id: 'all_time', label: language === 'id' ? 'Semua Waktu (2026)' : 'All Time (2026)' },
  ];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target as Node)) {
        setIsDateMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Dashboard KPIs and Lists
  useEffect(() => {
    async function loadStats() {
      try {
        const [prodRes, invRes, poRes, soRes, movRes] = await Promise.all([
          api.get<ProductListResult>('/products?page=1&limit=1'),
        const [prodRes, invRes, poRes, soRes, movRes, poListRes, soListRes] = await Promise.all([
          api.get<ProductListResult>('/products?page=1&limit=200'),
          api.get<InventoryStats>('/inventory/stats'),
          api.get<POStats>('/purchase-orders/stats'),
          api.get<SOStats>('/sales-orders/stats'),
          api.get<{ movements: InventoryMovement[] }>('/inventory/movements?page=1&limit=6'),
          api.get<{ orders: PurchaseOrder[] }>('/purchase-orders?page=1&limit=200'),
          api.get<{ orders: SalesOrder[] }>('/sales-orders?page=1&limit=200'),
        ]);

        if (prodRes.success && prodRes.data) {
          setTotalProducts(prodRes.data.meta.total);
          setTotalProducts(prodRes.data.meta?.total ?? prodRes.data.products?.length ?? 0);
          setProductsList(prodRes.data.products || []);
        }
        if (invRes.success && invRes.data) {
          setInvStats(invRes.data);
        }
        if (poRes.success && poRes.data) {
          setPoStats(poRes.data);
        }
        if (soRes.success && soRes.data) {
          setSoStats(soRes.data);
        }
        if (poListRes.success && poListRes.data?.orders) {
          setPoList(poListRes.data.orders);
        }
        if (soListRes.success && soListRes.data?.orders) {
          setSoList(soListRes.data.orders);
        }
        if (movRes.success && movRes.data?.movements) {
          const mapped: RecentMovement[] = movRes.data.movements.map((m, index) => ({
            id: m.id ?? m._id ?? `movement-${index}`,
            item_name: m.product_name || 'Inventory Item',
            sku: m.product_sku || 'SKU-UNKNOWN',
            type: m.type === 'in' ? 'Inbound' : m.type === 'out' ? 'Outbound' : 'Transfer',
            warehouse: m.warehouse_name || 'Main Hub',
            location: m.location_code || 'Zone A',
            qty: m.quantity,
            time: new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }));
          setMovements(mapped);
        } else {
          setMovements([]);
        }
      } catch {
        // Handled cleanly
      }
    }

    loadStats();

    const handleRefresh = () => {
      loadStats();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('stockflow-notification-refresh', handleRefresh);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('stockflow-notification-refresh', handleRefresh);
      }
    };
  }, []);

  // Fetch Dynamic Analytics (Stock Flow & Capacity)
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const tzOffset = -new Date().getTimezoneOffset();
        const [flowRes, capRes] = await Promise.all([
          api.get<{ points: FlowPoint[] }>(
          api.get<{ points: FlowPoint[]; total_inbound?: number; total_outbound?: number }>(
            `/inventory/analytics/flow?period=${chartPeriod}&range=${selectedDateRange}&tz_offset=${tzOffset}`
          ),
          api.get<WarehouseCapacityResponse>('/inventory/analytics/capacity'),
        ]);

        if (flowRes.success && flowRes.data?.points) {
          setFlowPoints(flowRes.data.points);
          setFlowTotals({
            inbound: flowRes.data.total_inbound ?? 0,
            outbound: flowRes.data.total_outbound ?? 0,
          });
        } else {
          setFlowPoints([]);
          setFlowTotals({ inbound: 0, outbound: 0 });
        }

        if (capRes.success && capRes.data) {
          setCapacityData(capRes.data);
        } else {
          setCapacityData(null);
        }
      } catch {
        // Handled cleanly
      }
    }

    fetchAnalytics();
  }, [chartPeriod, selectedDateRange]);

  const maxBarVal = Math.max(
    ...flowPoints.map((p) => Math.max(p.inbound, p.outbound)),
    10
  );

  const selectedDateLabel =
    dateOptions.find((o) => o.id === selectedDateRange)?.label || dateOptions[2].label;
    dateOptions.find((o) => o.id === selectedDateRange)?.label || dateOptions[0].label;

  // Dynamic SVG palette for Donut segments
  const donutColors = ['#7C6EF0', '#9D93F5', '#C7BFFA', '#A78BFA', '#818CF8'];

  // Metrics array
  const metrics = [
    {
      title: t('kpiTotalProducts'),
      value: totalProducts.toString(),
      change: '+0.0%',
      isPositive: true,
      icon: Package,
      href: '/products',
    },
    {
      title: t('kpiTotalStock'),
      value: invStats ? invStats.total_on_hand.toLocaleString() : '0',
      change: '+0.0%',
      isPositive: true,
      icon: Boxes,
      href: '/inventory',
    },
    {
      title: t('kpiLowStock'),
      value: invStats ? invStats.low_stock_items_count.toString() : '0',
      change: '0',
      isPositive: false,
      icon: AlertTriangle,
      href: '/inventory',
    },
    {
      title: t('kpiPendingPOs'),
      value: poStats ? poStats.pending_orders.toString() : '0',
      change: '+0.0%',
      isPositive: true,
      icon: ArrowDownLeft,
      href: '/purchase-orders',
    },
    {
      title: t('kpiActiveSOs'),
      value: soStats ? soStats.pending_fulfillment.toString() : '0',
      change: '+0.0%',
      isPositive: true,
      icon: ArrowUpRight,
      href: '/outbound-orders',
    },
  ];
  // Dynamic KPI calculations based on real records and date range comparison
  const metrics = useMemo(() => {
    const now = new Date();
    let currentStart: Date;
    let prevStart: Date;
    let prevEnd: Date;
    let comparisonLabel: string;

    switch (selectedDateRange) {
      case 'today': {
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        comparisonLabel = t('vsYesterday');
        break;
      }
      case 'last_7d': {
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        prevEnd = new Date(currentStart.getTime());
        comparisonLabel = t('vsPrev7Days');
        break;
      }
      case 'this_month': {
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        comparisonLabel = t('vsLastMonth');
        break;
      }
      case 'last_30d': {
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        prevEnd = new Date(currentStart.getTime());
        comparisonLabel = t('vsPrev30Days');
        break;
      }
      case 'all_time':
      default: {
        currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        comparisonLabel = t('vsLastYear');
        break;
      }
    }

    // 1. Total Catalog Products
    const prodsInCurrent = productsList.filter((p) => {
      const d = new Date(p.created_at);
      return d >= currentStart;
    }).length;
    const prodsInPrev = productsList.filter((p) => {
      const d = new Date(p.created_at);
      return d >= prevStart && d <= prevEnd;
    }).length;

    let prodChange = '+0.0%';
    let prodIsPositive = true;
    if (prodsInPrev > 0) {
      const pct = ((prodsInCurrent - prodsInPrev) / prodsInPrev) * 100;
      prodChange = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      prodIsPositive = pct >= 0;
    } else if (prodsInCurrent > 0) {
      const base = Math.max(totalProducts - prodsInCurrent, 1);
      const pct = (prodsInCurrent / base) * 100;
      prodChange = '+' + pct.toFixed(1) + '%';
      prodIsPositive = true;
    }

    // 2. Total Stock on Hand
    const currentStock = invStats ? invStats.total_on_hand : 0;
    const netFlow = flowTotals.inbound - flowTotals.outbound;
    const baselineStock = Math.max(currentStock - netFlow, 1);
    let stockChange = '+0.0%';
    let stockIsPositive = true;
    if (currentStock > 0 && netFlow !== 0) {
      const pct = (netFlow / baselineStock) * 100;
      stockChange = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      stockIsPositive = pct >= 0;
    }

    // 3. Low-Stock Alerts
    const lowStockCount = invStats ? invStats.low_stock_items_count : 0;
    const totalItems = invStats ? invStats.total_items_count : 0;
    const lowStockRatio = totalItems > 0 ? (lowStockCount / totalItems) * 100 : 0;
    const isLowStockWarning = lowStockCount > 0;
    const lowStockChange = isLowStockWarning
      ? `${lowStockRatio.toFixed(1)}%`
      : '0.0%';
    const lowStockLabel = isLowStockWarning
      ? t('catalogLow')
      : t('stockHealthy');

    // 4. Pending Inbound POs
    const posInCurrent = poList.filter((po) => {
      const d = new Date(po.created_at);
      return d >= currentStart;
    }).length;
    const posInPrev = poList.filter((po) => {
      const d = new Date(po.created_at);
      return d >= prevStart && d <= prevEnd;
    }).length;
    let poChange = '+0.0%';
    let poIsPositive = true;
    if (posInPrev > 0) {
      const pct = ((posInCurrent - posInPrev) / posInPrev) * 100;
      poChange = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      poIsPositive = pct >= 0;
    } else if (posInCurrent > 0) {
      poChange = '+100.0%';
      poIsPositive = true;
    } else if (poStats && poStats.total_orders > 0 && poStats.pending_orders > 0) {
      const pct = (poStats.pending_orders / poStats.total_orders) * 100;
      poChange = pct.toFixed(1) + '%';
      poIsPositive = true;
    }

    // 5. Active Outbound Orders
    const sosInCurrent = soList.filter((so) => {
      const d = new Date(so.created_at);
      return d >= currentStart;
    }).length;
    const sosInPrev = soList.filter((so) => {
      const d = new Date(so.created_at);
      return d >= prevStart && d <= prevEnd;
    }).length;
    let soChange = '+0.0%';
    let soIsPositive = true;
    if (sosInPrev > 0) {
      const pct = ((sosInCurrent - sosInPrev) / sosInPrev) * 100;
      soChange = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      soIsPositive = pct >= 0;
    } else if (sosInCurrent > 0) {
      soChange = '+100.0%';
      soIsPositive = true;
    } else if (soStats && soStats.total_orders > 0 && soStats.pending_fulfillment > 0) {
      const pct = (soStats.pending_fulfillment / soStats.total_orders) * 100;
      soChange = pct.toFixed(1) + '%';
      soIsPositive = true;
    }

    return [
      {
        title: t('kpiTotalProducts'),
        value: totalProducts.toString(),
        change: prodChange,
        isPositive: prodIsPositive,
        comparisonLabel,
        icon: Package,
        href: '/products',
      },
      {
        title: t('kpiTotalStock'),
        value: invStats ? invStats.total_on_hand.toLocaleString() : '0',
        change: stockChange,
        isPositive: stockIsPositive,
        comparisonLabel,
        icon: Boxes,
        href: '/inventory',
      },
      {
        title: t('kpiLowStock'),
        value: lowStockCount.toString(),
        change: lowStockChange,
        isPositive: !isLowStockWarning,
        comparisonLabel: lowStockLabel,
        icon: AlertTriangle,
        href: '/inventory',
      },
      {
        title: t('kpiPendingPOs'),
        value: poStats ? poStats.pending_orders.toString() : '0',
        change: poChange,
        isPositive: poIsPositive,
        comparisonLabel,
        icon: ArrowDownLeft,
        href: '/purchase-orders',
      },
      {
        title: t('kpiActiveSOs'),
        value: soStats ? soStats.pending_fulfillment.toString() : '0',
        change: soChange,
        isPositive: soIsPositive,
        comparisonLabel,
        icon: ArrowUpRight,
        href: '/outbound-orders',
      },
    ];
  }, [
    totalProducts,
    invStats,
    poStats,
    soStats,
    productsList,
    poList,
    soList,
    flowTotals,
    selectedDateRange,
    language,
    t,
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-7">
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
              {t('dashboardTitle')}
            </h1>
            <p className="mt-1 text-sm text-[#8B8B99] dark:text-slate-400">
              {t('dashboardSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Interactive Calendar Filter Dropdown */}
            <div className="relative" ref={dateMenuRef}>
              <button
                type="button"
                onClick={() => setIsDateMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-[#1B1B1F] dark:text-white shadow-xs hover:border-[#7C6EF0] transition-colors cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-[#7C6EF0]" />
                <span>{selectedDateLabel}</span>
                <ChevronDown className="w-4 h-4 text-[#8B8B99] dark:text-slate-400 ml-0.5" />
              </button>

              {isDateMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl border border-[#EEEDF5] dark:border-slate-700 shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8B8B99] dark:text-slate-400 border-b border-[#EEEDF5] dark:border-slate-700/60 mb-1">
                    {t('filter')}
                  </div>
                  {dateOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSelectedDateRange(opt.id);
                        if (opt.id === 'today' || opt.id === 'last_7d' || opt.id === 'last_30d') {
                          setChartPeriod('daily');
                        } else {
                          setChartPeriod('monthly');
                        }
                        setIsDateMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left font-medium text-[#1B1B1F] dark:text-slate-200 hover:bg-[#F4F3FF] dark:hover:bg-slate-700/60 hover:text-[#7C6EF0] transition-colors cursor-pointer"
                    >
                      <span>{opt.label}</span>
                      {selectedDateRange === opt.id && (
                        <Check className="w-3.5 h-3.5 text-[#7C6EF0]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Action Links */}
            <Link
              href="/purchase-orders"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-[#1B1B1F] dark:text-white hover:border-[#7C6EF0] hover:text-[#7C6EF0] transition-colors shadow-xs"
            >
              <FileDown className="w-4 h-4 stroke-[1.8]" />
              <span>New PO</span>
            </Link>

            <Link
              href="/outbound-orders"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] text-white text-sm font-semibold hover:bg-[#6C5CE7] transition-all shadow-sm shadow-[#7C6EF0]/20"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Sales Order</span>
            </Link>
          </div>
        </div>

        {/* 1. KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {metrics.map((m, idx) => (
            <Link
              key={idx}
              href={m.href}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 p-5 hover:border-[#C7BFFA] dark:hover:border-slate-700 transition-all group block shadow-xs"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#8B8B99] dark:text-slate-400">
                  {m.title}
                </span>
                <div className="w-7 h-7 rounded-full border border-[#EEEDF5] dark:border-slate-800 flex items-center justify-center text-[#8B8B99] dark:text-slate-400 group-hover:text-[#7C6EF0] group-hover:border-[#C7BFFA] transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="mt-2">
                <p className="text-3xl font-extrabold text-[#1B1B1F] dark:text-white tracking-tight">
                  {m.value}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    m.isPositive
                      ? 'bg-[#E4F7EC] text-[#1FAA59]'
                      : 'bg-[#FBE8EA] text-[#E0475C]'
                  }`}
                >
                  {m.isPositive ? (
                    <ArrowUp className="w-2.5 h-2.5 stroke-[2.5]" />
                  ) : (
                    <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                  )}
                  {m.change}
                </span>
                <span className="text-xs text-[#8B8B99] dark:text-slate-400">vs last month</span>
                <span className="text-xs text-[#8B8B99] dark:text-slate-400">{m.comparisonLabel}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* 2. Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section 7: Bar Chart Card — Real Inbound vs Outbound Flow */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between transition-colors">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EEEDF5] dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-[#1B1B1F] dark:text-white">
                  {t('chartFlowTitle')}
                </h2>
                <p className="text-xs text-[#8B8B99] dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>{t('chartFlowSubtitle')}</span>
                  <span>•</span>
                  <span className="font-medium text-[#7C6EF0] dark:text-[#9D93F5]">{selectedDateLabel}</span>
                </p>
              </div>

              <div className="flex items-center gap-4">
                {/* Dots Legend */}
                <div className="flex items-center gap-3 text-xs text-[#8B8B99] dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7C6EF0]" />
                    <span>{t('inboundIntake')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#C7BFFA]" />
                    <span>{t('outboundFulfillment')}</span>
                  </div>
                </div>

                {/* Active Period Dropdown Toggle */}
                <select
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value as 'monthly' | 'daily')}
                  className="px-3 py-1 text-xs rounded-full border border-[#EEEDF5] dark:border-slate-700 text-[#1B1B1F] dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#7C6EF0] cursor-pointer"
                >
                  <option value="monthly">{t('chartPeriodMonthly')}</option>
                  <option value="daily">{t('chartPeriodDaily')}</option>
                </select>
              </div>
            </div>

            {/* Bar Chart Canvas with Dynamic Hover Tooltip */}
            <div className="pt-8 pb-4 relative min-h-[220px]">
              {/* Dynamic Callout Tooltip */}
              {hoveredBarIndex !== null && flowPoints[hoveredBarIndex] && (
                <div
                  style={{
                    left: `${((hoveredBarIndex + 0.5) / Math.max(flowPoints.length, 1)) * 100}%`,
                  }}
                  className="absolute top-1 -translate-x-1/2 z-20 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg text-xs pointer-events-none transition-all"
                >
                  <p className="text-[11px] font-bold text-[#1B1B1F] dark:text-white">
                    {flowPoints[hoveredBarIndex].label} {flowPoints[hoveredBarIndex].date ? `(${flowPoints[hoveredBarIndex].date})` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                    <span className="text-[#7C6EF0] font-semibold">
                      +{flowPoints[hoveredBarIndex].inbound} In
                    </span>
                    <span className="text-[#8B8B99] dark:text-slate-500">&bull;</span>
                    <span className="text-[#A78BFA] dark:text-slate-300 font-semibold">
                      -{flowPoints[hoveredBarIndex].outbound} Out
                    </span>
                  </div>
                  {/* Pointer triangle */}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-800 border-b border-r border-[#EEEDF5] dark:border-slate-700 rotate-45" />
                </div>
              )}

              {/* Grid Lines */}
              <div className="space-y-6">
                {[maxBarVal, Math.round(maxBarVal * 0.66), Math.round(maxBarVal * 0.33), 0].map(
                  (val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-[11px] text-[#8B8B99] dark:text-slate-500 w-8 text-right font-mono">
                        {val}
                      </span>
                      <div className="flex-1 border-b border-[#EEEDF5] dark:border-slate-800/80" />
                    </div>
                  )
                )}
              </div>

              {/* Bars Overlay */}
              <div className="absolute inset-0 pt-7 pl-11 pr-3 pb-6 flex items-end justify-between gap-1 sm:gap-3">
                {flowPoints.map((item, idx) => {
                  const inHeightPct = maxBarVal > 0 ? (item.inbound / maxBarVal) * 100 : 0;
                  const outHeightPct = maxBarVal > 0 ? (item.outbound / maxBarVal) * 100 : 0;
                  const isHovered = hoveredBarIndex === idx;

                  return (
                    <div
                      key={idx}
                      onMouseEnter={() => setHoveredBarIndex(idx)}
                      onMouseLeave={() => setHoveredBarIndex(null)}
                      className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                    >
                      <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-[140px]">
                        {/* Inbound Bar */}
                        <div
                          style={{ height: `${Math.max(inHeightPct, item.inbound > 0 ? 5 : 2)}%` }}
                          className={`w-full bg-[#7C6EF0] rounded-t-md transition-all ${
                            isHovered
                              ? 'opacity-100 ring-2 ring-[#7C6EF0]/40 brightness-110'
                              : 'opacity-85 group-hover:opacity-100'
                          }`}
                        />
                        {/* Outbound Bar */}
                        <div
                          style={{ height: `${Math.max(outHeightPct, item.outbound > 0 ? 5 : 2)}%` }}
                          className={`w-full bg-[#C7BFFA] dark:bg-[#A78BFA] rounded-t-md transition-all ${
                            isHovered
                              ? 'opacity-100 ring-2 ring-[#C7BFFA]/40 brightness-110'
                              : 'opacity-85 group-hover:opacity-100'
                          }`}
                        />
                      </div>
                      {/* X-axis Label */}
                      <span
                        className={`text-[11px] font-mono mt-2 transition-colors ${
                          isHovered
                            ? 'text-[#7C6EF0] font-bold'
                            : 'text-[#8B8B99] dark:text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 8: Donut Chart Card — Real Warehouse Capacity */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEEDF5] dark:border-slate-800">
              <h2 className="text-base font-bold text-[#1B1B1F] dark:text-white">
                {t('capacityTitle')}
              </h2>
              <div className="w-7 h-7 rounded-full border border-[#EEEDF5] dark:border-slate-800 flex items-center justify-center text-[#8B8B99] dark:text-slate-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="py-6 flex items-center justify-between gap-4">
              {/* Dynamic Legend List from actual Warehouses */}
              <div className="space-y-3 flex-1 min-w-0 pr-2">
                {capacityData?.warehouses && capacityData.warehouses.length > 0 ? (
                  capacityData.warehouses.map((wh, idx) => (
                    <div key={wh.warehouse_id} className="flex items-center gap-2.5 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: donutColors[idx % donutColors.length] }}
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[#1B1B1F] dark:text-slate-200 font-medium truncate" title={wh.name}>
                          {wh.name}
                        </span>
                        <span className="text-[10px] text-[#8B8B99] dark:text-slate-400 font-mono">
                          {wh.current_stock.toLocaleString()} / {wh.capacity.toLocaleString()} {t('units')}
                        </span>
                      </div>
                      <span className="text-[#8B8B99] dark:text-slate-400 ml-auto font-mono text-[11px] font-semibold flex-shrink-0">
                        {wh.current_stock > 0 && wh.percentage < 0.1 ? '<0.1%' : `${wh.percentage}%`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#8B8B99] dark:text-slate-500 py-4">
                    {t('noWarehousesConfigured')}
                  </div>
                )}
              </div>

              {/* Dynamic Donut Chart Ring with Readable Center Text */}
              <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Background Track */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#EEEDF5"
                    className="stroke-[#EEEDF5] dark:stroke-slate-800"
                    strokeWidth="3.2"
                  />
                  {/* Render dynamic warehouse segments based on actual capacity utilization */}
                  {(() => {
                    let cumulative = 0;
                    return (
                      capacityData?.warehouses.map((wh, idx) => {
                        const shareOfTotal = capacityData.total_capacity > 0
                          ? (wh.current_stock / capacityData.total_capacity) * 100
                          : 0;
                        if (shareOfTotal <= 0) return null;
                        const dashArray = `${shareOfTotal} ${100 - shareOfTotal}`;
                        const dashOffset = -cumulative;
                        cumulative += shareOfTotal;
                        return (
                          <circle
                            key={wh.warehouse_id}
                            cx="18"
                            cy="18"
                            r="15.915"
                            fill="transparent"
                            stroke={donutColors[idx % donutColors.length]}
                            strokeWidth="3.2"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                          />
                        );
                      }) || null
                    );
                  })()}
                </svg>

                {/* Center text: perfectly visible in both light & dark mode */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-[#1B1B1F] dark:text-white tracking-tight">
                    {capacityData
                      ? capacityData.total_on_hand > 0 && capacityData.utilization_rate < 0.1
                        ? '<0.1%'
                        : `${capacityData.utilization_rate}%`
                      : '0%'}
                  </span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#8B8B99] dark:text-slate-400">
                    {t('capacityUtilized')}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Storage Capacity Footer */}
            <div className="pt-3 border-t border-[#EEEDF5] dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-[#8B8B99] dark:text-slate-400">
                <span>{t('totalStorageCapacity')}</span>
                <span className="font-semibold text-[#1B1B1F] dark:text-white">
                  {capacityData?.total_on_hand ? capacityData.total_on_hand.toLocaleString() : '0'} / {capacityData?.total_capacity ? capacityData.total_capacity.toLocaleString() : '0'} {t('units')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Bottom Row: Real Transactions Table & Operational Goals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section 9: Real Transactions Table (NO dummy fallback!) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 p-6 shadow-xs transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEEDF5] dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-[#1B1B1F] dark:text-white">
                  {t('recentOpsTitle')}
                </h2>
                <p className="text-xs text-[#8B8B99] dark:text-slate-400 mt-0.5">
                  {t('recentOpsSubtitle')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/inventory"
                  className="text-xs font-semibold text-[#7C6EF0] hover:text-[#6C5CE7] flex items-center gap-1"
                >
                  <span>{t('seeAll')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto mt-2">
              {movements.length === 0 ? (
                /* Clean Empty State when database has no transactions */
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#F4F3FF] dark:bg-slate-800 text-[#7C6EF0] flex items-center justify-center mb-3">
                    <Inbox className="w-6 h-6 stroke-[1.8]" />
                  </div>
                  <p className="text-sm font-semibold text-[#1B1B1F] dark:text-white">
                    {t('noMovementsTitle')}
                  </p>
                  <p className="text-xs text-[#8B8B99] dark:text-slate-400 max-w-xs mt-1">
                    {t('noMovementsSubtitle')}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#EEEDF5] dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-[#8B8B99] dark:text-slate-400">
                      <th className="py-3.5 px-2">{t('colItemSku')}</th>
                      <th className="py-3.5 px-3">{t('colType')}</th>
                      <th className="py-3.5 px-3">{t('colLocation')}</th>
                      <th className="py-3.5 px-3 text-right">{t('colQuantity')}</th>
                      <th className="py-3.5 px-3 text-right">{t('colTime')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEEDF5] dark:divide-slate-800 text-xs">
                    {movements.map((mov) => {
                      const isPositive = mov.qty > 0;
                      return (
                        <tr
                          key={mov.id}
                          className="hover:bg-[#F9F9FD] dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-3.5 px-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#F4F3FF] dark:bg-slate-800 text-[#7C6EF0] flex items-center justify-center font-bold text-xs flex-shrink-0">
                                <Package className="w-4 h-4 stroke-[1.8]" />
                              </div>
                              <div>
                                <p className="font-semibold text-[#1B1B1F] dark:text-white truncate max-w-[180px] sm:max-w-xs">
                                  {mov.item_name}
                                </p>
                                <p className="text-[11px] font-mono text-[#8B8B99] dark:text-slate-400">
                                  {mov.sku}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                mov.type === 'Inbound'
                                  ? 'bg-[#E4F7EC] text-[#1FAA59]'
                                  : mov.type === 'Outbound'
                                  ? 'bg-[#FBE8EA] text-[#E0475C]'
                                  : 'bg-[#F4F3FF] text-[#7C6EF0]'
                              }`}
                            >
                              {mov.type}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <p className="text-[#1B1B1F] dark:text-slate-200 font-medium truncate max-w-[140px]">
                              {mov.warehouse}
                            </p>
                            <p className="text-[11px] text-[#8B8B99] dark:text-slate-400 font-mono">
                              Bin {mov.location}
                            </p>
                          </td>

                          <td className="py-3.5 px-3 text-right font-semibold font-mono">
                            <span className={isPositive ? 'text-[#1FAA59]' : 'text-[#E0475C]'}>
                              {isPositive ? `+${mov.qty}` : mov.qty}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-right text-[#8B8B99] dark:text-slate-400 font-mono">
                            {mov.time}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section 10: Operational Targets (Dynamically reactive, 0% when empty) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEEDF5] dark:border-slate-800">
              <h2 className="text-base font-bold text-[#1B1B1F] dark:text-white">
                {t('targetsTitle')}
              </h2>
              <div className="w-7 h-7 rounded-full border border-[#EEEDF5] dark:border-slate-800 flex items-center justify-center text-[#8B8B99] dark:text-slate-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Goal Progress Items */}
            <div className="py-4 space-y-5">
              {/* Goal 1: Same-Day Dispatch */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#1B1B1F] dark:text-white">
                    {t('targetSameDay')}
                  </span>
                  <span className="text-[#8B8B99] dark:text-slate-400 font-mono text-[11px]">
                    {soStats && soStats.total_orders > 0
                      ? `${Math.round((soStats.shipped_orders / soStats.total_orders) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F0EFFB] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${
                        soStats && soStats.total_orders > 0
                          ? Math.round((soStats.shipped_orders / soStats.total_orders) * 100)
                          : 0
                      }%`,
                    }}
                    className="h-full bg-[#7C6EF0] rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 2: Inbound PO Intake */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#1B1B1F] dark:text-white">
                    {t('targetInbound')}
                  </span>
                  <span className="text-[#8B8B99] dark:text-slate-400 font-mono text-[11px]">
                    {poStats && poStats.total_orders > 0
                      ? `${Math.round((poStats.completed_orders / poStats.total_orders) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F0EFFB] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${
                        poStats && poStats.total_orders > 0
                          ? Math.round((poStats.completed_orders / poStats.total_orders) * 100)
                          : 0
                      }%`,
                    }}
                    className="h-full bg-[#7C6EF0] rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 3: Storage Bin Utilization */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#1B1B1F] dark:text-white">
                    {t('targetBinUtil')}
                  </span>
                  <span className="text-[#8B8B99] dark:text-slate-400 font-mono text-[11px]">
                    {capacityData ? `${capacityData.utilization_rate}%` : '0%'}
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F0EFFB] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${capacityData ? capacityData.utilization_rate : 0}%` }}
                    className="h-full bg-[#7C6EF0] rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 4: Ledger Audit Activity */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#1B1B1F] dark:text-white">
                    {t('targetLedger')}
                  </span>
                  <span className="text-[#8B8B99] dark:text-slate-400 font-mono text-[11px]">
                    {movements.length > 0 ? t('active') : t('standby')}
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F0EFFB] dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: movements.length > 0 ? '100%' : '0%' }}
                    className="h-full bg-[#7C6EF0] rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#EEEDF5] dark:border-slate-800">
              <p className="text-[11px] text-[#8B8B99] dark:text-slate-400 text-center">
                {t('targetsFooter')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
