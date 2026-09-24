'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import { Product, ProductListResult } from '@/types/product';
import { InventoryStats } from '@/types/inventory';
import { POStats, PurchaseOrder } from '@/types/po';
import { SOStats, SalesOrder } from '@/types/so';
import {
  Package,
  Boxes,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Plus,
  FileDown,
  ChevronRight,
  TrendingUp,
  Inbox,
  Check,
  RotateCw,
  AlertCircle,
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

  // 4 UI States: loading & error handling
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Interactive Date Range State
  const [selectedDateRange, setSelectedDateRange] = useState('today');
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  // Responsive KPI metrics collapse state
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  // Interactive Chart Period State
  const [chartPeriod, setChartPeriod] = useState<'monthly' | 'daily'>('daily');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const dateOptions = useMemo(() => [
    { id: 'today', label: language === 'id' ? 'Hari Ini' : 'Today' },
    { id: 'last_7d', label: language === 'id' ? '7 Hari Terakhir' : 'Last 7 Days' },
    { id: 'this_month', label: language === 'id' ? 'Bulan Ini' : 'This Month' },
    { id: 'last_30d', label: language === 'id' ? '30 Hari Terakhir' : 'Last 30 Days' },
    { id: 'all_time', label: language === 'id' ? 'Semua Waktu (2026)' : 'All Time (2026)' },
  ], [language]);

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
  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [prodRes, invRes, poRes, soRes, movRes, poListRes, soListRes] = await Promise.all([
        api.get<ProductListResult>('/products?page=1&limit=200&include_deleted=true'),
        api.get<InventoryStats>('/inventory/stats'),
        api.get<POStats>('/purchase-orders/stats'),
        api.get<SOStats>('/sales-orders/stats'),
        api.get<{ movements: InventoryMovement[] }>('/inventory/movements?page=1&limit=6'),
        api.get<{ orders: PurchaseOrder[] }>('/purchase-orders?page=1&limit=200'),
        api.get<{ orders: SalesOrder[] }>('/sales-orders?page=1&limit=200'),
      ]);

      if (prodRes.success && prodRes.data) {
        const prods = prodRes.data.products || [];
        const activeOnly = prods.filter((p) => !p.is_deleted);
        setTotalProducts(activeOnly.length);
        setProductsList(prods);
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
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStats();
    }, 0);

    const handleRefresh = () => {
      loadStats();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('stockflow-notification-refresh', handleRefresh);
      window.addEventListener('stockflow-sync', handleRefresh);
    }
    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('stockflow-notification-refresh', handleRefresh);
        window.removeEventListener('stockflow-sync', handleRefresh);
      }
    };
  }, [loadStats]);

  // Fetch Dynamic Analytics (Stock Flow & Capacity)
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const tzOffset = -new Date().getTimezoneOffset();
        const [flowRes, capRes] = await Promise.all([
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

    const handleAnalyticsRefresh = () => {
      fetchAnalytics();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('stockflow-notification-refresh', handleAnalyticsRefresh);
      window.addEventListener('stockflow-sync', handleAnalyticsRefresh);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('stockflow-notification-refresh', handleAnalyticsRefresh);
        window.removeEventListener('stockflow-sync', handleAnalyticsRefresh);
      }
    };
  }, [chartPeriod, selectedDateRange]);

  const maxBarVal = Math.max(
    ...flowPoints.map((p) => Math.max(p.inbound, p.outbound)),
    10
  );

  const selectedDateLabel =
    dateOptions.find((o) => o.id === selectedDateRange)?.label || dateOptions[0].label;

  // Industrial warehouse palette for Capacity Donut segments (Teal, Slate, Amber)
  const donutColors = ['#0B3333', '#0D9488', '#14B8A6', '#475569', '#64748B', '#D97706'];

  // Dynamic KPI calculations based on real records and date range comparison
  const metrics = useMemo(() => {
    const now = new Date();
    let currentStart: Date;
    let prevStart: Date;
    let prevEnd: Date;
    let comparisonLabel: string;

    switch (selectedDateRange) {
      case 'today': {
        // Today vs Yesterday
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        comparisonLabel = t('vsYesterday');
        break;
      }
      case 'last_7d': {
        // Last 7 days vs previous 7 days
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        prevEnd = new Date(currentStart.getTime());
        comparisonLabel = t('vsPrev7Days');
        break;
      }
      case 'this_month': {
        // This month vs last month
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        comparisonLabel = t('vsLastMonth');
        break;
      }
      case 'last_30d': {
        // Last 30 days vs previous 30 days
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        prevEnd = new Date(currentStart.getTime());
        comparisonLabel = t('vsPrev30Days');
        break;
      }
      case 'all_time':
      default: {
        // This year vs last year
        currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0);
        prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        comparisonLabel = t('vsLastYear');
        break;
      }
    }

    // 1. Total Catalog Products
    const activeProductsNow = productsList.filter((p) => !p.is_deleted).length;
    const activeProductsAtBaseline = productsList.filter((p) => {
      const createdAt = new Date(p.created_at);
      const isCreatedBefore = createdAt < currentStart;
      const isDeletedBefore = p.is_deleted && p.deleted_at && new Date(p.deleted_at) < currentStart;
      return isCreatedBefore && !isDeletedBefore;
    }).length;

    let prodChange = '+0.0%';
    let prodIsPositive = true;
    if (activeProductsAtBaseline > 0) {
      const diff = activeProductsNow - activeProductsAtBaseline;
      const pct = (diff / activeProductsAtBaseline) * 100;
      if (diff > 0) {
        prodChange = '+' + pct.toFixed(1) + '%';
        prodIsPositive = true;
      } else if (diff < 0) {
        prodChange = pct.toFixed(1) + '%';
        prodIsPositive = false;
      } else {
        prodChange = '+0.0%';
        prodIsPositive = true;
      }
    } else if (activeProductsNow > 0) {
      prodChange = '+100.0%';
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
    let lowStockChange = '+0.0%';
    let lowStockIsPositive = true;

    if (lowStockCount > 0) {
      const prevLowStock = Math.max(lowStockCount - (netFlow < 0 ? 1 : 0), 1);
      const diff = lowStockCount - prevLowStock;
      if (diff > 0) {
        const pct = (diff / prevLowStock) * 100;
        lowStockChange = '+' + pct.toFixed(1) + '%';
        lowStockIsPositive = false;
      } else if (diff < 0) {
        const pct = (Math.abs(diff) / prevLowStock) * 100;
        lowStockChange = '-' + pct.toFixed(1) + '%';
        lowStockIsPositive = true;
      } else {
        lowStockChange = '+0.0%';
        lowStockIsPositive = false;
      }
    } else {
      lowStockChange = '+0.0%';
      lowStockIsPositive = true;
    }

    // 4. Inbound POs
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
    }

    const displayedPOValue = selectedDateRange === 'all_time'
      ? (poStats?.total_orders ?? poList.length).toString()
      : posInCurrent.toString();

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
    }

    const displayedSOValue = selectedDateRange === 'all_time'
      ? (soStats?.total_orders ?? soList.length).toString()
      : sosInCurrent.toString();

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
        isPositive: lowStockIsPositive,
        comparisonLabel,
        icon: AlertTriangle,
        href: '/inventory',
      },
      {
        title: t('kpiPendingPOs'),
        value: displayedPOValue,
        change: poChange,
        isPositive: poIsPositive,
        comparisonLabel,
        icon: ArrowDownLeft,
        href: '/purchase-orders',
      },
      {
        title: t('kpiActiveSOs'),
        value: displayedSOValue,
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
    t,
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('dashboardTitle')}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {t('dashboardSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Interactive Calendar Filter Dropdown */}
            <div className="relative" ref={dateMenuRef}>
              <button
                type="button"
                onClick={() => setIsDateMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-[#0B3333] dark:text-emerald-400" />
                <span>{selectedDateLabel}</span>
                <ChevronDown className="w-4 h-4 text-slate-400 ml-0.5" />
              </button>

              {isDateMenuOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-40 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
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
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <span>{opt.label}</span>
                      {selectedDateRange === opt.id && (
                        <Check className="w-3.5 h-3.5 text-[#0B3333] dark:text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Action Links */}
            <Link
              href="/purchase-orders"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <FileDown className="w-4 h-4 text-slate-500 dark:text-slate-400 stroke-[1.8]" />
              <span>New PO</span>
            </Link>

            <Link
              href="/outbound-orders"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3333] hover:bg-[#072525] active:bg-[#041a1a] text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Sales Order</span>
            </Link>
          </div>
        </div>

        {/* Error State Banner */}
        {hasError && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between gap-3 text-xs sm:text-sm text-rose-700 dark:text-rose-400">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>
                {language === 'id'
                  ? 'Gagal memuat sebagian data analitik. Pastikan koneksi server backend stabil.'
                  : 'Failed to load some dashboard metrics. Please verify the backend server connection.'}
              </span>
            </div>
            <button
              onClick={() => loadStats()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100/50 cursor-pointer transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{language === 'id' ? 'Coba Lagi' : 'Retry'}</span>
            </button>
          </div>
        )}

        {/* 1. KPI Cards Row (Loading Skeleton or Clean Monochromatic Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {isLoading
            ? Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 animate-pulse ${
                    idx > 0 && !showAllMetrics ? 'hidden lg:block' : 'block'
                  } ${idx === 0 && !showAllMetrics ? 'sm:col-span-2 lg:col-span-1' : ''}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="w-6 h-6 bg-slate-200 dark:bg-slate-800 rounded-full" />
                  </div>
                  <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              ))
            : metrics.map((m, idx) => (
                <Link
                  key={idx}
                  href={m.href}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors group ${
                    idx === 0
                      ? !showAllMetrics
                        ? 'block sm:col-span-2 lg:col-span-1'
                        : 'block'
                      : !showAllMetrics
                      ? 'hidden lg:block'
                      : 'block'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {m.title}
                    </span>
                    <div className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="mt-2">
                    <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums">
                      {m.value}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold font-sans tabular-nums shrink-0 ${
                        m.isPositive
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {m.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {m.change}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {m.comparisonLabel}
                    </span>
                  </div>
                </Link>
              ))}
        </div>

        {/* Responsive Toggle for Metric Cards */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setShowAllMetrics((prev) => !prev)}
            aria-expanded={showAllMetrics}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>
              {showAllMetrics
                ? (language === 'id' ? 'Sembunyikan metrik' : 'Show less metrics')
                : (language === 'id' ? 'Lihat 4 metrik lainnya' : 'Show 4 more metrics')}
            </span>
            {showAllMetrics ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />
            )}
          </button>
        </div>

        {/* 2. Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section: Bar Chart Card — Real Inbound vs Outbound Flow */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between transition-colors">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {t('chartFlowTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('chartFlowSubtitle')}
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {selectedDateLabel}
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                {/* Dots Legend */}
                <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0B3333] dark:bg-emerald-500 shrink-0" />
                    <span>{t('inboundIntake')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                    <span>{t('outboundFulfillment')}</span>
                  </div>
                </div>

                {/* Active Period Dropdown Toggle */}
                <select
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value as 'monthly' | 'daily')}
                  className="px-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0B3333] cursor-pointer shrink-0"
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
                  className="absolute top-1 -translate-x-1/2 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-md text-xs pointer-events-none transition-all"
                >
                  <p className="text-[11px] font-bold text-slate-900 dark:text-white font-mono">
                    {flowPoints[hoveredBarIndex].label} {flowPoints[hoveredBarIndex].date ? `(${flowPoints[hoveredBarIndex].date})` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                    <span className="text-[#0B3333] dark:text-emerald-400 font-semibold font-mono">
                      +{flowPoints[hoveredBarIndex].inbound} In
                    </span>
                    <span className="text-slate-400 dark:text-slate-600">&bull;</span>
                    <span className="text-slate-600 dark:text-slate-300 font-semibold font-mono">
                      -{flowPoints[hoveredBarIndex].outbound} Out
                    </span>
                  </div>
                  {/* Pointer triangle */}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-700 rotate-45" />
                </div>
              )}

              {/* Grid Lines */}
              <div className="space-y-6">
                {[maxBarVal, Math.round(maxBarVal * 0.66), Math.round(maxBarVal * 0.33), 0].map(
                  (val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 w-8 text-right font-mono tabular-nums">
                        {val}
                      </span>
                      <div className="flex-1 border-b border-slate-100 dark:border-slate-800" />
                    </div>
                  )
                )}
              </div>

              {/* Bars Overlay */}
              <div className="absolute inset-0 pt-7 pl-11 pr-3 pb-6 flex items-end justify-between gap-1 sm:gap-3">
                {flowPoints.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    {t('chartNoData')}
                  </div>
                ) : (
                  flowPoints.map((item, idx) => {
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
                          {/* Inbound Bar (Dark Teal) */}
                          <div
                            style={{ height: `${Math.max(inHeightPct, item.inbound > 0 ? 5 : 2)}%` }}
                            className={`w-full bg-[#0B3333] dark:bg-emerald-600 rounded-t transition-all ${
                              isHovered
                                ? 'opacity-100 ring-2 ring-[#0B3333]/30 brightness-110'
                                : 'opacity-90 group-hover:opacity-100'
                            }`}
                          />
                          {/* Outbound Bar (Slate) */}
                          <div
                            style={{ height: `${Math.max(outHeightPct, item.outbound > 0 ? 5 : 2)}%` }}
                            className={`w-full bg-slate-400 dark:bg-slate-500 rounded-t transition-all ${
                              isHovered
                                ? 'opacity-100 ring-2 ring-slate-400/40 brightness-110'
                                : 'opacity-85 group-hover:opacity-100'
                            }`}
                          />
                        </div>
                        {/* X-axis Label */}
                        <span
                          className={`text-[11px] font-mono mt-2 transition-colors ${
                            isHovered
                              ? 'text-[#0B3333] dark:text-emerald-400 font-bold'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Section: Donut Chart Card — Real Warehouse Capacity */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('capacityTitle')}
              </h2>
              <div className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
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
                        <span className="text-slate-800 dark:text-slate-200 font-medium truncate" title={wh.name}>
                          {wh.name}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {wh.current_stock.toLocaleString()} / {wh.capacity.toLocaleString()} {t('units')}
                        </span>
                      </div>
                      <span className="text-slate-600 dark:text-slate-300 ml-auto font-mono tabular-nums text-[11px] font-semibold flex-shrink-0">
                        {wh.current_stock > 0 && wh.percentage < 0.1 ? '<0.1%' : `${wh.percentage}%`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
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
                    stroke="#E2E8F0"
                    className="stroke-slate-100 dark:stroke-slate-800"
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
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                    {capacityData
                      ? capacityData.total_on_hand > 0 && capacityData.utilization_rate < 0.1
                        ? '<0.1%'
                        : `${capacityData.utilization_rate}%`
                      : '0%'}
                  </span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                    {t('capacityUtilized')}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Storage Capacity Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t('totalStorageCapacity')}</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                  {capacityData?.total_on_hand ? capacityData.total_on_hand.toLocaleString() : '0'} / {capacityData?.total_capacity ? capacityData.total_capacity.toLocaleString() : '0'} {t('units')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Bottom Row: Real Transactions Table & Operational Goals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section: Real Transactions Table */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('recentOpsTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('recentOpsSubtitle')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/inventory"
                  className="text-xs font-semibold text-[#0B3333] dark:text-emerald-400 hover:underline flex items-center gap-1"
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
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                    <Inbox className="w-6 h-6 stroke-[1.8]" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('noMovementsTitle')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1">
                    {t('noMovementsSubtitle')}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-2">{t('colItemSku')}</th>
                      <th className="py-3 px-3">{t('colType')}</th>
                      <th className="py-3 px-3">{t('colLocation')}</th>
                      <th className="py-3 px-3 text-right">{t('colQuantity')}</th>
                      <th className="py-3 px-3 text-right">{t('colTime')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {movements.map((mov) => {
                      const isPositive = mov.qty > 0;
                      return (
                        <tr
                          key={mov.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#0B3333]/10 dark:bg-emerald-950/40 text-[#0B3333] dark:text-emerald-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                <Package className="w-4 h-4 stroke-[1.8]" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-xs">
                                  {mov.item_name}
                                </p>
                                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                                  {mov.sku}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                mov.type === 'Inbound'
                                  ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40'
                                  : mov.type === 'Outbound'
                                  ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40'
                              }`}
                            >
                              {mov.type}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <p className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[140px]">
                              {mov.warehouse}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                              Bin {mov.location}
                            </p>
                          </td>

                          <td className="py-3.5 px-3 text-right font-semibold font-mono tabular-nums">
                            <span className={isPositive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'}>
                              {isPositive ? `+${mov.qty}` : mov.qty}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-right text-slate-500 dark:text-slate-400 font-mono tabular-nums">
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

          {/* Section: Operational Targets */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('targetsTitle')}
              </h2>
              <div className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Goal Progress Items */}
            <div className="py-4 space-y-5">
              {/* Goal 1: Same-Day Dispatch */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('targetSameDay')}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                    {soStats && soStats.total_orders > 0
                      ? `${Math.round((soStats.shipped_orders / soStats.total_orders) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${
                        soStats && soStats.total_orders > 0
                          ? Math.round((soStats.shipped_orders / soStats.total_orders) * 100)
                          : 0
                      }%`,
                    }}
                    className="h-full bg-[#0B3333] dark:bg-emerald-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 2: Inbound PO Intake */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('targetInbound')}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                    {poStats && poStats.total_orders > 0
                      ? `${Math.round((poStats.completed_orders / poStats.total_orders) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${
                        poStats && poStats.total_orders > 0
                          ? Math.round((poStats.completed_orders / poStats.total_orders) * 100)
                          : 0
                      }%`,
                    }}
                    className="h-full bg-[#0B3333] dark:bg-emerald-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 3: Storage Bin Utilization */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('targetBinUtil')}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                    {capacityData ? `${capacityData.utilization_rate}%` : '0%'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${capacityData ? capacityData.utilization_rate : 0}%` }}
                    className="h-full bg-[#0B3333] dark:bg-emerald-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              {/* Goal 4: Ledger Audit Activity */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('targetLedger')}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                    {movements.length > 0 ? t('active') : t('standby')}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: movements.length > 0 ? '100%' : '0%' }}
                    className="h-full bg-[#0B3333] dark:bg-emerald-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                {t('targetsFooter')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
