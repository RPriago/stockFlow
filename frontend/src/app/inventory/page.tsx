'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import {
  InventoryItem,
  InventoryMovement,
  InventoryStats,
} from '@/types/inventory';
import { Product } from '@/types/product';
import { Warehouse, Location } from '@/types/warehouse';
import {
  Boxes,
  Plus,
  Minus,
  Scale,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Warehouse as WarehouseIcon,
  MapPin,
  RefreshCw,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export default function InventoryPage() {
  const { role } = useAuth();
  const { t, language } = useLanguage();
  const canAdjust = role === 'super_admin' || role === 'warehouse_manager';

  // Data states
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<Record<string, Location[]>>({});

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isMovementsLoading, setIsMovementsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<'balances' | 'ledger'>('balances');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('');

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showStockInModal, setShowStockInModal] = useState(false);
  const [showStockOutModal, setShowStockOutModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Form states with number | '' to allow clearable typing without sticky zero
  const [formWhId, setFormWhId] = useState('');
  const [formLocId, setFormLocId] = useState('');
  const [formProdId, setFormProdId] = useState('');
  const [formVariantId, setFormVariantId] = useState('');
  const [formQuantity, setFormQuantity] = useState<number | ''>(10);
  const [formActualQty, setFormActualQty] = useState<number | ''>('');
  const [formRefType, setFormRefType] = useState('manual');
  const [formRefId, setFormRefId] = useState('');
  const [formReason, setFormReason] = useState('Stock Opname reconciliation');
  const [formNotes, setFormNotes] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Track max available stock for Stock Out
  const [maxAvailableForSelected, setMaxAvailableForSelected] = useState<number | null>(null);
  const [currentOnHandForAdjust, setCurrentOnHandForAdjust] = useState<number>(0);

  // Auto-dismiss alerts
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Load supporting dropdown metadata (Warehouses & Products)
  const loadMetadata = useCallback(async () => {
    try {
      const [whRes, prodRes] = await Promise.all([
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ products: Product[] }>('/products?limit=100'),
      ]);

      if (whRes.data) {
        setWarehouses(whRes.data || []);
      }
      if (prodRes.data) {
        setProducts(prodRes.data.products || []);
      }
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  }, []);

  // Fetch locations for a warehouse if not already cached
  const fetchLocationsForWh = useCallback(async (whId: string) => {
    if (!whId || warehouseLocations[whId]) return warehouseLocations[whId] || [];
    try {
      const res = await api.get<Location[]>(`/warehouses/${whId}/locations`);
      if (res.data) {
        const locs = res.data;
        setWarehouseLocations((prev) => ({ ...prev, [whId]: locs }));
        return locs;
      }
    } catch (err) {
      console.error('Failed to load locations', err);
    }
    return [];
  }, [warehouseLocations]);

  // Fetch Inventory Balances
  const fetchInventory = useCallback(async () => {
    try {
      let query = `?limit=100`;
      if (selectedWarehouseId) query += `&warehouse_id=${selectedWarehouseId}`;
      if (lowStockOnly) query += `&low_stock=true`;
      if (searchQuery.trim()) query += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await api.get<{ items: InventoryItem[] }>(`/inventory${query}`);
      if (res.data) {
        setItems(res.data.items || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch inventory balances');
    }
  }, [selectedWarehouseId, lowStockOnly, searchQuery]);

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<InventoryStats>('/inventory/stats');
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }, []);

  // Fetch Movements Ledger
  const fetchMovements = useCallback(async () => {
    setIsMovementsLoading(true);
    try {
      let query = `?limit=100`;
      if (selectedWarehouseId) query += `&warehouse_id=${selectedWarehouseId}`;
      if (movementTypeFilter) query += `&movement_type=${movementTypeFilter}`;

      const res = await api.get<{ movements: InventoryMovement[] }>(`/inventory/movements${query}`);
      if (res.data) {
        setMovements(res.data.movements || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch movements history');
    } finally {
      setIsMovementsLoading(false);
    }
  }, [selectedWarehouseId, movementTypeFilter]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadMetadata(), fetchInventory(), fetchStats(), fetchMovements()]);
      setIsLoading(false);
    };
    init();
  }, [loadMetadata, fetchInventory, fetchStats, fetchMovements]);

  // Re-fetch balances on filter changes
  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Re-fetch movements when tab or filter changes
  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchMovements();
    }
  }, [activeTab, fetchMovements]);

  // When formWhId changes, prefetch its locations
  useEffect(() => {
    if (formWhId) {
      fetchLocationsForWh(formWhId).then((locs) => {
        if (locs.length > 0 && (!formLocId || !locs.some((l) => l.id === formLocId))) {
          setFormLocId(locs[0].id);
        }
      });
    }
  }, [formWhId, fetchLocationsForWh, formLocId]);

  // Calculate available stock when in Stock Out or Adjust
  useEffect(() => {
    if (formWhId && formLocId && formProdId) {
      const match = items.find(
        (i) =>
          i.warehouse_id === formWhId &&
          i.location_id === formLocId &&
          i.product_id === formProdId &&
          (formVariantId ? i.variant_id === formVariantId : !i.variant_id)
      );
      if (match) {
        setMaxAvailableForSelected(match.quantity_available);
        setCurrentOnHandForAdjust(match.quantity_on_hand);
      } else {
        setMaxAvailableForSelected(0);
        setCurrentOnHandForAdjust(0);
      }
    } else {
      setMaxAvailableForSelected(null);
      setCurrentOnHandForAdjust(0);
    }
  }, [formWhId, formLocId, formProdId, formVariantId, items]);

  // Open modals pre-populated from a table row
  const openStockInForRow = (item: InventoryItem) => {
    setFormWhId(item.warehouse_id);
    setFormLocId(item.location_id);
    setFormProdId(item.product_id);
    setFormVariantId(item.variant_id || '');
    setFormQuantity(10);
    setFormRefType('manual');
    setFormRefId('STOCK-IN-' + Math.floor(1000 + Math.random() * 9000));
    setFormNotes(`Restock for ${item.product_name}`);
    setModalError(null);
    setShowStockInModal(true);
  };

  const openStockOutForRow = (item: InventoryItem) => {
    setFormWhId(item.warehouse_id);
    setFormLocId(item.location_id);
    setFormProdId(item.product_id);
    setFormVariantId(item.variant_id || '');
    setFormQuantity(Math.min(5, Math.max(1, item.quantity_available)));
    setFormRefType('manual');
    setFormRefId('STOCK-OUT-' + Math.floor(1000 + Math.random() * 9000));
    setFormNotes(`Dispatched from bin ${item.location_code}`);
    setMaxAvailableForSelected(item.quantity_available);
    setModalError(null);
    setShowStockOutModal(true);
  };

  const openAdjustForRow = (item: InventoryItem) => {
    setFormWhId(item.warehouse_id);
    setFormLocId(item.location_id);
    setFormProdId(item.product_id);
    setFormVariantId(item.variant_id || '');
    setCurrentOnHandForAdjust(item.quantity_on_hand);
    setFormActualQty(item.quantity_on_hand);
    setFormReason('Stock Opname discrepancy');
    setFormNotes(`Reconciliation for ${item.location_code}`);
    setModalError(null);
    setShowAdjustModal(true);
  };

  // Helper to calculate current occupancy of a bin from loaded items
  const getBinOccupancy = useCallback(
    (locId: string, excludeProdId?: string, excludeVarId?: string) => {
      if (!locId || !items) return 0;
      return items
        .filter((it) => {
          if (it.location_id !== locId) return false;
          if (excludeProdId && it.product_id === excludeProdId && (it.variant_id || '') === (excludeVarId || '')) {
            return false;
          }
          return true;
        })
        .reduce((sum, it) => sum + (it.quantity_on_hand || 0), 0);
    },
    [items]
  );

  // Generic Open modal button handlers
  const openNewStockIn = () => {
    if (warehouses && warehouses.length > 0) setFormWhId(warehouses[0].id);
    if (products && products.length > 0) {
      setFormProdId(products[0].id);
      setFormVariantId('');
    }
    setFormQuantity(20);
    setFormRefType('po');
    setFormRefId('PO-' + Math.floor(1000 + Math.random() * 9000));
    setFormNotes('Inbound inventory intake');
    setModalError(null);
    setShowStockInModal(true);
  };

  const openNewStockOut = () => {
    if (warehouses && warehouses.length > 0) setFormWhId(warehouses[0].id);
    if (products && products.length > 0) {
      setFormProdId(products[0].id);
      setFormVariantId('');
    }
    setFormQuantity(5);
    setFormRefType('so');
    setFormRefId('SO-' + Math.floor(1000 + Math.random() * 9000));
    setFormNotes('Customer order dispatch');
    setModalError(null);
    setShowStockOutModal(true);
  };

  const openNewAdjust = () => {
    if (warehouses && warehouses.length > 0) setFormWhId(warehouses[0].id);
    if (products && products.length > 0) {
      setFormProdId(products[0].id);
      setFormVariantId('');
    }
    setFormActualQty('');
    setFormReason('Periodic stock audit');
    setFormNotes('Physical count check');
    setModalError(null);
    setShowAdjustModal(true);
  };

  // Submit Handlers
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!formWhId || !formLocId || !formProdId) {
      setModalError('Please select warehouse, bin location, and product.');
      return;
    }
    const qty = formQuantity === '' ? 0 : Number(formQuantity);
    if (qty <= 0) {
      setModalError(language === 'id' ? 'Kuantitas harus lebih dari 0.' : 'Quantity must be greater than 0.');
      return;
    }

    const locObj = currentWhLocations.find((l) => l.id === formLocId);
    if (locObj && locObj.max_capacity > 0) {
      const curOccupancy = getBinOccupancy(formLocId);
      if (curOccupancy + qty > locObj.max_capacity) {
        const avail = Math.max(0, locObj.max_capacity - curOccupancy);
        setModalError(
          language === 'id'
            ? `Melebihi kapasitas rak! Rak ${locObj.code} berkapasitas maks ${locObj.max_capacity} pcs (terisi ${curOccupancy} pcs, sisa kapasitas ${avail} pcs, mencoba memasukkan ${qty} pcs).`
            : `Exceeds bin capacity! Bin ${locObj.code} has max capacity ${locObj.max_capacity} pcs (occupied ${curOccupancy} pcs, space available ${avail} pcs, requested ${qty} pcs).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.post('/inventory/stock-in', {
        warehouse_id: formWhId,
        location_id: formLocId,
        product_id: formProdId,
        variant_id: formVariantId || undefined,
        quantity: qty,
        reference_type: formRefType,
        reference_id: formRefId,
        notes: formNotes,
      });

      setSuccessMsg(`Successfully stocked in ${qty} units!`);
      setShowStockInModal(false);
      await Promise.all([fetchInventory(), fetchStats(), fetchMovements()]);
    } catch (err: any) {
      setModalError(err.message || 'Failed to execute stock in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStockOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!formWhId || !formLocId || !formProdId) {
      setModalError('Please select warehouse, bin location, and product.');
      return;
    }
    const qty = formQuantity === '' ? 0 : Number(formQuantity);
    if (qty <= 0) {
      setModalError('Quantity must be greater than 0.');
      return;
    }
    if (maxAvailableForSelected !== null && qty > maxAvailableForSelected) {
      setModalError(`Cannot dispatch ${qty} units. Only ${maxAvailableForSelected} available.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/inventory/stock-out', {
        warehouse_id: formWhId,
        location_id: formLocId,
        product_id: formProdId,
        variant_id: formVariantId || undefined,
        quantity: qty,
        reference_type: formRefType,
        reference_id: formRefId,
        notes: formNotes,
      });

      setSuccessMsg(`Successfully dispatched ${qty} units!`);
      setShowStockOutModal(false);
      await Promise.all([fetchInventory(), fetchStats(), fetchMovements()]);
    } catch (err: any) {
      setModalError(err.message || 'Failed to execute stock out');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!formWhId || !formLocId || !formProdId) {
      setModalError('Please select warehouse, bin location, and product.');
      return;
    }
    const actualQty = formActualQty === '' ? 0 : Number(formActualQty);
    if (actualQty < 0) {
      setModalError(language === 'id' ? 'Kuantitas aktual tidak boleh negatif.' : 'Actual quantity cannot be negative.');
      return;
    }

    const locObj = currentWhLocations.find((l) => l.id === formLocId);
    if (locObj && locObj.max_capacity > 0) {
      const otherOcc = getBinOccupancy(formLocId, formProdId, formVariantId);
      if (otherOcc + actualQty > locObj.max_capacity) {
        setModalError(
          language === 'id'
            ? `Penyesuaian stok melebihi kapasitas maksimum rak ${locObj.code} (${locObj.max_capacity} pcs). Hasil akhir akan menjadi ${otherOcc + actualQty} pcs.`
            : `Adjusted quantity exceeds maximum capacity of bin ${locObj.code} (${locObj.max_capacity} pcs). Resulting occupancy would be ${otherOcc + actualQty} pcs.`
        );
        return;
      }
    }

    if (!formReason.trim()) {
      setModalError('Audit reason is required for compliance.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/inventory/adjust', {
        warehouse_id: formWhId,
        location_id: formLocId,
        product_id: formProdId,
        variant_id: formVariantId || undefined,
        actual_quantity: actualQty,
        reason: formReason.trim(),
        notes: formNotes,
      });

      setSuccessMsg(`Inventory adjusted to ${actualQty} units.`);
      setShowAdjustModal(false);
      await Promise.all([fetchInventory(), fetchStats(), fetchMovements()]);
    } catch (err: any) {
      setModalError(err.message || 'Failed to adjust inventory');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentWhLocations = warehouseLocations[formWhId] || [];
  const selectedProductObj = products.find((p) => p.id === formProdId);
  const actualQtyNum = formActualQty === '' ? 0 : Number(formActualQty);
  const deltaNum = actualQtyNum - currentOnHandForAdjust;

  const selectedLocationObj = currentWhLocations.find((l) => l.id === formLocId);
  const selectedLocOccupancy = selectedLocationObj ? getBinOccupancy(selectedLocationObj.id) : 0;
  const selectedLocCapacity = selectedLocationObj?.max_capacity || 0;
  const selectedLocAvailable = selectedLocCapacity > 0 ? Math.max(0, selectedLocCapacity - selectedLocOccupancy) : Infinity;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
                {t('inventoryTitle')}
              </h1>
              <p className="text-sm text-[#8B8B99] dark:text-slate-400 mt-1">
                {t('inventorySubtitle')}
              </p>
            </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openNewStockOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-[#1B1B1F] dark:text-white hover:border-[#7C6EF0] hover:text-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
            >
              <Minus className="w-4 h-4 stroke-[2]" />
              <span>{t('stockOutBtn')}</span>
            </button>
            {canAdjust && (
              <button
                onClick={openNewAdjust}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-[#1B1B1F] dark:text-white hover:border-[#7C6EF0] hover:text-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
              >
                <Scale className="w-4 h-4 stroke-[1.8] text-[#8B8B99] dark:text-slate-400" />
                <span>{t('adjustStockBtn')}</span>
              </button>
            )}
            <button
              onClick={openNewStockIn}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] text-white text-sm font-semibold hover:bg-[#6C5CE7] transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{t('stockInBtn')}</span>
            </button>
          </div>
        </div>

        {/* Floating Notifications */}
        <FloatingToast
          type="success"
          message={successMsg}
          onClose={() => setSuccessMsg(null)}
        />
        <FloatingToast
          type="error"
          message={errorMsg}
          onClose={() => setErrorMsg(null)}
        />

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiOnHand')}</span>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.total_on_hand.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Unit fisik di semua gudang' : 'Physical units across hubs'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiAvailable')}</span>
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.total_available.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Siap dialokasikan' : 'Ready for fulfillment'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiReserved')}</span>
              <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.total_reserved.toLocaleString() : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Ditahan untuk pesanan' : 'Held for active orders'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiLowStock')}</span>
              <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.low_stock_items_count : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Mendekati batas aman' : 'At or below safety min'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiMutationsToday')}</span>
              <div className="w-8 h-8 rounded-full bg-[#F4F3FF] dark:bg-[#7C6EF0]/15 text-[#7C6EF0] dark:text-[#A594FD] flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.movements_today : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Transaksi log audit' : 'Audit log transactions'}
            </p>
          </div>
        </div>

        {/* Tabs and Controls */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-800 px-6 pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Tab navigation */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setActiveTab('balances')}
                className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'balances'
                    ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Boxes className="w-4 h-4" />
                {t('tabStockBalances')} ({items.length})
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'ledger'
                    ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <History className="w-4 h-4" />
                {t('tabAuditLedger')}
              </button>
            </div>

            {/* Quick Refresh */}
            <div className="pb-3 flex items-center gap-2">
              <button
                onClick={() => {
                  fetchInventory();
                  fetchStats();
                  if (activeTab === 'ledger') fetchMovements();
                }}
                className="p-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#8B8B99] dark:text-slate-400 hover:text-[#7C6EF0] hover:border-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
                title="Refresh data"
              >
                <RefreshCw className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Warehouse selector */}
              <div className="flex items-center gap-2 min-w-[200px]">
                <WarehouseIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                >
                  <option value="">{t('allWarehouses')}</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.city})
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === 'balances' ? (
                <>
                  {/* Search query */}
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t('searchInventoryPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* Low stock toggle */}
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <input
                      type="checkbox"
                      checked={lowStockOnly}
                      onChange={(e) => setLowStockOnly(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>{t('lowStockOnly')}</span>
                  </label>
                </>
              ) : (
                /* Movement Type filter for Ledger */
                <div className="flex items-center gap-2 min-w-[180px]">
                  <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                  <select
                    value={movementTypeFilter}
                    onChange={(e) => setMovementTypeFilter(e.target.value)}
                    className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                  >
                    <option value="">{language === 'id' ? 'Semua Tipe Mutasi' : 'All Movement Types'}</option>
                    <option value="stock_in">{t('stockInBtn')}</option>
                    <option value="stock_out">{t('stockOutBtn')}</option>
                    <option value="adjustment">{language === 'id' ? 'Penyesuaian Stok' : 'Stock Adjustment'}</option>
                    <option value="reserve">{language === 'id' ? 'Reservasi' : 'Reservation'}</option>
                    <option value="release">{language === 'id' ? 'Pelepasan' : 'Release'}</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* TAB 1: STOCK BALANCES */}
          {activeTab === 'balances' && (
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              {isLoading ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                  <p className="text-sm">{t('loading')}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-12 text-center">
                  <Boxes className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-300">{t('noInventoryTitle')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    {t('noInventorySubtitle')}
                  </p>
                  <button
                    onClick={openNewStockIn}
                    className="mt-4 inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#7C6EF0] text-white hover:bg-[#6C5CE7] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {t('recordFirstStock')}
                  </button>
                </div>
              ) : (
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 shadow-xs">
                    <tr>
                      <th className="py-3.5 px-4">{t('colProduct')} & {t('sku')}</th>
                      <th className="py-3.5 px-4">{t('warehouse')} & Bin</th>
                      <th className="py-3.5 px-4 text-center">{t('kpiOnHand')}</th>
                      <th className="py-3.5 px-4 text-center">{t('kpiReserved')}</th>
                      <th className="py-3.5 px-4 text-center">{t('kpiAvailable')}</th>
                      <th className="py-3.5 px-4 text-center">{t('status')}</th>
                      <th className="py-3.5 px-4 text-right">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {items.map((item) => {
                      const isLowStock = item.quantity_available <= item.min_stock;
                      const isOutOfStock = item.quantity_available <= 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{item.product_name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {item.sku}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">Min: {item.min_stock} {item.unit}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                              <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
                              {item.warehouse_name}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span className="font-mono font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                Bin: {item.location_code}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center font-semibold text-slate-900 dark:text-slate-100">
                            {item.quantity_on_hand} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{item.unit}</span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {item.quantity_reserved > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                                {item.quantity_reserved} {item.unit}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">0</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center font-bold">
                            <span
                              className={
                                isOutOfStock
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : isLowStock
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }
                            >
                              {item.quantity_available} {item.unit}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {isOutOfStock ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">
                                {language === 'id' ? 'Habis' : 'Out of Stock'}
                              </span>
                            ) : isLowStock ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {language === 'id' ? 'Stok Menipis' : 'Low Stock'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                                {language === 'id' ? 'Aman' : 'Healthy'}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openStockInForRow(item)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors"
                                title={t('stockInBtn')}
                              >
                                + {t('stockInBtn')}
                              </button>
                              <button
                                onClick={() => openStockOutForRow(item)}
                                disabled={item.quantity_available <= 0}
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors shadow-2xs ${
                                  item.quantity_available <= 0
                                    ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                                    : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                                }`}
                                title={t('stockOutBtn')}
                              >
                                - {t('stockOutBtn')}
                              </button>
                              {canAdjust && (
                                <button
                                  onClick={() => openAdjustForRow(item)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors"
                                  title={t('adjustStockBtn')}
                                >
                                  {language === 'id' ? 'Sesuaikan' : 'Adjust'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: MOVEMENT AUDIT LEDGER */}
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              {isMovementsLoading ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                  <p className="text-sm">{t('loading')}</p>
                </div>
              ) : movements.length === 0 ? (
                <div className="p-12 text-center">
                  <History className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'id' ? 'Belum ada transaksi buku besar' : 'No ledger transactions found'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    {language === 'id'
                      ? 'Semua mutasi barang masuk, keluar, dan penyesuaian akan tercatat di sini dengan jejak audit lengkap.'
                      : 'All inbound, outbound, and adjustment mutations will appear here chronologically with full audit trace.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 shadow-xs">
                    <tr>
                      <th className="py-3.5 px-4">{language === 'id' ? 'Waktu' : 'Timestamp'}</th>
                      <th className="py-3.5 px-4">{language === 'id' ? 'Tipe Mutasi' : 'Mutation Type'}</th>
                      <th className="py-3.5 px-4">{t('colProduct')} & {t('sku')}</th>
                      <th className="py-3.5 px-4">{t('warehouse')} & Bin</th>
                      <th className="py-3.5 px-4 text-center">{language === 'id' ? 'Jumlah (+/-)' : 'Delta Qty'}</th>
                      <th className="py-3.5 px-4 text-center">{language === 'id' ? 'Perubahan Saldo' : 'Balance Progression'}</th>
                      <th className="py-3.5 px-4">{t('reference')} / {t('notes')}</th>
                      <th className="py-3.5 px-4 text-right">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-xs">
                    {movements.map((mov) => {
                      const isPositive = mov.quantity > 0;
                      const isNegative = mov.quantity < 0;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors font-sans text-sm">
                          <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                            {new Date(mov.created_at).toLocaleString()}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {mov.movement_type === 'stock_in' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                                <ArrowDownLeft className="w-3 h-3 mr-1" />
                                Stock In
                              </span>
                            )}
                            {mov.movement_type === 'stock_out' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                                <ArrowUpRight className="w-3 h-3 mr-1" />
                                Stock Out
                              </span>
                            )}
                            {mov.movement_type === 'adjustment' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                                <Scale className="w-3 h-3 mr-1" />
                                Adjustment
                              </span>
                            )}
                            {mov.movement_type === 'reserve' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                                <ShieldAlert className="w-3 h-3 mr-1" />
                                Reserve
                              </span>
                            )}
                            {mov.movement_type === 'release' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50">
                                Release
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{mov.product_name}</div>
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{mov.sku}</div>
                          </td>

                          <td className="py-3.5 px-4 text-xs">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{mov.warehouse_name}</div>
                            <div className="font-mono text-slate-500 dark:text-slate-400">Bin: {mov.location_code}</div>
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono font-bold">
                            <span
                              className={
                                isPositive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isNegative
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }
                            >
                              {isPositive ? `+${mov.quantity}` : mov.quantity}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono text-xs">
                            <span className="text-slate-500 dark:text-slate-400">{mov.balance_before}</span>
                            <span className="text-slate-400 dark:text-slate-600 mx-1.5">→</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{mov.balance_after}</span>
                          </td>

                          <td className="py-3.5 px-4 text-xs">
                            {mov.reference_id && (
                              <span className="font-semibold font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mr-1.5">
                                {mov.reference_id}
                              </span>
                            )}
                            <span className="text-slate-500 dark:text-slate-400 italic">{mov.notes || '—'}</span>
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap text-xs">
                            <div className="font-medium text-slate-900 dark:text-slate-200">{mov.created_by_name}</div>
                            <div className="text-slate-400 dark:text-slate-500">{mov.created_by}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* MODAL 1: STOCK IN */}
        {showStockInModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('modalStockInTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'id' ? 'Catat penerimaan stok fisik ke slot rak bin yang ditentukan' : 'Add physical inventory to a designated bin location'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStockInModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modalError && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleStockInSubmit} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectWarehouse')} *</label>
                  <select
                    value={formWhId}
                    onChange={(e) => setFormWhId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectBin')} *</label>
                  <select
                    value={formLocId}
                    onChange={(e) => setFormLocId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {currentWhLocations.length === 0 ? (
                      <option value="">{language === 'id' ? 'Tidak ada slot bin di gudang ini' : 'No locations available in this warehouse'}</option>
                    ) : (
                      currentWhLocations.map((loc) => {
                        const occ = getBinOccupancy(loc.id);
                        const cap = loc.max_capacity || 0;
                        const rem = cap > 0 ? Math.max(0, cap - occ) : 0;
                        return (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} ({loc.zone} • {loc.type}) {cap > 0 ? `— ${language === 'id' ? 'Sisa' : 'Avail'}: ${rem}/${cap} pcs` : ''}
                          </option>
                        );
                      })
                    )}
                  </select>

                  {/* Real-time Bin Capacity Indicator */}
                  {selectedLocationObj && selectedLocCapacity > 0 && (
                    <div className="mt-2 p-3 rounded-xl border border-[#EEEDF5] dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                          {language === 'id' ? 'Kapasitas Fisik Rak' : 'Bin Physical Capacity'}:
                        </span>
                        <span className={`font-semibold font-mono ${selectedLocAvailable <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                          {selectedLocOccupancy} / {selectedLocCapacity} pcs ({language === 'id' ? 'Sisa' : 'Remaining'}: {selectedLocAvailable} pcs)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            selectedLocOccupancy >= selectedLocCapacity
                              ? 'bg-rose-500'
                              : selectedLocOccupancy / selectedLocCapacity >= 0.8
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.round((selectedLocOccupancy / selectedLocCapacity) * 100))}%`,
                          }}
                        />
                      </div>
                      {selectedLocAvailable <= 0 && (
                        <p className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                          ⚠️ {language === 'id' ? 'Rak ini sudah penuh (0 pcs tersisa)!' : 'This bin is completely full (0 pcs left)!'}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectProduct')} *</label>
                  <select
                    value={formProdId}
                    onChange={(e) => {
                      setFormProdId(e.target.value);
                      setFormVariantId('');
                    }}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} ({prod.sku})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProductObj && selectedProductObj.variants && selectedProductObj.variants.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Varian (Opsional)' : 'Variant (Optional)'}
                    </label>
                    <select
                      value={formVariantId}
                      onChange={(e) => setFormVariantId(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    >
                      <option value="">{language === 'id' ? 'Produk Utama / Standar' : 'Standard / Base Product'}</option>
                      {selectedProductObj.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {t('quantity')} {selectedProductObj ? `(${selectedProductObj.unit})` : ''} *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={selectedLocCapacity > 0 ? selectedLocAvailable : undefined}
                      placeholder="e.g. 100"
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className={`w-full h-10 px-3.5 bg-white dark:bg-slate-800 border rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 font-mono transition-colors ${
                        selectedLocCapacity > 0 && Number(formQuantity) > selectedLocAvailable
                          ? 'border-rose-500 focus:ring-rose-500'
                          : 'border-[#EEEDF5] dark:border-slate-700 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0]'
                      }`}
                      required
                    />
                    {selectedLocCapacity > 0 && Number(formQuantity) > selectedLocAvailable && (
                      <p className="text-rose-600 dark:text-rose-400 text-[11px] font-medium mt-1">
                        ⚠️ {language === 'id'
                          ? `Melebihi sisa kapasitas rak! Maksimal ${selectedLocAvailable} pcs.`
                          : `Exceeds remaining bin space! Maximum is ${selectedLocAvailable} pcs.`}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Tipe Referensi' : 'Reference Type'}
                    </label>
                    <select
                      value={formRefType}
                      onChange={(e) => setFormRefType(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    >
                      <option value="po">Purchase Order (PO)</option>
                      <option value="return">{language === 'id' ? 'Retur Pelanggan' : 'Customer Return'}</option>
                      <option value="transfer_in">{language === 'id' ? 'Transfer Masuk' : 'Transfer Inbound'}</option>
                      <option value="manual">{language === 'id' ? 'Penerimaan Manual' : 'Manual Intake'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Nomor Dokumen Referensi' : 'Reference Number'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PO-2026-001"
                      value={formRefId}
                      onChange={(e) => setFormRefId(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {t('notes')}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'contoh: Kiriman truk ekspedisi' : 'e.g. Delivered by truck'}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] text-xs transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowStockInModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('submitting')}</span>
                      </>
                    ) : (
                      <span>{t('stockInBtn')}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: STOCK OUT */}
        {showStockOutModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('modalStockOutTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'id' ? 'Pengurangan stok inventaris otomatis dengan proteksi defisit' : 'Atomic inventory deduction with overdraft prevention'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStockOutModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modalError && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleStockOutSubmit} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectWarehouse')} *</label>
                  <select
                    value={formWhId}
                    onChange={(e) => setFormWhId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectBin')} *</label>
                  <select
                    value={formLocId}
                    onChange={(e) => setFormLocId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {currentWhLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectProduct')} *</label>
                  <select
                    value={formProdId}
                    onChange={(e) => {
                      setFormProdId(e.target.value);
                      setFormVariantId('');
                    }}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} ({prod.sku})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Real-time availability indicator badge */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-[#EEEDF5] dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    {language === 'id' ? 'Stok Tersedia di Slot Ini:' : 'Current Stock at this Location:'}
                  </span>
                  <span className="font-bold text-[#7C6EF0] dark:text-[#9B8FF3] font-mono">
                    {maxAvailableForSelected !== null
                      ? (language === 'id' ? `${maxAvailableForSelected} unit tersedia` : `${maxAvailableForSelected} available`)
                      : (language === 'id' ? 'Belum ada stok' : 'Not stocked')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('quantity')} *</label>
                    <input
                      type="number"
                      min="1"
                      max={maxAvailableForSelected ?? undefined}
                      placeholder="e.g. 5"
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Tipe Referensi' : 'Reference Type'}
                    </label>
                    <select
                      value={formRefType}
                      onChange={(e) => setFormRefType(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    >
                      <option value="so">{language === 'id' ? 'Pesanan Penjualan (SO)' : 'Sales Order (SO)'}</option>
                      <option value="damaged">{language === 'id' ? 'Barang Rusak (Write-off)' : 'Damaged Goods Write-off'}</option>
                      <option value="transfer_out">{language === 'id' ? 'Transfer Keluar' : 'Transfer Outbound'}</option>
                      <option value="manual">{language === 'id' ? 'Pengeluaran Manual' : 'Manual Dispatch'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Nomor Dokumen Referensi' : 'Reference Number'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SO-2026-042"
                      value={formRefId}
                      onChange={(e) => setFormRefId(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {t('notes')}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'contoh: Pengiriman ke pelanggan' : 'e.g. Customer delivery'}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] text-xs transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowStockOutModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || (maxAvailableForSelected !== null && maxAvailableForSelected <= 0)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('submitting')}</span>
                      </>
                    ) : (
                      <span>{t('stockOutBtn')}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: STOCK ADJUSTMENT */}
        {showAdjustModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('modalAdjustTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'id' ? 'Rekonsiliasi perhitungan fisik dengan pencatatan buku besar' : 'Reconcile physical counts with ledger tracking'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {modalError && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleAdjustSubmit} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectWarehouse')} *</label>
                  <select
                    value={formWhId}
                    onChange={(e) => setFormWhId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectBin')} *</label>
                  <select
                    value={formLocId}
                    onChange={(e) => setFormLocId(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {currentWhLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zone}) {loc.max_capacity > 0 ? `— Max: ${loc.max_capacity} pcs` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Real-time Bin Capacity Indicator for Adjustment */}
                  {selectedLocationObj && selectedLocCapacity > 0 && (
                    <div className="mt-2 p-3 rounded-xl border border-[#EEEDF5] dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-xs flex justify-between items-center">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
                        {language === 'id' ? 'Kapasitas Maksimal Rak' : 'Bin Maximum Capacity'}:
                      </span>
                      <span className="font-semibold font-mono text-[#7C6EF0] dark:text-[#9B8FF3]">
                        {selectedLocCapacity} pcs
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">{t('selectProduct')} *</label>
                  <select
                    value={formProdId}
                    onChange={(e) => {
                      setFormProdId(e.target.value);
                      setFormVariantId('');
                    }}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  >
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} ({prod.sku})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Real-time Delta Calculator Display */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-[#EEEDF5] dark:border-slate-700 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>{language === 'id' ? 'Saldo Sistem Saat Ini:' : 'Current System Balance:'}</span>
                    <span className="font-bold font-mono text-slate-900 dark:text-white">{currentOnHandForAdjust} {language === 'id' ? 'unit' : 'units'}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 dark:text-slate-300 font-semibold pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span>{t('adjustmentDeltaLabel')}:</span>
                    <span
                      className={`font-bold font-mono ${
                        deltaNum > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : deltaNum < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {deltaNum > 0 ? `+` : ''}
                      {deltaNum} {language === 'id' ? 'unit' : 'units'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Jumlah Fisik Hasil Perhitungan' : 'Actual Counted Physical Quantity'} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={selectedLocCapacity > 0 ? selectedLocCapacity : undefined}
                    placeholder={language === 'id' ? 'Masukkan hasil hitung fisik di rak' : 'Enter physical count on shelf'}
                    value={formActualQty}
                    onChange={(e) => setFormActualQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className={`w-full h-10 px-3.5 bg-white dark:bg-slate-800 border rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 font-mono transition-colors ${
                      selectedLocCapacity > 0 && Number(formActualQty) > selectedLocCapacity
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[#EEEDF5] dark:border-slate-700 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0]'
                    }`}
                    required
                  />
                  {selectedLocCapacity > 0 && Number(formActualQty) > selectedLocCapacity && (
                    <p className="text-rose-600 dark:text-rose-400 text-[11px] font-medium mt-1">
                      ⚠️ {language === 'id'
                        ? `Melebihi kapasitas maksimal rak (${selectedLocCapacity} pcs)!`
                        : `Exceeds maximum bin capacity (${selectedLocCapacity} pcs)!`}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {language === 'id' ? 'Masukkan jumlah fisik persis yang dihitung langsung pada rak penyimpanan.' : 'Enter the exact physical quantity counted on the shelf.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('reasonLabel')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'contoh: Opname Semester I 2026, Kemasan rusak, Salah penempatan' : 'e.g. Stock Opname 2026, Damaged packaging, Found misplaced'}
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('notes')}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={language === 'id' ? 'Keterangan tambahan untuk audit manajer...' : 'Additional details for supervisor audit...'}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('submitting')}</span>
                      </>
                    ) : (
                      <span>{t('confirm')}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
