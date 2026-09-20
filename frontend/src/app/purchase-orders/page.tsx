'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import {
  PurchaseOrder,
  POStatus,
  Supplier,
  CreatePOPayload,
  ReceivePOPayload,
  POStats,
} from '@/types/po';
import { Product } from '@/types/product';
import { Warehouse, Location } from '@/types/warehouse';
import {
  FileText,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Warehouse as WarehouseIcon,
  RefreshCw,
  X,
  Loader2,
  Truck,
  Building2,
  Calendar,
  Eye,
  Send,
  Ban,
  DollarSign,
  PackageCheck,
  Clock,
  Trash2,
  ArrowDownLeft,
  Phone,
  Mail,
  User as UserIcon,
} from 'lucide-react';

interface FormLineItem {
  product_id: string;
  variant_id?: string;
  quantity_ordered: number | '';
  unit_cost: number | '';
  target_location_id?: string;
}

interface FormReceiveItem {
  product_id: string;
  variant_id?: string;
  location_id: string;
  quantity_received: number | '';
  max_allowed: number;
  product_name: string;
  sku: string;
  unit: string;
}

export default function PurchaseOrdersPage() {
  const { user, role } = useAuth();
  const { t, language } = useLanguage();
  const canManage = role === 'super_admin' || role === 'warehouse_manager';

  // Active Tab: 'orders' or 'suppliers'
  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders');

  // Main Data States
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<POStats | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<Record<string, Location[]>>({});

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState<string>('');

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Selected for Details / Receive
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // Create PO Form State
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poWarehouseId, setPoWarehouseId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<FormLineItem[]>([]);

  // Receive Modal Form State
  const [receiveItems, setReceiveItems] = useState<FormReceiveItem[]>([]);
  const [receiveNotes, setReceiveNotes] = useState('');

  // Supplier Form State
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supCode, setSupCode] = useState('');
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddress, setSupAddress] = useState('');

  // Auto-dismiss Alerts
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

  // Load Metadata (Warehouses, Products, Suppliers)
  const loadMetadata = useCallback(async () => {
    try {
      const [whRes, prodRes, supRes] = await Promise.all([
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ products: Product[] }>('/products?limit=100'),
        api.get<Supplier[]>('/suppliers'),
      ]);

      if (whRes.data) setWarehouses(whRes.data || []);
      if (prodRes.data) setProducts(prodRes.data.products || []);
      if (supRes.data) setSuppliers(supRes.data || []);
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  }, []);

  // Fetch locations for a warehouse if not already cached
  const fetchLocationsForWh = useCallback(async (whId: string) => {
    if (!whId) return [];
    if (warehouseLocations[whId]) return warehouseLocations[whId];
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

  // Fetch Purchase Orders
  const fetchOrders = useCallback(async () => {
    try {
      let query = `?limit=100`;
      if (statusFilter) query += `&status=${statusFilter}`;
      if (warehouseFilter) query += `&warehouse_id=${warehouseFilter}`;
      if (searchQuery.trim()) query += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await api.get<{ orders: PurchaseOrder[] }>(`/purchase-orders${query}`);
      if (res.data && res.data.orders) {
        setOrders(res.data.orders);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch purchase orders');
    }
  }, [statusFilter, warehouseFilter, searchQuery]);

  // Fetch PO Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<POStats>('/purchase-orders/stats');
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch PO stats', err);
    }
  }, []);

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get<Supplier[]>('/suppliers');
      if (res.data) {
        setSuppliers(res.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch suppliers');
    }
  }, []);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadMetadata(), fetchOrders(), fetchStats()]);
      setIsLoading(false);
    };
    init();
  }, [loadMetadata, fetchOrders, fetchStats]);

  // Refetch when filters change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time auto-refresh across browsers
  useEffect(() => {
    const handleSync = (e: any) => {
      const resource = e?.detail?.resource;
      if (
        !resource ||
        resource === 'purchase_orders' ||
        resource === 'products' ||
        resource === 'warehouses' ||
        resource === 'inventory'
      ) {
        fetchOrders();
        fetchStats();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('stockflow-sync', handleSync);
      return () => window.removeEventListener('stockflow-sync', handleSync);
    }
  }, [fetchOrders, fetchStats]);

  // Pre-fetch locations whenever poWarehouseId changes in create modal
  useEffect(() => {
    if (poWarehouseId) {
      fetchLocationsForWh(poWarehouseId);
    }
  }, [poWarehouseId, fetchLocationsForWh]);

  // Filtered Suppliers for Directory
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery.trim()) return suppliers;
    const q = supplierSearchQuery.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.contact_person.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.includes(q)
    );
  }, [suppliers, supplierSearchQuery]);

  // Helper: Open Create PO Modal
  const openCreatePO = (preselectedSupplierId?: string) => {
    setModalError(null);
    const initialWhId = warehouses.length > 0 ? warehouses[0].id : '';
    const initialSupId = preselectedSupplierId || (suppliers.length > 0 ? suppliers[0].id : '');

    setPoSupplierId(initialSupId);
    setPoWarehouseId(initialWhId);
    setPoExpectedDate('');
    setPoNotes('');

    // Pre-populate with 1 empty line item if products exist
    if (products && products.length > 0) {
      const firstProd = products[0];
      setPoItems([
        {
          product_id: firstProd.id,
          variant_id: '',
          quantity_ordered: 10,
          unit_cost: firstProd.cost_price || firstProd.price || 0,
        },
      ]);
    } else {
      setPoItems([]);
    }

    setShowCreatePOModal(true);
  };

  // Add a line item to Create PO
  const addLineItem = () => {
    if (!products || products.length === 0) return;
    const firstProd = products[0];
    setPoItems((prev) => [
      ...prev,
      {
        product_id: firstProd.id,
        variant_id: '',
        quantity_ordered: 10,
        unit_cost: firstProd.cost_price || firstProd.price || 0,
      },
    ]);
  };

  // Update line item in Create PO
  const updateLineItem = (index: number, field: keyof FormLineItem, val: any) => {
    setPoItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: val };

      // If product changed, auto-update unit cost to that product's cost_price or price
      if (field === 'product_id') {
        const prod = products.find((p) => p.id === val);
        if (prod) {
          item.unit_cost = prod.cost_price || prod.price || 0;
          item.variant_id = '';
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  // Remove line item
  const removeLineItem = (index: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculated Grand Total for Create PO
  const calculatedGrandTotal = useMemo(() => {
    return poItems.reduce((acc, item) => {
      const qty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
      const cost = typeof item.unit_cost === 'number' ? item.unit_cost : 0;
      return acc + qty * cost;
    }, 0);
  }, [poItems]);

  const calculatedTotalQuantity = useMemo(() => {
    return poItems.reduce((acc, item) => {
      const qty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
      return acc + qty;
    }, 0);
  }, [poItems]);

  // Submit Create PO
  const handleCreatePOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!poSupplierId) {
      setModalError('Please select a supplier.');
      return;
    }
    if (!poWarehouseId) {
      setModalError('Please select a destination warehouse.');
      return;
    }
    if (poItems.length === 0) {
      setModalError('Please add at least one line item to the purchase order.');
      return;
    }

    // Validate line items
    for (let i = 0; i < poItems.length; i++) {
      const item = poItems[i];
      if (!item.product_id) {
        setModalError(`Item #${i + 1}: Please select a valid product.`);
        return;
      }
      const qty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
      if (qty <= 0) {
        setModalError(`Item #${i + 1}: Quantity ordered must be greater than 0.`);
        return;
      }
      const cost = typeof item.unit_cost === 'number' ? item.unit_cost : 0;
      if (cost < 0) {
        setModalError(`Item #${i + 1}: Unit cost cannot be negative.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: CreatePOPayload = {
        supplier_id: poSupplierId,
        warehouse_id: poWarehouseId,
        expected_date: poExpectedDate ? new Date(poExpectedDate).toISOString() : undefined,
        notes: poNotes.trim() || undefined,
        items: poItems.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id || undefined,
          quantity_ordered: Number(item.quantity_ordered) || 0,
          unit_cost: Number(item.unit_cost) || 0,
          target_location_id: item.target_location_id || undefined,
        })),
      };

      const res = await api.post<PurchaseOrder>('/purchase-orders', payload);
      if (res.data) {
        setSuccessMsg(`Purchase Order ${res.data.order_number} created successfully.`);
        setShowCreatePOModal(false);
        await Promise.all([fetchOrders(), fetchStats()]);
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to create purchase order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // State Machine: Mark as Ordered (Send)
  const handleMarkOrdered = async (po: PurchaseOrder) => {
    if (!confirm(`Mark order ${po.order_number} as ORDERED? This communicates the commitment to ${po.supplier_name}.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<PurchaseOrder>(`/purchase-orders/${po.id}/order`);
      if (res.data) {
        setSuccessMsg(`Purchase order ${po.order_number} marked as Ordered!`);
        if (selectedPO && selectedPO.id === po.id) {
          setSelectedPO(res.data);
        }
        await Promise.all([fetchOrders(), fetchStats()]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update order status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // State Machine: Cancel PO
  const handleCancelPO = async (po: PurchaseOrder) => {
    if (!confirm(`Are you sure you want to cancel order ${po.order_number}? This cannot be undone.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<PurchaseOrder>(`/purchase-orders/${po.id}/cancel`);
      if (res.data) {
        setSuccessMsg(`Purchase order ${po.order_number} has been cancelled.`);
        if (selectedPO && selectedPO.id === po.id) {
          setSelectedPO(res.data);
        }
        await Promise.all([fetchOrders(), fetchStats()]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel purchase order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Receive Goods Modal
  const openReceiveModal = async (po: PurchaseOrder) => {
    setSelectedPO(po);
    setModalError(null);
    setReceiveNotes('');

    // Pre-fetch warehouse bin locations
    const locs = await fetchLocationsForWh(po.warehouse_id);
    const defaultLocId = locs.length > 0 ? locs[0].id : '';

    // Filter items that have remaining quantity
    const pendingItems: FormReceiveItem[] = po.items
      .filter((item) => item.quantity_received < item.quantity_ordered)
      .map((item) => {
        const remaining = item.quantity_ordered - item.quantity_received;
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          location_id: item.target_location_id || defaultLocId,
          quantity_received: remaining,
          max_allowed: remaining,
          product_name: item.product_name,
          sku: item.sku,
          unit: item.unit,
        };
      });

    setReceiveItems(pendingItems);
    setShowReceiveModal(true);
  };

  // Update line item in Receive Modal
  const updateReceiveItem = (index: number, field: keyof FormReceiveItem, val: any) => {
    setReceiveItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  // Submit Receive Goods (Automated Stock In)
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO) return;
    setModalError(null);

    // Validate
    const itemsToSubmit = receiveItems.filter((i) => {
      const qty = typeof i.quantity_received === 'number' ? i.quantity_received : 0;
      return qty > 0;
    });

    if (itemsToSubmit.length === 0) {
      setModalError('Please enter a receive quantity greater than 0 for at least one item.');
      return;
    }

    for (const item of itemsToSubmit) {
      if (!item.location_id) {
        setModalError(`Please select a bin location for ${item.product_name}.`);
        return;
      }
      const qty = Number(item.quantity_received);
      if (qty > item.max_allowed) {
        setModalError(`Cannot receive ${qty} units of ${item.product_name}. Max remaining is ${item.max_allowed}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: ReceivePOPayload = {
        notes: receiveNotes.trim() || undefined,
        items: itemsToSubmit.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id || undefined,
          location_id: i.location_id,
          quantity_received: Number(i.quantity_received),
        })),
      };

      const res = await api.post<PurchaseOrder>(`/purchase-orders/${selectedPO.id}/receive`, payload);
      if (res.data) {
        setSuccessMsg(`Goods received! Inventory was stocked into warehouse bins successfully.`);
        setShowReceiveModal(false);
        setSelectedPO(null);
        await Promise.all([fetchOrders(), fetchStats()]);
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to receive goods');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Supplier Modal (Create or Edit)
  const openSupplierModal = (supplier?: Supplier) => {
    setModalError(null);
    if (supplier) {
      setEditingSupplier(supplier);
      setSupCode(supplier.code);
      setSupName(supplier.name);
      setSupContact(supplier.contact_person);
      setSupEmail(supplier.email);
      setSupPhone(supplier.phone);
      setSupAddress(supplier.address);
    } else {
      setEditingSupplier(null);
      setSupCode('SUP-' + Math.floor(100 + Math.random() * 900));
      setSupName('');
      setSupContact('');
      setSupEmail('');
      setSupPhone('');
      setSupAddress('');
    }
    setShowSupplierModal(true);
  };

  // Submit Supplier Modal
  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!supName.trim()) {
      setModalError('Supplier name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        code: supCode.trim() || undefined,
        name: supName.trim(),
        contact_person: supContact.trim() || undefined,
        email: supEmail.trim() || undefined,
        phone: supPhone.trim() || undefined,
        address: supAddress.trim() || undefined,
      };

      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, payload);
        setSuccessMsg(`Supplier ${supName} updated successfully.`);
      } else {
        await api.post('/suppliers', payload);
        setSuccessMsg(`Supplier ${supName} registered successfully.`);
      }

      setShowSupplierModal(false);
      await Promise.all([fetchSuppliers(), loadMetadata()]);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper Status Badge
  const renderStatusBadge = (status: POStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-500" />
            {language === 'id' ? 'Draf' : 'Draft'}
          </span>
        );
      case 'ordered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F4F3FF] dark:bg-[#7C6EF0]/15 text-[#6C5CE7] dark:text-[#A594FD] border border-[#E0DCFC] dark:border-[#7C6EF0]/30">
            <Truck className="w-3 h-3 text-[#7C6EF0]" />
            {language === 'id' ? 'Dipesan' : 'Ordered'}
          </span>
        );
      case 'partially_received':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
            <PackageCheck className="w-3 h-3 text-amber-500" />
            {language === 'id' ? 'Diterima Sebagian' : 'Partially Received'}
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {language === 'id' ? 'Selesai' : 'Completed'}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">
            <Ban className="w-3 h-3 text-rose-500" />
            {language === 'id' ? 'Dibatalkan' : 'Cancelled'}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
              {t('poTitle')}
            </h1>
            <p className="text-sm text-[#8B8B99] dark:text-slate-400 mt-1">
              {t('poSubtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => openSupplierModal()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-[#1B1B1F] dark:text-white hover:border-[#7C6EF0] hover:text-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
            >
              <Building2 className="w-4 h-4 stroke-[1.8] text-[#8B8B99] dark:text-slate-400" />
              <span>{t('newSupplierBtn')}</span>
            </button>
            <button
              onClick={() => openCreatePO()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] text-white text-sm font-semibold hover:bg-[#6C5CE7] transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{t('createPOBtn')}</span>
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
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('total')} {t('tabPurchaseOrders')}</span>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.total_orders : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Seluruh riwayat PO' : 'All historical POs'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiDrafts')}</span>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.draft_orders : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Menunggu pengiriman' : 'Pending submission'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiPendingIntake')}</span>
              <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.pending_orders : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Menunggu kedatangan' : 'Awaiting delivery'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiReceived')}</span>
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {stats ? stats.completed_orders : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Selesai diterima' : 'Fully fulfilled'}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('kpiProcurementValue')}</span>
              <div className="w-8 h-8 rounded-full bg-[#F4F3FF] dark:bg-[#7C6EF0]/15 text-[#7C6EF0] dark:text-[#A594FD] flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-2 truncate">
              {stats ? `Rp ${stats.total_procurement_value.toLocaleString('id-ID')}` : '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {language === 'id' ? 'Komitmen nilai PO' : 'Total PO commitment'}
            </p>
          </div>
        </div>

        {/* Main Content Card with Navigation Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Tabs Bar */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-4 gap-8">
            <button
              onClick={() => setActiveTab('orders')}
              className={`pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'orders'
                  ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              {t('tabPurchaseOrders')}
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {orders.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('suppliers')}
              className={`pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'suppliers'
                  ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              {t('tabSupplierDirectory')}
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {suppliers.length}
              </span>
            </button>
          </div>

          {/* TAB 1: PURCHASE ORDERS */}
          {activeTab === 'orders' && (
            <div>
              {/* Filter controls */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                {/* Search */}
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'Cari no. PO, pemasok, atau catatan...' : 'Search by PO#, supplier, or notes...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Pills & Warehouse Filter */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400">
                    <button
                      onClick={() => setStatusFilter('')}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        statusFilter === ''
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {language === 'id' ? 'Semua' : 'All'}
                    </button>
                    <button
                      onClick={() => setStatusFilter('draft')}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        statusFilter === 'draft'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {language === 'id' ? 'Draf' : 'Draft'}
                    </button>
                    <button
                      onClick={() => setStatusFilter('ordered')}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        statusFilter === 'ordered'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {language === 'id' ? 'Dipesan' : 'Ordered'}
                    </button>
                    <button
                      onClick={() => setStatusFilter('partially_received')}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        statusFilter === 'partially_received'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {language === 'id' ? 'Sebagian' : 'Partial'}
                    </button>
                    <button
                      onClick={() => setStatusFilter('received')}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        statusFilter === 'received'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {language === 'id' ? 'Selesai' : 'Completed'}
                    </button>
                  </div>

                  {/* Warehouse Filter */}
                  <div className="flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={warehouseFilter}
                      onChange={(e) => setWarehouseFilter(e.target.value)}
                      className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    >
                      <option value="">{language === 'id' ? 'Semua Gudang' : 'All Warehouses'}</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      fetchOrders();
                      fetchStats();
                    }}
                    title={language === 'id' ? 'Segarkan data' : 'Refresh data'}
                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* PO Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                {isLoading ? (
                  <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                    <p className="text-sm">{language === 'id' ? 'Memuat pesanan pembelian...' : 'Loading purchase orders...'}</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-12 text-center">
                    <Truck className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                      {language === 'id' ? 'Tidak ada pesanan pembelian' : 'No purchase orders found'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                      {language === 'id'
                        ? 'Buat pesanan pembelian pemasok pertama Anda untuk mengotomatisasi penerimaan barang dan stok ulang.'
                        : 'Create your first supplier purchase order to automate goods intake and inventory restocking.'}
                    </p>
                    <button
                      onClick={() => openCreatePO()}
                      className="mt-4 inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#7C6EF0] text-white hover:bg-[#6C5CE7] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      {language === 'id' ? 'Buat Pesanan Pembelian Pertama' : 'Create First Purchase Order'}
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 shadow-xs">
                      <tr>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Detail Pesanan' : 'Order Details'}</th>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Pemasok & Gudang' : 'Supplier & Warehouse'}</th>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Progres Penerimaan' : 'Receiving Progress'}</th>
                        <th className="py-3.5 px-4 text-right">{language === 'id' ? 'Nilai Pesanan' : 'Order Value'}</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-right">{language === 'id' ? 'Aksi' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {orders.map((po) => {
                        const progressPct =
                          po.total_quantity_ordered > 0
                            ? Math.round((po.total_quantity_received / po.total_quantity_ordered) * 100)
                            : 0;

                        return (
                          <tr
                            key={po.id}
                            className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            {/* Order Details */}
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span className="font-mono text-sm text-[#7C6EF0] dark:text-[#A594FD] font-semibold">
                                  {po.order_number}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{language === 'id' ? 'Dibuat: ' : 'Created: '}{new Date(po.created_at).toLocaleDateString()}</span>
                                {po.expected_date && (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    • {language === 'id' ? 'Jatuh Tempo: ' : 'Due: '}{new Date(po.expected_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Supplier & Destination Warehouse */}
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {po.supplier_name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
                                <span>{language === 'id' ? 'Tujuan: ' : 'Destination: '}{po.warehouse_name}</span>
                              </div>
                            </td>

                            {/* Progress Bar */}
                            <td className="py-3.5 px-4">
                              <div className="w-48">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {po.total_quantity_received} / {po.total_quantity_ordered} unit
                                  </span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{progressPct}%</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      progressPct === 100
                                        ? 'bg-emerald-500'
                                        : progressPct > 0
                                        ? 'bg-amber-500'
                                        : 'bg-slate-400'
                                    }`}
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1">
                                  {po.items.length} {language === 'id' ? 'baris item' : po.items.length === 1 ? 'line item' : 'line items'}
                                </div>
                              </div>
                            </td>

                            {/* Procurement Cost */}
                            <td className="py-3.5 px-4 text-center">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                Rp {po.total_amount.toLocaleString('id-ID')}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {po.items.reduce((acc, it) => acc + it.quantity_ordered, 0)} unit
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center">{renderStatusBadge(po.status)}</td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedPO(po);
                                    setShowDetailModal(true);
                                  }}
                                  title={language === 'id' ? 'Lihat Detail Pesanan' : 'View Order Details'}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {po.status === 'draft' && (
                                  <>
                                    <button
                                      onClick={() => handleMarkOrdered(po)}
                                      title={language === 'id' ? 'Tandai Dipesan (Kirim ke Pemasok)' : 'Mark as Ordered (Send to Supplier)'}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F3FF] hover:bg-[#EAE8FE] text-[#6C5CE7] dark:bg-[#7C6EF0]/15 dark:hover:bg-[#7C6EF0]/25 dark:text-[#A594FD] border border-[#E0DCFC] dark:border-[#7C6EF0]/30 transition-colors shadow-2xs"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      {language === 'id' ? 'Pesan' : 'Order'}
                                    </button>
                                    <button
                                      onClick={() => handleCancelPO(po)}
                                      title={language === 'id' ? 'Batalkan Pesanan' : 'Cancel Order'}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </>
                                )}

                                {(po.status === 'ordered' || po.status === 'partially_received') && (
                                  <>
                                    <button
                                      onClick={() => openReceiveModal(po)}
                                      title={language === 'id' ? 'Terima Barang & Isi Ulang Stok' : 'Receive Goods & Restock Inventory'}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#7C6EF0] text-white hover:bg-[#6C5CE7] transition-colors shadow-xs"
                                    >
                                      <ArrowDownLeft className="w-3.5 h-3.5" />
                                      {language === 'id' ? 'Terima' : 'Receive'}
                                    </button>
                                    <button
                                      onClick={() => handleCancelPO(po)}
                                      title={language === 'id' ? 'Batalkan Sisa Pesanan' : 'Cancel Remaining Order'}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </>
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
            </div>
          )}

          {/* TAB 2: SUPPLIER DIRECTORY */}
          {activeTab === 'suppliers' && (
            <div>
              {/* Supplier Search bar */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'Cari berdasarkan nama pemasok, kode, kontak...' : 'Search by supplier name, code, contact...'}
                    value={supplierSearchQuery}
                    onChange={(e) => setSupplierSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                  />
                  {supplierSearchQuery && (
                    <button
                      onClick={() => setSupplierSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => openSupplierModal()}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#7C6EF0] text-white hover:bg-[#6C5CE7] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {language === 'id' ? 'Daftarkan Pemasok' : 'Register Supplier'}
                </button>
              </div>

              {/* Suppliers Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                {filteredSuppliers.length === 0 ? (
                  <div className="p-12 text-center">
                    <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                      {language === 'id' ? 'Tidak ada pemasok ditemukan' : 'No suppliers found'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {language === 'id'
                        ? 'Tambahkan mitra vendor Anda untuk mulai membuat purchase order.'
                        : 'Add your vendor partners to start issuing purchase orders.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 shadow-xs">
                      <tr>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Kode & Perusahaan Pemasok' : 'Supplier Code & Company'}</th>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Kontak Person' : 'Contact Person'}</th>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Email & Telepon' : 'Email & Phone'}</th>
                        <th className="py-3.5 px-4">{language === 'id' ? 'Alamat' : 'Address'}</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-right">{language === 'id' ? 'Aksi' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredSuppliers.map((sup) => (
                        <tr
                          key={sup.id}
                          className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{sup.name}</div>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 mt-0.5 inline-block">
                              {sup.code}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                              {sup.contact_person || '—'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-xs">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{sup.email || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mt-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{sup.phone || '—'}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {sup.address || '—'}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                sup.is_active
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {sup.is_active ? (language === 'id' ? 'Aktif' : 'Active') : (language === 'id' ? 'Tidak Aktif' : 'Inactive')}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openCreatePO(sup.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/80 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                {language === 'id' ? 'Buat PO' : 'Issue PO'}
                              </button>
                              <button
                                onClick={() => openSupplierModal(sup)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                {language === 'id' ? 'Ubah' : 'Edit'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL 1: CREATE PURCHASE ORDER */}
        {showCreatePOModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full p-6 my-8 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {language === 'id' ? 'Buat Purchase Order' : 'Create Purchase Order'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'id'
                      ? 'Pesan barang dari vendor yang disetujui. Disimpan sebagai Draf sebelum dikirim.'
                      : 'Order items from an approved vendor. Saved as Draft before sending.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreatePOModal(false)}
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

              <form onSubmit={handleCreatePOSubmit} className="mt-4 space-y-4 text-sm">
                {/* Supplier & Destination Warehouse Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Pemasok' : 'Supplier'} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={poSupplierId}
                      onChange={(e) => setPoSupplierId(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                      required
                    >
                      {suppliers.length === 0 ? (
                        <option value="">
                          {language === 'id' ? 'Tidak ada pemasok tersedia. Silakan buat dahulu.' : 'No suppliers available. Please create one first.'}
                        </option>
                      ) : (
                        suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Gudang Tujuan' : 'Destination Warehouse'} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={poWarehouseId}
                      onChange={(e) => setPoWarehouseId(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                      required
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.city})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Expected Delivery Date & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Perkiraan Tanggal Tiba' : 'Expected Delivery Date'}
                    </label>
                    <input
                      type="date"
                      value={poExpectedDate}
                      onChange={(e) => setPoExpectedDate(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Catatan / Referensi Pesanan' : 'Order Notes / Reference'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'misal: Stok Ulang Q3, ref kontrak #123' : 'e.g. Q3 Restock, contract ref #123'}
                      value={poNotes}
                      onChange={(e) => setPoNotes(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                </div>

                {/* Dynamic Line Items Section */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {language === 'id' ? 'Daftar Item' : 'Line Items'} ({poItems.length})
                    </label>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#7C6EF0] dark:text-[#9B8FF3] bg-[#7C6EF0]/10 hover:bg-[#7C6EF0]/20 rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{language === 'id' ? 'Tambah Item' : 'Add Item'}</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {poItems.map((item, index) => {
                      const selectedProd = products.find((p) => p.id === item.product_id);
                      const subtotal =
                        (typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0) *
                        (typeof item.unit_cost === 'number' ? item.unit_cost : 0);

                      return (
                        <div
                          key={index}
                          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-3 items-start text-xs"
                        >
                          {/* Product select */}
                          <div className="md:col-span-5">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              {language === 'id' ? 'Produk' : 'Product'} <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={item.product_id}
                              onChange={(e) => updateLineItem(index, 'product_id', e.target.value)}
                              className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                              required
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </select>

                            {/* Optional Variant Select */}
                            {selectedProd && selectedProd.variants && selectedProd.variants.length > 0 && (
                              <select
                                value={item.variant_id || ''}
                                onChange={(e) => updateLineItem(index, 'variant_id', e.target.value)}
                                className="w-full mt-2 h-9 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                              >
                                <option value="">{language === 'id' ? 'Varian Standar' : 'Standard Variant'}</option>
                                {selectedProd.variants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} ({v.sku})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Quantity Ordered: Clearable state without sticky 0 */}
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              {language === 'id' ? 'Jml' : 'Qty'} {selectedProd ? `(${selectedProd.unit})` : ''} <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              placeholder="0"
                              value={item.quantity_ordered}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  'quantity_ordered',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono transition-colors"
                              required
                            />
                          </div>

                          {/* Unit Cost: Clearable state without sticky 0 */}
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              {language === 'id' ? 'Harga Satuan' : 'Unit Cost'} (IDR) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={item.unit_cost}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  'unit_cost',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono transition-colors"
                              required
                            />
                          </div>

                          {/* Subtotal Display */}
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              Subtotal
                            </label>
                            <div className="h-10 flex items-center font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                              Rp {subtotal.toLocaleString('id-ID')}
                            </div>
                          </div>

                          {/* Delete Item */}
                          <div className="md:col-span-1 flex justify-end pt-7">
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              disabled={poItems.length === 1}
                              className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grand Total Bar */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-[#EEEDF5] dark:border-slate-700 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {language === 'id' ? 'Total Kuantitas Dipesan: ' : 'Total Ordered Quantity: '}
                    </span>
                    <strong className="text-slate-900 dark:text-slate-100">{calculatedTotalQuantity} unit</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 dark:text-slate-400">
                      {language === 'id' ? 'Total Nilai Keseluruhan: ' : 'Grand Total Value: '}
                    </span>
                    <strong className="text-base text-[#7C6EF0] dark:text-[#9B8FF3] font-bold ml-1">
                      Rp {calculatedGrandTotal.toLocaleString('id-ID')}
                    </strong>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreatePOModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {language === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{language === 'id' ? 'Menyimpan Draf...' : 'Saving Draft...'}</span>
                      </>
                    ) : (
                      <span>{language === 'id' ? 'Simpan Purchase Order' : 'Save Purchase Order'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: VIEW PO DETAILS */}
        {showDetailModal && selectedPO && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full p-6 my-8 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                        {selectedPO.order_number}
                      </h3>
                      {renderStatusBadge(selectedPO.status)}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {language === 'id'
                        ? `Dibuat pada ${new Date(selectedPO.created_at).toLocaleString('id-ID')} oleh ${selectedPO.created_by_name}`
                        : `Created on ${new Date(selectedPO.created_at).toLocaleString()} by ${selectedPO.created_by_name}`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Metadata Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">{language === 'id' ? 'Pemasok' : 'Supplier'}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedPO.supplier_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{language === 'id' ? 'Gudang Tujuan' : 'Destination Hub'}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedPO.warehouse_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{language === 'id' ? 'Batas Waktu Tiba' : 'Expected Due Date'}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedPO.expected_date
                      ? new Date(selectedPO.expected_date).toLocaleDateString()
                      : language === 'id'
                      ? 'Tidak ditentukan'
                      : 'None specified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{language === 'id' ? 'Total Nilai' : 'Total Value'}</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                    Rp {selectedPO.total_amount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {selectedPO.notes && (
                <div className="mb-4 text-xs p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <strong className="text-slate-700 dark:text-slate-200">{language === 'id' ? 'Catatan: ' : 'Notes: '}</strong>
                  {selectedPO.notes}
                </div>
              )}

              {/* Line Items Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">{language === 'id' ? 'Deskripsi Item' : 'Item Description'}</th>
                      <th className="py-2.5 px-3 text-center">{language === 'id' ? 'Dipesan' : 'Ordered'}</th>
                      <th className="py-2.5 px-3 text-center">{language === 'id' ? 'Diterima' : 'Received'}</th>
                      <th className="py-2.5 px-3 text-right">{language === 'id' ? 'Harga Satuan' : 'Unit Cost'}</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {selectedPO.items.map((item, idx) => {
                      const isComplete = item.quantity_received >= item.quantity_ordered;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{item.product_name}</div>
                            <span className="font-mono text-[11px] text-slate-400">{item.sku}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium text-slate-800 dark:text-slate-200">
                            {item.quantity_ordered} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.quantity_received} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            Rp {item.unit_cost.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                            Rp {item.subtotal.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isComplete ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                {language === 'id' ? 'Terpenuhi' : 'Fulfilled'}
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                                {language === 'id' ? 'Menunggu ' : 'Pending '}{item.quantity_ordered - item.quantity_received}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  {language === 'id' ? 'Tutup' : 'Close'}
                </button>

                <div className="flex items-center gap-2">
                  {selectedPO.status === 'draft' && (
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        handleMarkOrdered(selectedPO);
                      }}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 flex items-center gap-1.5 shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {language === 'id' ? 'Tandai Dipesan' : 'Mark as Ordered'}
                    </button>
                  )}

                  {(selectedPO.status === 'ordered' || selectedPO.status === 'partially_received') && (
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        openReceiveModal(selectedPO);
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      {language === 'id' ? 'Penerimaan Barang Masuk' : 'Receive Inbound Goods'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: GOODS RECEIPT & AUTOMATED INTAKE */}
        {showReceiveModal && selectedPO && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full p-6 my-8 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {language === 'id' ? 'Penerimaan Barang Masuk' : 'Receive Inbound Goods'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {language === 'id' ? 'Pesanan: ' : 'Order: '}
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{selectedPO.order_number}</strong> • {language === 'id' ? 'Gudang Tujuan: ' : 'Destination Hub: '}
                    <strong>{selectedPO.warehouse_name}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Automated Engine Banner */}
              <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {language === 'id' ? 'Mesin Penerimaan Inventaris Otomatis' : 'Automated Inventory Intake Engine'}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {language === 'id'
                      ? 'Mengirim formulir ini mengeksekusi penambahan stok aman transaksi langsung ke lokasi bin gudang yang ditentukan dan mencatat entri buku besar audit dengan referensi ke PO ini.'
                      : 'Submitting this form executes transaction-safe stock-in directly into the designated warehouse bin locations and writes audit ledger entries with reference to this PO.'}
                  </p>
                </div>
              </div>

              {modalError && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleReceiveSubmit} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Surat Jalan / Referensi Pengiriman' : 'Delivery Note / Surat Jalan Reference'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'misal: SJ-2026/09/1089 atau Nama Supir' : 'e.g. SJ-2026/09/1089 or Driver name'}
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    {language === 'id' ? 'Kuantitas Diterima & Lokasi Bin' : 'Receiving Quantities & Bin Locations'}
                  </label>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {receiveItems.map((item, index) => {
                      const whLocs = warehouseLocations[selectedPO.warehouse_id] || [];

                      return (
                        <div
                          key={index}
                          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-3 items-start text-xs"
                        >
                          <div className="md:col-span-5">
                            <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{item.product_name}</div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-mono">{item.sku}</span>
                              <span>• {language === 'id' ? 'Sisa Maks: ' : 'Max Remaining: '}<strong className="text-amber-600 dark:text-amber-400">{item.max_allowed} {item.unit}</strong></span>
                            </div>
                          </div>

                          {/* Target Bin Location */}
                          <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              {language === 'id' ? 'Target Lokasi Bin' : 'Target Bin Location'} <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={item.location_id}
                              onChange={(e) => updateReceiveItem(index, 'location_id', e.target.value)}
                              className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] focus:outline-none transition-colors"
                              required
                            >
                              {whLocs.length === 0 ? (
                                <option value="">{language === 'id' ? 'Tidak ada lokasi bin' : 'No locations available'}</option>
                              ) : (
                                whLocs.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.code} ({loc.zone} • {loc.type}) {loc.max_capacity > 0 ? `— Max: ${loc.max_capacity} pcs` : ''}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          {/* Quantity to Receive: Clearable without sticky 0 */}
                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                              {language === 'id' ? 'Jml Diterima' : 'Qty to Intake'} ({item.unit}) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={item.max_allowed}
                              placeholder="0"
                              value={item.quantity_received}
                              onChange={(e) =>
                                updateReceiveItem(
                                  index,
                                  'quantity_received',
                                  e.target.value === '' ? '' : Number(e.target.value)
                                )
                              }
                              className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] focus:outline-none font-mono transition-colors"
                              required
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowReceiveModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {language === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{language === 'id' ? 'Memproses Penerimaan Stok...' : 'Executing Stock Intake...'}</span>
                      </>
                    ) : (
                      <span>{language === 'id' ? 'Konfirmasi & Masukkan ke Stok' : 'Confirm & Intake to Stock'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: CREATE / EDIT SUPPLIER */}
        {showSupplierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 my-8 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingSupplier
                    ? (language === 'id' ? 'Ubah Data Pemasok' : 'Edit Supplier')
                    : (language === 'id' ? 'Daftarkan Pemasok Baru' : 'Register New Supplier')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
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

              <form onSubmit={handleSupplierSubmit} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Kode Pemasok' : 'Supplier Code'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'misal: SUP-001' : 'e.g. SUP-001'}
                    value={supCode}
                    onChange={(e) => setSupCode(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] font-mono text-xs uppercase transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Nama Perusahaan / Pemasok' : 'Company / Supplier Name'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'misal: PT Global Logistik Makmur' : 'e.g. PT Global Logistik Makmur'}
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Nama Kontak Person' : 'Contact Person Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'misal: Budi Santoso' : 'e.g. Budi Santoso'}
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Email</label>
                    <input
                      type="email"
                      placeholder="sales@supplier.com"
                      value={supEmail}
                      onChange={(e) => setSupEmail(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Telepon' : 'Phone'}
                    </label>
                    <input
                      type="tel"
                      placeholder="0812-3456-7890"
                      value={supPhone}
                      onChange={(e) => setSupPhone(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Alamat' : 'Address'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={language === 'id' ? 'Alamat Kantor / Pergudangan' : 'Office / Warehouse address'}
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {language === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{language === 'id' ? 'Menyimpan...' : 'Saving...'}</span>
                      </>
                    ) : (
                      <span>{language === 'id' ? 'Simpan Pemasok' : 'Save Supplier'}</span>
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

