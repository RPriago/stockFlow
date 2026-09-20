'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import {
  SalesOrder,
  SOStatus,
  Customer,
  CreateSOPayload,
  CreateSOItemPayload,
  DispatchSOPayload,
  SOStats,
  CreateCustomerPayload,
  UpdateCustomerPayload,
} from '@/types/so';
import { Product } from '@/types/product';
import { Warehouse, Location } from '@/types/warehouse';
import { InventoryItem } from '@/types/inventory';
import {
  Truck,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Warehouse as WarehouseIcon,
  RefreshCw,
  X,
  Loader2,
  Building2,
  Eye,
  Ban,
  DollarSign,
  PackageCheck,
  Clock,
  Trash2,
  Phone,
  Mail,
  User as UserIcon,
  MapPin,
  FileText,
  Boxes,
  ArrowRight,
  Send,
  Check,
  Edit2,
  ShoppingBag,
} from 'lucide-react';

interface FormLineItem {
  product_id: string;
  variant_id?: string;
  location_id: string;
  quantity_ordered: number | '';
  unit_price: number | '';
}

export default function OutboundOrdersPage() {
  const { user, role } = useAuth();
  const { t, language } = useLanguage();
  const canManage = role === 'super_admin' || role === 'warehouse_manager';
  const canCreate = role === 'super_admin' || role === 'warehouse_manager' || role === 'warehouse_staff';

  // Active Tab: 'orders' or 'customers'
  const [activeTab, setActiveTab] = useState<'orders' | 'customers'>('orders');

  // Main Data States
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<SOStats | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<Record<string, Location[]>>({});
  const [warehouseInventory, setWarehouseInventory] = useState<Record<string, InventoryItem[]>>({});

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showCreateSOModal, setShowCreateSOModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Selected Order for Details / Dispatch
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);

  // Create SO Form State
  const [soCustomerId, setSoCustomerId] = useState('');
  const [soWarehouseId, setSoWarehouseId] = useState('');
  const [soShippingAddress, setSoShippingAddress] = useState('');
  const [soNotes, setSoNotes] = useState('');
  const [soItems, setSoItems] = useState<FormLineItem[]>([]);

  // Dispatch Form State
  const [dispatchCarrier, setDispatchCarrier] = useState('JNE');
  const [customCarrier, setCustomCarrier] = useState('');
  const [dispatchTrackingNumber, setDispatchTrackingNumber] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  // Customer Form State
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custCode, setCustCode] = useState('');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custActive, setCustActive] = useState(true);

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

  // Load Metadata (Warehouses, Products, Customers)
  const loadMetadata = useCallback(async () => {
    try {
      const [whRes, prodRes, custRes] = await Promise.all([
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ products: Product[] }>('/products?limit=100'),
        api.get<Customer[]>('/customers'),
      ]);

      if (whRes.data) setWarehouses(whRes.data);
      if (prodRes.data && prodRes.data.products) setProducts(prodRes.data.products);
      if (custRes.data) setCustomers(custRes.data);
      if (whRes.data) setWarehouses(whRes.data || []);
      if (prodRes.data) setProducts(prodRes.data.products || []);
      if (custRes.data) setCustomers(custRes.data || []);
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  }, []);

  // Fetch locations & inventory for a warehouse
  const fetchWarehouseDetails = useCallback(async (whId: string) => {
    if (!whId) return;
    try {
      const [locRes, invRes] = await Promise.all([
        warehouseLocations[whId] ? Promise.resolve({ data: warehouseLocations[whId] }) : api.get<Location[]>(`/warehouses/${whId}/locations`),
        warehouseInventory[whId] ? Promise.resolve({ data: { items: warehouseInventory[whId] } }) : api.get<{ items: InventoryItem[] }>(`/inventory?warehouse_id=${whId}&limit=200`),
      ]);

      if (locRes.data && !warehouseLocations[whId]) {
        const locs: Location[] = locRes.data;
        setWarehouseLocations((prev) => ({ ...prev, [whId]: locs }));
      }
      if (invRes.data && (invRes.data as any).items && !warehouseInventory[whId]) {
        const items: InventoryItem[] = (invRes.data as any).items;
        setWarehouseInventory((prev) => ({ ...prev, [whId]: items }));
      }
    } catch (err) {
      console.error('Failed to load warehouse locations or inventory', err);
    }
  }, [warehouseLocations, warehouseInventory]);

  // Fetch Sales Orders
  const fetchOrders = useCallback(async () => {
    try {
      let query = `?limit=100`;
      if (statusFilter) query += `&status=${statusFilter}`;
      if (warehouseFilter) query += `&warehouse_id=${warehouseFilter}`;
      if (searchQuery.trim()) query += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await api.get<{ orders: SalesOrder[] }>(`/sales-orders${query}`);
      if (res.data && res.data.orders) {
        setOrders(res.data.orders);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch sales orders');
    }
  }, [statusFilter, warehouseFilter, searchQuery]);

  // Fetch SO Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<SOStats>('/sales-orders/stats');
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch SO stats', err);
    }
  }, []);

  // Fetch Customers
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await api.get<Customer[]>('/customers');
      if (res.data) {
        setCustomers(res.data);
        setCustomers(res.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch customers', err);
    }
  }, []);

  // Initial Data Load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadMetadata(), fetchOrders(), fetchStats()]);
      setIsLoading(false);
    };
    init();
  }, [loadMetadata, fetchOrders, fetchStats]);

  // When filters change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time auto-refresh across browsers
  useEffect(() => {
    const handleSync = (e: any) => {
      const resource = e?.detail?.resource;
      if (
        !resource ||
        resource === 'sales_orders' ||
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

  // Format Currency (IDR)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Helper to find available stock for a product in a bin location
  const getAvailableStockInLocation = (whId: string, prodId: string, locId: string, varId?: string): number => {
    const items = warehouseInventory[whId] || [];
    const item = items.find((i) =>
      i.product_id === prodId &&
      i.location_id === locId &&
      (!varId || i.variant_id === varId)
    );
    return item ? item.quantity_available : 0;
  };

  // Status Badge Helper
  const getStatusBadge = (status: SOStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 mr-1 text-slate-500" />
            {language === 'id' ? 'Draf' : 'Draft'}
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F4F3FF] dark:bg-[#7C6EF0]/15 text-[#6C5CE7] dark:text-[#A594FD] border border-[#E0DCFC] dark:border-[#7C6EF0]/30">
            <Boxes className="w-3 h-3 mr-1 text-[#7C6EF0]" />
            {language === 'id' ? 'Stok Direservasi' : 'Stock Reserved'}
          </span>
        );
      case 'picking':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
            <ArrowRight className="w-3 h-3 mr-1 text-amber-500" />
            {language === 'id' ? 'Pengambilan Barang' : 'Picking Items'}
          </span>
        );
      case 'packing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
            <PackageCheck className="w-3 h-3 mr-1 text-purple-500" />
            {language === 'id' ? 'Pengepakan Paket' : 'Packing Parcel'}
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
            <Truck className="w-3 h-3 mr-1 text-indigo-500" />
            {language === 'id' ? 'Dalam Pengiriman' : 'In Transit'}
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
            {language === 'id' ? 'Terkirim' : 'Delivered'}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">
            <Ban className="w-3 h-3 mr-1 text-rose-500" />
            {language === 'id' ? 'Dibatalkan' : 'Cancelled'}
          </span>
        );
      default:
        return null;
    }
  };

  // Status Stepper Component
  const renderStatusStepper = (status: SOStatus) => {
    const steps: { key: SOStatus; label: string; desc: string }[] = [
      {
        key: 'draft',
        label: language === 'id' ? 'Draf' : 'Draft',
        desc: language === 'id' ? 'Pesanan dibuat' : 'Order created',
      },
      {
        key: 'confirmed',
        label: language === 'id' ? 'Terkonfirmasi' : 'Confirmed',
        desc: language === 'id' ? 'Stok direservasi' : 'Stock reserved',
      },
      {
        key: 'picking',
        label: language === 'id' ? 'Picking' : 'Picking',
        desc: language === 'id' ? 'Barang diambil' : 'Items collected',
      },
      {
        key: 'packing',
        label: language === 'id' ? 'Packing' : 'Packing',
        desc: language === 'id' ? 'Paket dikemas' : 'Parcel boxed',
      },
      {
        key: 'shipped',
        label: language === 'id' ? 'Dikirim' : 'Shipped',
        desc: language === 'id' ? 'Stok terpotong' : 'Stock deducted',
      },
      {
        key: 'delivered',
        label: language === 'id' ? 'Selesai' : 'Delivered',
        desc: language === 'id' ? 'Pesanan diterima' : 'Order received',
      },
    ];

    if (status === 'cancelled') {
      return (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 flex items-center space-x-3 text-rose-700 dark:text-rose-300 mb-6">
          <Ban className="w-6 h-6 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">
              {language === 'id' ? 'Pesanan Telah Dibatalkan' : 'Order Has Been Cancelled'}
            </p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {language === 'id'
                ? 'Semua stok yang direservasi telah otomatis dikembalikan ke inventaris tersedia di bin masing-masing.'
                : 'All reserved stocks have been automatically returned to available inventory in their respective bins.'}
            </p>
          </div>
        </div>
      );
    }

    const currentIdx = steps.findIndex((s) => s.key === status);

    return (
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-6 gap-2">
          {steps.map((s, idx) => {
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;

            return (
              <div key={s.key} className="flex flex-col items-center text-center relative">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isDone
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/50 shadow-md'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <p
                  className={`mt-2 text-xs font-semibold ${
                    isCurrent
                      ? 'text-blue-600 dark:text-blue-400'
                      : isDone
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Open Create SO Modal
  const openCreateSOModal = (prefillCustomerId?: string) => {
    setModalError(null);
    setSoCustomerId(prefillCustomerId || (customers.length > 0 ? customers[0].id : ''));
    
    // Auto fill address if customer selected
    const cust = customers.find((c) => c.id === (prefillCustomerId || (customers[0]?.id || '')));
    if (cust) {
      setSoShippingAddress(cust.address ? `${cust.address}${cust.city ? ', ' + cust.city : ''}` : '');
    } else {
      setSoShippingAddress('');
    }

    const defaultWh = warehouses.length > 0 ? warehouses[0].id : '';
    setSoWarehouseId(defaultWh);
    if (defaultWh) {
      fetchWarehouseDetails(defaultWh);
    }
    setSoNotes('');
    setSoItems([
      {
        product_id: '',
        location_id: '',
        quantity_ordered: '',
        unit_price: '',
      },
    ]);
    setShowCreateSOModal(true);
  };

  // Handle Customer Change in Create SO Form
  const handleCustomerSelectChange = (custId: string) => {
    setSoCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust && cust.address) {
      setSoShippingAddress(`${cust.address}${cust.city ? ', ' + cust.city : ''}`);
    }
  };

  // Handle Warehouse Change in Create SO Form
  const handleWarehouseSelectChange = (whId: string) => {
    setSoWarehouseId(whId);
    fetchWarehouseDetails(whId);
    // Reset location selections for items
    setSoItems((prev) =>
      prev.map((item) => ({
        ...item,
        location_id: '',
      }))
    );
  };

  // Line Item Handlers
  const handleAddItemRow = () => {
    setSoItems((prev) => [
      ...prev,
      {
        product_id: '',
        location_id: '',
        quantity_ordered: '',
        unit_price: '',
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (soItems.length <= 1) return;
    setSoItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemProductChange = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    setSoItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        product_id: prodId,
        variant_id: undefined,
        unit_price: prod ? prod.price : '',
      };
      return updated;
    });
  };

  const handleItemFieldChange = (index: number, field: keyof FormLineItem, value: any) => {
    setSoItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Running calculations for SO Form
  const calculatedGrandTotal = useMemo(() => {
    return soItems.reduce((sum, item) => {
      const qty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
      const price = typeof item.unit_price === 'number' ? item.unit_price : 0;
      return sum + qty * price;
    }, 0);
  }, [soItems]);

  const calculatedTotalQuantity = useMemo(() => {
    return soItems.reduce((sum, item) => {
      const qty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
      return sum + qty;
    }, 0);
  }, [soItems]);

  // Submit Create Sales Order
  const handleCreateSO = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!soCustomerId) {
      setModalError('Please select a customer.');
      return;
    }
    if (!soWarehouseId) {
      setModalError('Please select a warehouse.');
      return;
    }
    if (!soShippingAddress.trim()) {
      setModalError('Please provide a shipping address.');
      return;
    }

    if (soItems.length === 0) {
      setModalError('Order must contain at least one line item.');
      return;
    }

    const payloadItems: CreateSOItemPayload[] = [];
    for (let i = 0; i < soItems.length; i++) {
      const item = soItems[i];
      if (!item.product_id) {
        setModalError(`Line item #${i + 1}: Please select a product.`);
        return;
      }
      if (!item.location_id) {
        setModalError(`Line item #${i + 1}: Please select a bin location.`);
        return;
      }
      if (typeof item.quantity_ordered !== 'number' || item.quantity_ordered <= 0) {
        setModalError(`Line item #${i + 1}: Quantity must be greater than 0.`);
        return;
      }
      if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
        setModalError(`Line item #${i + 1}: Unit price cannot be negative.`);
        return;
      }

      payloadItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || undefined,
        location_id: item.location_id,
        quantity_ordered: item.quantity_ordered,
        unit_price: item.unit_price,
      });
    }

    const payload: CreateSOPayload = {
      customer_id: soCustomerId,
      warehouse_id: soWarehouseId,
      shipping_address: soShippingAddress.trim(),
      notes: soNotes.trim() || undefined,
      items: payloadItems,
    };

    setIsSubmitting(true);
    try {
      const res = await api.post<SalesOrder>('/sales-orders', payload);
      setShowCreateSOModal(false);
      setSuccessMsg(`Sales Order ${res.data?.order_number || ''} created successfully as Draft.`);
      fetchOrders();
      fetchStats();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create sales order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Workflow Actions
  const handleConfirmSO = async (orderId: string) => {
    if (!confirm('Confirm this order? This will reserve available stock in the specified bin locations.')) return;
    try {
      setIsSubmitting(true);
      await api.post(`/sales-orders/${orderId}/confirm`);
      setSuccessMsg('Order confirmed! Inventory has been successfully reserved.');
      fetchOrders();
      fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${orderId}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to confirm order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartPicking = async (orderId: string) => {
    try {
      setIsSubmitting(true);
      await api.post(`/sales-orders/${orderId}/picking`);
      setSuccessMsg('Order moved to Picking status. Pickers may now collect items from bins.');
      fetchOrders();
      fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${orderId}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update order status to picking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartPacking = async (orderId: string) => {
    try {
      setIsSubmitting(true);
      await api.post(`/sales-orders/${orderId}/packing`);
      setSuccessMsg('Order moved to Packing status. Items are ready to be boxed.');
      fetchOrders();
      fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${orderId}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update order status to packing');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDispatchModal = (order: SalesOrder) => {
    setSelectedOrder(order);
    setDispatchCarrier('JNE');
    setCustomCarrier('');
    setDispatchTrackingNumber('');
    setDispatchNotes('');
    setModalError(null);
    setShowDispatchModal(true);
  };

  const handleDispatchSO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setModalError(null);

    const carrierName = dispatchCarrier === 'Other' ? customCarrier.trim() : dispatchCarrier;
    if (!carrierName) {
      setModalError('Please specify the delivery carrier.');
      return;
    }
    if (!dispatchTrackingNumber.trim()) {
      setModalError('Please enter a tracking / AWB number.');
      return;
    }

    const payload: DispatchSOPayload = {
      carrier: carrierName,
      tracking_number: dispatchTrackingNumber.trim(),
      notes: dispatchNotes.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await api.post(`/sales-orders/${selectedOrder.id}/dispatch`, payload);
      setShowDispatchModal(false);
      setSuccessMsg(`Order ${selectedOrder.order_number} dispatched! Reserved stock was deducted and stock-out ledger recorded.`);
      fetchOrders();
      fetchStats();
      if (selectedOrder) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${selectedOrder.id}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to dispatch order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeliverSO = async (orderId: string) => {
    if (!confirm('Mark this order as delivered?')) return;
    try {
      setIsSubmitting(true);
      await api.post(`/sales-orders/${orderId}/deliver`);
      setSuccessMsg('Order marked as delivered successfully.');
      fetchOrders();
      fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${orderId}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to mark order delivered');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSO = async (orderId: string) => {
    if (!confirm('Cancel this sales order? Any reserved inventory will be automatically released back to available stock.')) return;
    try {
      setIsSubmitting(true);
      await api.post(`/sales-orders/${orderId}/cancel`);
      setSuccessMsg('Sales order cancelled and reserved stock successfully released.');
      fetchOrders();
      fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await api.get<SalesOrder>(`/sales-orders/${orderId}`);
        if (updated.data) setSelectedOrder(updated.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel sales order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Customer Management Handlers
  const openCustomerModal = (customer?: Customer) => {
    setModalError(null);
    if (customer) {
      setEditingCustomer(customer);
      setCustCode(customer.code);
      setCustName(customer.name);
      setCustEmail(customer.email || '');
      setCustPhone(customer.phone || '');
      setCustAddress(customer.address || '');
      setCustCity(customer.city || '');
      setCustActive(customer.is_active);
    } else {
      setEditingCustomer(null);
      setCustCode('');
      setCustName('');
      setCustEmail('');
      setCustPhone('');
      setCustAddress('');
      setCustCity('');
      setCustActive(true);
    }
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!custName.trim()) {
      setModalError('Customer name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        const payload: UpdateCustomerPayload = {
          name: custName.trim(),
          email: custEmail.trim() || undefined,
          phone: custPhone.trim() || undefined,
          address: custAddress.trim() || undefined,
          city: custCity.trim() || undefined,
          is_active: custActive,
        };
        await api.put(`/customers/${editingCustomer.id}`, payload);
        setSuccessMsg('Customer updated successfully.');
      } else {
        const payload: CreateCustomerPayload = {
          code: custCode.trim() || undefined,
          name: custName.trim(),
          email: custEmail.trim() || undefined,
          phone: custPhone.trim() || undefined,
          address: custAddress.trim() || undefined,
          city: custCity.trim() || undefined,
        };
        await api.post('/customers', payload);
        setSuccessMsg('Customer created successfully.');
      }
      setShowCustomerModal(false);
      fetchCustomers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [customers, customerSearchQuery]);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
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

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
              {language === 'id' ? 'Sales Order & Pemenuhan Pengiriman' : 'Sales Orders & Outbound Fulfillment'}
            </h1>
            <p className="mt-1 text-sm text-[#8B8B99] dark:text-slate-400">
              {language === 'id'
                ? 'Kelola pesanan penjualan, reservasi stok, alur pick/pack, dan pengiriman ekspedisi.'
                : 'Manage outbound orders, stock reservations, pick/pack pipeline, and carrier dispatch.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                fetchOrders();
                fetchStats();
                fetchCustomers();
              }}
              className="p-2.5 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#8B8B99] dark:text-slate-400 hover:text-[#7C6EF0] hover:border-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
              title={language === 'id' ? 'Segarkan Data' : 'Refresh Data'}
            >
              <RefreshCw className="w-4 h-4 stroke-[1.8]" />
            </button>

            {canCreate && (
              <button
                onClick={() => openCreateSOModal()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] text-white text-sm font-semibold hover:bg-[#6C5CE7] transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{language === 'id' ? 'Sales Order Baru' : 'New Sales Order'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {language === 'id' ? 'Total Pesanan' : 'Total Orders'}
              </span>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.total_orders ?? 0}
            </p>
            <span className="text-xs text-slate-400">
              {language === 'id' ? 'Semua pesanan keluar' : 'All outbound orders'}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {language === 'id' ? 'Pemenuhan' : 'Fulfillment'}
              </span>
              <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.pending_fulfillment ?? 0}
            </p>
            <span className="text-xs text-slate-400">
              {language === 'id' ? 'Direservasi / Pick / Pack' : 'Reserved / Pick / Pack'}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {language === 'id' ? 'Dalam Pengiriman' : 'In Transit'}
              </span>
              <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.shipped_orders ?? 0}
            </p>
            <span className="text-xs text-slate-400">
              {language === 'id' ? 'Dikirim via ekspedisi' : 'Shipped with carrier'}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {language === 'id' ? 'Terkirim' : 'Delivered'}
              </span>
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {stats?.delivered_orders ?? 0}
            </p>
            <span className="text-xs text-slate-400">
              {language === 'id' ? 'Pengiriman selesai' : 'Completed deliveries'}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {language === 'id' ? 'Total Pendapatan' : 'Total Revenue'}
              </span>
              <div className="w-8 h-8 rounded-full bg-[#F4F3FF] dark:bg-[#7C6EF0]/15 text-[#7C6EF0] dark:text-[#A594FD] flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white truncate">
              {formatCurrency(stats?.total_revenue ?? 0)}
            </p>
            <span className="text-xs text-slate-400">
              {language === 'id' ? 'Dikirim & Terkirim' : 'Dispatched & Delivered'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-4 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'orders'
                ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>{language === 'id' ? 'Sales Order' : 'Sales Orders'}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'customers'
                ? 'border-[#7C6EF0] text-[#7C6EF0] dark:border-[#9B8DFC] dark:text-[#9B8DFC]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{language === 'id' ? 'Direktori Pelanggan' : 'Customer Directory'}</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {customers.length}
            </span>
          </button>
        </div>

        {/* TAB 1: SALES ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'id' ? 'Cari no. pesanan, pelanggan, atau catatan...' : 'Search by Order #, Customer, or Notes...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Warehouse Filter */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
                  <WarehouseIcon className="w-4 h-4" />
                  <span>{language === 'id' ? 'Gudang:' : 'Warehouse:'}</span>
                </div>
                <select
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">{language === 'id' ? 'Semua Gudang' : 'All Warehouses'}</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: language === 'id' ? 'Semua Status' : 'All Statuses', val: '' },
                { label: language === 'id' ? 'Draf' : 'Draft', val: 'draft' },
                { label: language === 'id' ? 'Terkonfirmasi (Direservasi)' : 'Confirmed (Reserved)', val: 'confirmed' },
                { label: language === 'id' ? 'Pengambilan (Picking)' : 'Picking', val: 'picking' },
                { label: language === 'id' ? 'Pengepakan (Packing)' : 'Packing', val: 'packing' },
                { label: language === 'id' ? 'Dikirim (Dalam Perjalanan)' : 'Shipped (In Transit)', val: 'shipped' },
                { label: language === 'id' ? 'Terkirim' : 'Delivered', val: 'delivered' },
                { label: language === 'id' ? 'Dibatalkan' : 'Cancelled', val: 'cancelled' },
              ].map((pill) => (
                <button
                  key={pill.val}
                  onClick={() => setStatusFilter(pill.val)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    statusFilter === pill.val
                      ? 'bg-[#7C6EF0] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Orders Table */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="p-12 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[#7C6EF0] animate-spin" />
                  <p className="text-sm text-slate-500">
                    {language === 'id' ? 'Memuat sales order...' : 'Loading sales orders...'}
                  </p>
                </div>
              ) : orders.length === 0 ? (
                <div className="p-12 text-center">
                  <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'id' ? 'Tidak ada sales order ditemukan' : 'No sales orders found'}
                  </p>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto mt-1">
                    {searchQuery || statusFilter || warehouseFilter
                      ? (language === 'id' ? 'Coba sesuaikan filter atau kata kunci pencarian Anda.' : 'Try adjusting your filters or search terms.')
                      : (language === 'id' ? 'Buat sales order pertama Anda untuk memulai proses pemenuhan.' : 'Create your first sales order to begin the fulfillment process.')}
                  </p>
                  {canCreate && !searchQuery && !statusFilter && (
                    <button
                      onClick={() => openCreateSOModal()}
                      className="mt-4 inline-flex items-center px-4 py-2 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-sm font-semibold rounded-xl space-x-2 transition-colors shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{language === 'id' ? 'Buat Sales Order' : 'Create Sales Order'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-xs">
                      <tr>
                        <th className="px-6 py-4">{language === 'id' ? 'No. Pesanan' : 'Order #'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Pelanggan' : 'Customer'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Gudang' : 'Warehouse'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Item / Jml' : 'Items / Qty'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Total Nilai' : 'Total Amount'}</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Tanggal' : 'Date'}</th>
                        <th className="px-6 py-4 text-right">{language === 'id' ? 'Aksi' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {orders.map((so) => (
                        <tr
                          key={so.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <button
                              onClick={() => {
                                setSelectedOrder(so);
                                setShowDetailModal(true);
                              }}
                              className="font-mono font-semibold text-[#7C6EF0] dark:text-[#A594FD] hover:underline"
                            >
                              {so.order_number}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {so.customer_name}
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-[200px]">
                              {so.shipping_address}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {so.warehouse_name}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {so.items?.length || 0} {language === 'id' ? 'item' : (so.items?.length || 0) > 1 ? 'items' : 'item'}
                            </div>
                            <div className="text-xs text-slate-400">
                              {so.total_quantity} unit
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(so.total_amount)}
                          </td>
                          <td className="px-6 py-4">{getStatusBadge(so.status)}</td>
                          <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(so.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {/* View Details */}
                              <button
                                onClick={() => {
                                  setSelectedOrder(so);
                                  setShowDetailModal(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title={language === 'id' ? 'Lihat Detail' : 'View Details'}
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Action: Confirm Draft */}
                              {canManage && so.status === 'draft' && (
                                <button
                                  onClick={() => handleConfirmSO(so.id)}
                                  className="px-2.5 py-1 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Konfirmasi & Reservasi Stok' : 'Confirm & Reserve Stock'}
                                >
                                  <Boxes className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Konfirmasi' : 'Confirm'}</span>
                                </button>
                              )}

                              {/* Action: Start Picking */}
                              {so.status === 'confirmed' && (
                                <button
                                  onClick={() => handleStartPicking(so.id)}
                                  className="px-2.5 py-1 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Mulai Pengambilan Barang' : 'Start Picking Items'}
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Ambil' : 'Pick'}</span>
                                </button>
                              )}

                              {/* Action: Mark Packed */}
                              {so.status === 'picking' && (
                                <button
                                  onClick={() => handleStartPacking(so.id)}
                                  className="px-2.5 py-1 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Tandai Barang Dikemas' : 'Mark Items as Packed'}
                                >
                                  <PackageCheck className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Kemas' : 'Pack'}</span>
                                </button>
                              )}

                              {/* Action: Dispatch & Ship */}
                              {so.status === 'packing' && (
                                <button
                                  onClick={() => openDispatchModal(so)}
                                  className="px-2.5 py-1 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Kirim Pesanan' : 'Dispatch & Ship Order'}
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Kirim' : 'Ship'}</span>
                                </button>
                              )}

                              {/* Action: Mark Delivered */}
                              {so.status === 'shipped' && (
                                <button
                                  onClick={() => handleDeliverSO(so.id)}
                                  className="px-2.5 py-1 bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Tandai Terkirim' : 'Mark Delivered'}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Terkirim' : 'Delivered'}</span>
                                </button>
                              )}

                              {/* Action: Cancel (if not shipped, delivered, or cancelled) */}
                              {canManage &&
                                (so.status === 'draft' ||
                                  so.status === 'confirmed' ||
                                  so.status === 'picking' ||
                                  so.status === 'packing') && (
                                  <button
                                    onClick={() => handleCancelSO(so.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                                    title={language === 'id' ? 'Batalkan Pesanan' : 'Cancel Order'}
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER DIRECTORY */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            {/* Customer Search & Action */}
            <div className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'id' ? 'Cari pelanggan berdasarkan nama, kode, kota, email...' : 'Search customers by name, code, city, email...'}
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {canCreate && (
                <button
                  onClick={() => openCustomerModal()}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{language === 'id' ? 'Tambah Pelanggan' : 'Add Customer'}</span>
                </button>
              )}
            </div>

            {/* Customers Table */}
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {filteredCustomers.length === 0 ? (
                <div className="p-12 text-center">
                  <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'id' ? 'Tidak ada pelanggan ditemukan' : 'No customers found'}
                  </p>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto mt-1">
                    {customerSearchQuery
                      ? (language === 'id' ? 'Coba sesuaikan kriteria pencarian Anda.' : 'Try adjusting your search criteria.')
                      : (language === 'id' ? 'Tambahkan klien ke direktori Anda untuk mulai membuat sales order.' : 'Add clients to your directory to begin issuing sales orders.')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-xs">
                      <tr>
                        <th className="px-6 py-4">{language === 'id' ? 'Kode Pelanggan' : 'Customer Code'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Perusahaan / Nama' : 'Company / Name'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Kontak' : 'Contact'}</th>
                        <th className="px-6 py-4">{language === 'id' ? 'Kota / Alamat' : 'City / Address'}</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">{language === 'id' ? 'Aksi' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredCustomers.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-6 py-4 font-mono font-semibold text-slate-900 dark:text-white">
                            {c.code}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                            {c.name}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {c.email && (
                                <div className="flex items-center space-x-1.5">
                                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{c.email}</span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center space-x-1.5">
                                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{c.phone}</span>
                                </div>
                              )}
                              {!c.email && !c.phone && <span className="text-slate-400">-</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {c.city || '-'}
                            </div>
                            <div className="text-slate-400 truncate max-w-[220px]">
                              {c.address || ''}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {c.is_active ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                {language === 'id' ? 'Aktif' : 'Active'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {language === 'id' ? 'Tidak Aktif' : 'Inactive'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {canManage && (
                                <button
                                  onClick={() => openCustomerModal(c)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                  title={language === 'id' ? 'Ubah Pelanggan' : 'Edit Customer'}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {canCreate && (
                                <button
                                  onClick={() => openCreateSOModal(c.id)}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1"
                                  title={language === 'id' ? 'Buat Sales Order untuk Pelanggan' : 'Issue Sales Order for Customer'}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{language === 'id' ? 'Buat SO' : 'Create SO'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL 1: CREATE SALES ORDER */}
        {showCreateSOModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-4xl my-8 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {language === 'id' ? 'Buat Sales Order' : 'Create Sales Order'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateSOModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSO} className="p-6 space-y-6">
                {modalError && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Header Information (Customer, Warehouse, Shipping Address) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Pelanggan' : 'Customer'} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={soCustomerId}
                      onChange={(e) => handleCustomerSelectChange(e.target.value)}
                      required
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    >
                      <option value="">{language === 'id' ? 'Pilih Pelanggan...' : 'Select Customer...'}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code}){c.city ? ` — ${c.city}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Gudang Pemenuhan' : 'Fulfillment Warehouse'} <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={soWarehouseId}
                      onChange={(e) => handleWarehouseSelectChange(e.target.value)}
                      required
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    >
                      <option value="">{language === 'id' ? 'Pilih Gudang...' : 'Select Warehouse...'}</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} ({wh.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Alamat Pengiriman Penerima' : 'Delivery Shipping Address'} <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={soShippingAddress}
                      onChange={(e) => setSoShippingAddress(e.target.value)}
                      placeholder={language === 'id' ? 'Masukkan alamat tujuan pengiriman lengkap dengan kontak penerima...' : 'Enter destination shipping address with recipient details...'}
                      required
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Catatan / Instruksi (Opsional)' : 'Notes / Instructions (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={soNotes}
                      onChange={(e) => setSoNotes(e.target.value)}
                      placeholder={language === 'id' ? 'Penanganan khusus, instruksi pengiriman cepat, dll.' : 'Special handling, expedited delivery instructions, etc.'}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                </div>

                {/* Line Items Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {language === 'id' ? 'Daftar Item Pesanan' : 'Order Items'} ({soItems.length})
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#7C6EF0] dark:text-[#9B8FF3] bg-[#7C6EF0]/10 hover:bg-[#7C6EF0]/20 rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{language === 'id' ? 'Tambah Item' : 'Add Item'}</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                    {soItems.map((item, idx) => {
                      const selectedProd = products.find((p) => p.id === item.product_id);
                      const availableLocations = warehouseLocations[soWarehouseId] || [];
                      const availInLoc = item.location_id && soWarehouseId && item.product_id
                        ? getAvailableStockInLocation(soWarehouseId, item.product_id, item.location_id, item.variant_id)
                        : null;

                      const itemQty = typeof item.quantity_ordered === 'number' ? item.quantity_ordered : 0;
                      const itemPrice = typeof item.unit_price === 'number' ? item.unit_price : 0;
                      const subtotal = itemQty * itemPrice;

                      return (
                        <div
                          key={idx}
                          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-[#EEEDF5] dark:border-slate-800 shadow-2xs space-y-3"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Item #{idx + 1}</span>
                            {soItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                            {/* Product */}
                            <div className="md:col-span-4">
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                {language === 'id' ? 'Produk' : 'Product'} <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={item.product_id}
                                onChange={(e) => handleItemProductChange(idx, e.target.value)}
                                required
                                className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                              >
                                <option value="">{language === 'id' ? 'Pilih Produk...' : 'Select Product...'}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Bin Location */}
                            <div className="md:col-span-3">
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                {language === 'id' ? 'Lokasi Bin' : 'Bin Location'} <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={item.location_id}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, 'location_id', e.target.value)
                                }
                                required
                                disabled={!soWarehouseId}
                                className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors disabled:opacity-50"
                              >
                                <option value="">{language === 'id' ? 'Pilih Lokasi Bin...' : 'Select Bin Location...'}</option>
                                {availableLocations.map((loc) => {
                                  const stock = item.product_id
                                    ? getAvailableStockInLocation(soWarehouseId, item.product_id, loc.id, item.variant_id)
                                    : 0;
                                  return (
                                    <option key={loc.id} value={loc.id}>
                                      {loc.code} ({loc.type}) {item.product_id ? `— ${language === 'id' ? 'Tersedia:' : 'Avail:'} ${stock}` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              {availInLoc !== null && (
                                <p
                                  className={`text-[11px] mt-1.5 ${
                                    availInLoc >= itemQty && itemQty > 0
                                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                      : itemQty > availInLoc
                                      ? 'text-rose-600 dark:text-rose-400 font-bold'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {language === 'id' ? `Tersedia: ${availInLoc} unit` : `Available: ${availInLoc} units`}
                                  {itemQty > availInLoc && (language === 'id' ? ' (Stok kurang!)' : ' (Exceeds stock!)')}
                                </p>
                              )}
                            </div>

                            {/* Quantity */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                {language === 'id' ? 'Jml' : 'Qty'} ({selectedProd?.unit || 'pcs'}) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="1"
                                placeholder="0"
                                value={item.quantity_ordered === '' ? '' : item.quantity_ordered}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    handleItemFieldChange(idx, 'quantity_ordered', '');
                                  } else {
                                    const parsed = parseInt(val, 10);
                                    handleItemFieldChange(
                                      idx,
                                      'quantity_ordered',
                                      isNaN(parsed) ? '' : Math.max(0, parsed)
                                    );
                                  }
                                }}
                                required
                                className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                              />
                            </div>

                            {/* Unit Price */}
                            <div className="md:col-span-3">
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                                {language === 'id' ? 'Harga Satuan (IDR)' : 'Unit Price (IDR)'} <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                placeholder="0"
                                value={item.unit_price === '' ? '' : item.unit_price}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    handleItemFieldChange(idx, 'unit_price', '');
                                  } else {
                                    const parsed = parseFloat(val);
                                    handleItemFieldChange(
                                      idx,
                                      'unit_price',
                                      isNaN(parsed) ? '' : Math.max(0, parsed)
                                    );
                                  }
                                }}
                                required
                                className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                              />
                              <p className="text-[11px] text-right font-medium text-slate-500 dark:text-slate-400 mt-1.5">
                                Subtotal: <strong className="text-slate-900 dark:text-white">{formatCurrency(subtotal)}</strong>
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Totals & Submit */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <span className="text-slate-500 dark:text-slate-400">
                      {language === 'id' ? 'Total Unit: ' : 'Total Units: '}
                      <strong className="text-slate-900 dark:text-white">{calculatedTotalQuantity}</strong>
                    </span>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {language === 'id' ? 'Total Keseluruhan: ' : 'Grand Total: '}{formatCurrency(calculatedGrandTotal)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowCreateSOModal(false)}
                      className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {language === 'id' ? 'Batal' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{language === 'id' ? 'Buat Pesanan (Draf)' : 'Create Order (Draft)'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: ORDER DETAILS & WORKFLOW STEPPER */}
        {showDetailModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-3xl my-8 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                    {selectedOrder.order_number}
                  </span>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* 6-Stage Progress Stepper */}
                {renderStatusStepper(selectedOrder.status)}

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="space-y-2">
                    <div>
                      <span className="text-slate-400">{language === 'id' ? 'Pelanggan:' : 'Customer:'}</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {selectedOrder.customer_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">{language === 'id' ? 'Alamat Pengiriman:' : 'Shipping Address:'}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                        {selectedOrder.shipping_address}
                      </p>
                    </div>
                    {selectedOrder.carrier && (
                      <div>
                        <span className="text-slate-400">{language === 'id' ? 'Ekspedisi & Resi:' : 'Carrier & Tracking:'}</span>
                        <p className="font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {selectedOrder.carrier} — {selectedOrder.tracking_number}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-slate-400">{language === 'id' ? 'Gudang:' : 'Warehouse:'}</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedOrder.warehouse_name}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">{language === 'id' ? 'Dibuat Oleh:' : 'Created By:'}</span>
                      <p className="text-slate-700 dark:text-slate-300">
                        {selectedOrder.created_by_name} {language === 'id' ? 'pada' : 'on'}{' '}
                        {new Date(selectedOrder.created_at).toLocaleString()}
                      </p>
                    </div>
                    {selectedOrder.confirmed_at && (
                      <div>
                        <span className="text-slate-400">{language === 'id' ? 'Stok Direservasi Pada:' : 'Stock Reserved At:'}</span>
                        <p className="text-slate-700 dark:text-slate-300">
                          {new Date(selectedOrder.confirmed_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {selectedOrder.shipped_at && (
                      <div>
                        <span className="text-slate-400">{language === 'id' ? 'Dikirim Pada:' : 'Dispatched At:'}</span>
                        <p className="text-slate-700 dark:text-slate-300">
                          {new Date(selectedOrder.shipped_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {selectedOrder.delivered_at && (
                      <div>
                        <span className="text-slate-400">{language === 'id' ? 'Diterima Pada:' : 'Delivered At:'}</span>
                        <p className="text-slate-700 dark:text-slate-300">
                          {new Date(selectedOrder.delivered_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {language === 'id' ? 'Rincian Item Pesanan' : 'Order Items Breakdown'}
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-3">{language === 'id' ? 'Produk' : 'Product'}</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">{language === 'id' ? 'Lokasi Bin' : 'Bin Location'}</th>
                          <th className="px-4 py-3 text-right">{language === 'id' ? 'Jml' : 'Qty'}</th>
                          <th className="px-4 py-3 text-right">{language === 'id' ? 'Harga Satuan' : 'Unit Price'}</th>
                          <th className="px-4 py-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedOrder.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                              {item.product_name}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400">{item.sku}</td>
                            <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">
                              {item.location_code}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                              {item.quantity_ordered} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                              {formatCurrency(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/70 font-semibold border-t border-slate-200 dark:border-slate-800">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            Total
                          </td>
                          <td className="px-4 py-3 text-right text-slate-900 dark:text-white">
                            {selectedOrder.total_quantity} unit
                          </td>
                          <td></td>
                          <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 text-sm">
                            {formatCurrency(selectedOrder.total_amount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  {/* Cancel Button */}
                  {canManage &&
                    (selectedOrder.status === 'draft' ||
                      selectedOrder.status === 'confirmed' ||
                      selectedOrder.status === 'picking' ||
                      selectedOrder.status === 'packing') && (
                      <button
                        type="button"
                        onClick={() => handleCancelSO(selectedOrder.id)}
                        className="px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1"
                      >
                        <Ban className="w-4 h-4" />
                        <span>{language === 'id' ? 'Batalkan Pesanan' : 'Cancel Order'}</span>
                      </button>
                    )}

                  <div className="flex items-center space-x-3 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowDetailModal(false)}
                      className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold transition-colors"
                    >
                      {language === 'id' ? 'Tutup' : 'Close'}
                    </button>

                    {/* Step Transitions */}
                    {canManage && selectedOrder.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleConfirmSO(selectedOrder.id)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        <span>{language === 'id' ? 'Konfirmasi & Reservasi Stok' : 'Confirm & Reserve Stock'}</span>
                      </button>
                    )}

                    {selectedOrder.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => handleStartPicking(selectedOrder.id)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>{language === 'id' ? 'Mulai Pengambilan' : 'Start Picking'}</span>
                      </button>
                    )}

                    {selectedOrder.status === 'picking' && (
                      <button
                        type="button"
                        onClick={() => handleStartPacking(selectedOrder.id)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>{language === 'id' ? 'Tandai Dikemas' : 'Mark Packed'}</span>
                      </button>
                    )}

                    {selectedOrder.status === 'packing' && (
                      <button
                        type="button"
                        onClick={() => openDispatchModal(selectedOrder)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>{language === 'id' ? 'Kirim Pesanan' : 'Dispatch & Ship Order'}</span>
                      </button>
                    )}

                    {selectedOrder.status === 'shipped' && (
                      <button
                        type="button"
                        onClick={() => handleDeliverSO(selectedOrder.id)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === 'id' ? 'Tandai Terkirim' : 'Mark as Delivered'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: DISPATCH & SHIP ORDER */}
        {showDispatchModal && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {language === 'id' ? `Kirim Pesanan ${selectedOrder.order_number}` : `Dispatch Order ${selectedOrder.order_number}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleDispatchSO} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Inventory deduction warning alert */}
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs space-y-1">
                  <div className="flex items-center space-x-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>{language === 'id' ? 'Peringatan Pemotongan Stok' : 'Inventory Deduction Warning'}</span>
                  </div>
                  <p>
                    {language === 'id' ? (
                      <>Mengonfirmasi pengiriman akan segera melepaskan <strong>{selectedOrder.total_quantity} unit terpesan</strong> dan memotongnya dari stok fisik di lokasi bin yang dialokasikan, serta mencatat transaksi resmi <code>stock_out</code>.</>
                    ) : (
                      <>Confirming dispatch will immediately release <strong>{selectedOrder.total_quantity} reserved units</strong> and deduct them from physical on-hand inventory across the allocated bin locations, creating an official <code>stock_out</code> ledger record.</>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Kurir Pengiriman / Logistik' : 'Shipping Carrier / Logistics'} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={dispatchCarrier}
                    onChange={(e) => setDispatchCarrier(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  >
                    <option value="JNE">JNE Express</option>
                    <option value="SiCepat">SiCepat Express</option>
                    <option value="J&T">J&T Express</option>
                    <option value="Anteraja">Anteraja</option>
                    <option value="Pos Indonesia">Pos Indonesia</option>
                    <option value="GoSend">GoSend (Instant/Same Day)</option>
                    <option value="GrabExpress">GrabExpress</option>
                    <option value="Internal Fleet">{language === 'id' ? 'Armada Pengiriman Internal' : 'Internal Delivery Fleet'}</option>
                    <option value="Other">{language === 'id' ? 'Kurir Lainnya...' : 'Other Carrier...'}</option>
                  </select>
                </div>

                {dispatchCarrier === 'Other' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Nama Kurir' : 'Carrier Name'} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'cth. DHL, FedEx, Kargo...' : 'e.g. DHL, FedEx, Cargo...'}
                      value={customCarrier}
                      onChange={(e) => setCustomCarrier(e.target.value)}
                      required
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Nomor Resi / AWB / Waybill' : 'Tracking / AWB / Waybill Number'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'cth. JNE-01928374619' : 'e.g. JNE-01928374619'}
                    value={dispatchTrackingNumber}
                    onChange={(e) => setDispatchTrackingNumber(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Catatan Pengiriman (Opsional)' : 'Dispatch Notes (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'Nama kurir, plat nomor kendaraan, atau catatan...' : 'Driver name, vehicle plate, or handoff notes...'}
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
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
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Truck className="w-4 h-4" />
                    )}
                    <span>{language === 'id' ? 'Konfirmasi & Kirim Pesanan' : 'Confirm & Ship Order'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: ADD / EDIT CUSTOMER */}
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingCustomer ? (language === 'id' ? 'Edit Pelanggan' : 'Edit Customer') : (language === 'id' ? 'Tambah Pelanggan Baru' : 'Add New Customer')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Kode Pelanggan' : 'Customer Code'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'cth. CUST-001 (Otomatis jika kosong)' : 'e.g. CUST-001 (Auto if empty)'}
                      value={custCode}
                      onChange={(e) => setCustCode(e.target.value)}
                      disabled={!!editingCustomer}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Kota / Wilayah' : 'City / Region'}
                    </label>
                    <input
                      type="text"
                      placeholder={language === 'id' ? 'cth. Jakarta, Surabaya...' : 'e.g. Jakarta, Surabaya...'}
                      value={custCity}
                      onChange={(e) => setCustCity(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Nama Pelanggan / Usaha' : 'Customer / Business Name'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'id' ? 'cth. PT Mitra Sejahtera' : 'e.g. PT Mitra Sejahtera'}
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    required
                    className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Alamat Email' : 'Email Address'}
                    </label>
                    <input
                      type="email"
                      placeholder="orders@customer.com"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {language === 'id' ? 'Nomor Telepon' : 'Phone Number'}
                    </label>
                    <input
                      type="text"
                      placeholder="+62 812-xxxx-xxxx"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Alamat Pengiriman / Kantor' : 'Shipping / Office Address'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={language === 'id' ? 'Alamat lengkap jalan...' : 'Full street address...'}
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
                  />
                </div>

                {editingCustomer && (
                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="checkbox"
                      id="custActive"
                      checked={custActive}
                      onChange={(e) => setCustActive(e.target.checked)}
                      className="w-4 h-4 text-[#7C6EF0] rounded border-slate-300 focus:ring-[#7C6EF0]"
                    />
                    <label
                      htmlFor="custActive"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      {language === 'id' ? 'Pelanggan Aktif' : 'Active Customer'}
                    </label>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {language === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{editingCustomer ? (language === 'id' ? 'Perbarui Pelanggan' : 'Update Customer') : (language === 'id' ? 'Simpan Pelanggan' : 'Save Customer')}</span>
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
