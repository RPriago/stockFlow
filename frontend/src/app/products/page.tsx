'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Product, Category, ProductListResult } from '@/types/product';
import { InventoryStats } from '@/types/inventory';
import { api } from '@/lib/api';
import {
  Package,
  Plus,
  Search,
  FolderPlus,
  Edit2,
  Trash2,
  X,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Upload,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

const STANDARD_UNITS = ['pcs', 'box', 'kg', 'pair', 'bundle', 'meter', 'liter', 'carton', 'roll'];

export default function ProductsPage() {
  const { role } = useAuth();
  const { t, language } = useLanguage();
  const canManage = role === 'super_admin' || role === 'warehouse_manager';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [totalCount, setTotalCount] = useState(0);
  const [invStats, setInvStats] = useState<InventoryStats | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Reference mockup UI states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Responsive KPI metrics collapse state
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Product Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formMinStock, setFormMinStock] = useState<number | ''>(10);
  const [formPrice, setFormPrice] = useState<number | ''>('');
  const [formCostPrice, setFormCostPrice] = useState<number | ''>('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formVariants, setFormVariants] = useState<
    { name: string; sku: string; price: number | ''; cost_price: number | ''; min_stock: number | ''; attributeKey: string; attributeVal: string }[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Category Form state
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [isCatSubmitting, setIsCatSubmitting] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<Category[]>('/categories');
      if (res.success && res.data) {
        setCategories(res.data);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  // Fetch Inventory Stats
  const fetchInventoryStats = useCallback(async () => {
    try {
      const res = await api.get<InventoryStats>('/inventory/stats');
      if (res.success && res.data) {
        setInvStats(res.data);
      }
    } catch {
      // Fallback gracefully to local calculation
    }
  }, []);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      let query = `/products?page=1&limit=100&include_deleted=true`;
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (selectedCategory) query += `&category_id=${encodeURIComponent(selectedCategory)}`;

      const res = await api.get<ProductListResult>(query);
      if (res.success && res.data) {
        setProducts(res.data.products || []);
        setTotalCount(res.data.meta?.total || 0);
        setCurrentTime(Date.now());
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Failed to load product catalog');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory]);

  // Filter products by status (All, Active, Archived)
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (statusFilter === 'active') {
      return products.filter((p) => !p.is_deleted);
    }
    if (statusFilter === 'archived') {
      return products.filter((p) => p.is_deleted);
    }
    return products;
  }, [products, statusFilter]);

  // Precise 7-day metric calculations (rounded to 1 decimal place)
  const { prodMetrics, valMetrics, catMetrics, lowStockMetrics } = useMemo(() => {
    const now = currentTime || 0;
    const sevenDaysAgo = now > 0 ? now - 7 * 24 * 60 * 60 * 1000 : 0;

    // Active products
    const activeProducts = products.filter((p) => !p.is_deleted);
    const totalActive = activeProducts.length;

    // Products created in the last 7 days
    const recentProducts = activeProducts.filter((p) => {
      if (sevenDaysAgo === 0) return false;
      return new Date(p.created_at).getTime() >= sevenDaysAgo;
    });
    const baselineProductsCount = totalActive - recentProducts.length;

    let prodChange = '+0.0%';
    let prodIsPositive = true;
    if (baselineProductsCount > 0) {
      const pct = (recentProducts.length / baselineProductsCount) * 100;
      prodChange = `+${pct.toFixed(1)}%`;
      prodIsPositive = true;
    } else if (totalActive > 0) {
      prodChange = '+100.0%';
      prodIsPositive = true;
    } else {
      prodChange = '+0.0%';
      prodIsPositive = true;
    }

    // Catalog Value (sum of active product prices)
    const currentTotalValue = activeProducts.reduce(
      (acc, p) => acc + (Number(p.price) || 0),
      0
    );
    const recentProductsValue = recentProducts.reduce(
      (acc, p) => acc + (Number(p.price) || 0),
      0
    );
    const baselineValue = currentTotalValue - recentProductsValue;

    let valChange = '+0.0%';
    let valIsPositive = true;
    if (baselineValue > 0) {
      const pct = (recentProductsValue / baselineValue) * 100;
      valChange = `+${pct.toFixed(1)}%`;
      valIsPositive = true;
    } else if (currentTotalValue > 0) {
      valChange = '+100.0%';
      valIsPositive = true;
    } else {
      valChange = '+0.0%';
      valIsPositive = true;
    }

    // Categories created in the last 7 days
    const recentCategories = categories.filter((c) => {
      if (sevenDaysAgo === 0) return false;
      return new Date(c.created_at).getTime() >= sevenDaysAgo;
    });
    const baselineCatCount = categories.length - recentCategories.length;

    let catChange = '+0.0%';
    let catIsPositive = true;
    if (baselineCatCount > 0) {
      const pct = (recentCategories.length / baselineCatCount) * 100;
      catChange = `+${pct.toFixed(1)}%`;
      catIsPositive = true;
    } else if (categories.length > 0) {
      catChange = '+100.0%';
      catIsPositive = true;
    } else {
      catChange = '+0.0%';
      catIsPositive = true;
    }

    // Low Stock Items
    const currentLowStock = invStats
      ? invStats.low_stock_items_count
      : activeProducts.filter((p) => (p.min_stock || 0) > 0).length;

    const recentLowStock = recentProducts.filter((p) => (p.min_stock || 0) > 0).length;
    const baselineLowStock = Math.max(currentLowStock - recentLowStock, 0);

    let lowStockChange = '+0.0%';
    let lowStockIsPositive = true;
    if (baselineLowStock > 0) {
      const diff = currentLowStock - baselineLowStock;
      const pct = (diff / baselineLowStock) * 100;
      if (diff > 0) {
        lowStockChange = `+${pct.toFixed(1)}%`;
        lowStockIsPositive = false;
      } else if (diff < 0) {
        lowStockChange = `${pct.toFixed(1)}%`;
        lowStockIsPositive = true;
      } else {
        lowStockChange = '+0.0%';
        lowStockIsPositive = true;
      }
    } else if (currentLowStock > 0) {
      lowStockChange = '+100.0%';
      lowStockIsPositive = false;
    } else {
      lowStockChange = '+0.0%';
      lowStockIsPositive = true;
    }

    return {
      prodMetrics: { total: totalCount || totalActive, change: prodChange, isPositive: prodIsPositive },
      valMetrics: { total: currentTotalValue, change: valChange, isPositive: valIsPositive },
      catMetrics: { total: categories.length, change: catChange, isPositive: catIsPositive },
      lowStockMetrics: { total: currentLowStock, change: lowStockChange, isPositive: lowStockIsPositive },
    };
  }, [products, categories, invStats, currentTime, totalCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCategories();
      fetchInventoryStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCategories, fetchInventoryStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('search');
      let timer: NodeJS.Timeout | null = null;
      if (q) {
        timer = setTimeout(() => setSearch(q), 0);
      }

      const handleAppSearch = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (typeof detail === 'string') {
          setSearch(detail);
        }
      };
      window.addEventListener('app:search', handleAppSearch);
      return () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener('app:search', handleAppSearch);
      };
    }
  }, []);

  // Real-time auto-refresh across browsers
  useEffect(() => {
    const handleSync = (e: Event) => {
      const resource = (e as CustomEvent)?.detail?.resource;
      if (!resource || resource === 'products' || resource === 'categories') {
        fetchProducts();
        if (resource === 'categories') {
          fetchCategories();
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('stockflow-sync', handleSync);
      return () => window.removeEventListener('stockflow-sync', handleSync);
    }
  }, [fetchProducts, fetchCategories]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setSelectedProduct(null);
    setFormName('');
    setFormSku('');
    setFormBarcode('');
    setFormDescription('');
    setFormCategoryId(categories[0]?.id || '');
    setFormUnit('pcs');
    setFormMinStock(10);
    setFormPrice('');
    setFormCostPrice('');
    setFormImageUrl('');
    setFormVariants([]);
    setFormError(null);
    setShowProductModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (p: Product) => {
    setSelectedProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormBarcode(p.barcode);
    setFormDescription(p.description);
    setFormCategoryId(p.category_id);
    setFormUnit(p.unit);
    setFormMinStock(p.min_stock);
    setFormPrice(p.price);
    setFormCostPrice(p.cost_price);
    setFormImageUrl(p.image_url);
    setFormVariants(
      p.variants?.map((v) => {
        const firstKey = Object.keys(v.attributes || {})[0] || '';
        const firstVal = firstKey ? v.attributes![firstKey] : '';
        return {
          name: v.name,
          sku: v.sku,
          price: v.price,
          cost_price: v.cost_price,
          min_stock: v.min_stock,
          attributeKey: firstKey,
          attributeVal: firstVal,
        };
      }) || []
    );
    setFormError(null);
    setShowProductModal(true);
  };

  // Auto Generate SKU
  const handleGenerateSKU = () => {
    const prefix = formName
      ? formName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'PRD')
      : 'PRD';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setFormSku(`${prefix}-${rand}`);
  };

  // Auto Generate Barcode
  const handleGenerateBarcode = () => {
    const code = '899' + Math.floor(100000000 + Math.random() * 900000000);
    setFormBarcode(code);
  };

  // Add Variant Row
  const handleAddVariantRow = () => {
    setFormVariants((prev) => [
      ...prev,
      {
        name: `Variant ${prev.length + 1}`,
        sku: formSku ? `${formSku}-V${prev.length + 1}` : '',
        price: '',
        cost_price: formCostPrice !== '' ? formCostPrice : '',
        min_stock: formMinStock !== '' ? formMinStock : 10,
        attributeKey: 'option',
        attributeVal: '',
      },
    ]);
  };

  const handleRemoveVariantRow = (index: number) => {
    setFormVariants((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Product Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation for Selling Price & Cost Price
    if (formPrice === '' || Number(formPrice) <= 0) {
      setFormError(
        language === 'id'
          ? 'Selling Price (Harga Jual) wajib diisi dengan angka lebih dari 0'
          : 'Selling Price is required and must be greater than 0'
      );
      return;
    }

    if (formCostPrice === '' || Number(formCostPrice) < 0) {
      setFormError(
        language === 'id'
          ? 'Cost Price (Harga Pokok/Beli) wajib diisi'
          : 'Cost Price is required'
      );
      return;
    }

    // Validation for Variant Prices
    for (let i = 0; i < formVariants.length; i++) {
      const v = formVariants[i];
      if (v.price === '' || Number(v.price) <= 0) {
        setFormError(
          language === 'id'
            ? `Variant "${v.name || `#${i + 1}`}" Price wajib diisi. Silakan isi harga varian atau hapus (tombol X) baris varian tersebut.`
            : `Variant "${v.name || `#${i + 1}`}" Price is required. Please fill in the price or delete (click X) that variant.`
        );
        return;
      }
    }

    setIsSubmitting(true);

    const payload = {
      name: formName,
      sku: formSku,
      barcode: formBarcode,
      description: formDescription,
      category_id: formCategoryId,
      unit: formUnit,
      min_stock: Number(formMinStock),
      price: Number(formPrice),
      cost_price: Number(formCostPrice),
      image_url: formImageUrl,
      variants: formVariants.map((v) => ({
        name: v.name,
        sku: v.sku,
        price: Number(v.price),
        cost_price: Number(v.cost_price),
        min_stock: Number(v.min_stock),
        attributes: v.attributeKey && v.attributeVal ? { [v.attributeKey]: v.attributeVal } : {},
      })),
    };

    try {
      if (selectedProduct) {
        await api.put(`/products/${selectedProduct.id}`, payload);
        setSuccessMsg(`Product "${formName}" updated successfully!`);
      } else {
        await api.post('/products', payload);
        setSuccessMsg(`Product "${formName}" created successfully!`);
      }
      setShowProductModal(false);
      fetchProducts();
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Category Form
  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    setIsCatSubmitting(true);

    try {
      await api.post('/categories', { name: catName, description: catDesc });
      setSuccessMsg(`Category "${catName}" added!`);
      setShowCategoryModal(false);
      setCatName('');
      setCatDesc('');
      await fetchCategories();
    } catch (err: unknown) {
      setCatError((err as Error).message || 'Failed to create category');
    } finally {
      setIsCatSubmitting(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      await api.delete(`/products/${selectedProduct.id}`);
      setSuccessMsg(`Product "${selectedProduct.name}" deleted.`);
      setShowDeleteModal(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Failed to delete product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('productsTitle')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('productsSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <button
              onClick={() => {
                const csvData = (products || []).map(p => `${p.name},${p.sku},${p.price},${p.min_stock}`).join('\n');
                const blob = new Blob([`Name,SKU,Price,Stock\n${csvData}`], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'stockflow-products.csv';
                a.click();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 stroke-[2]" />
              <span>Export</span>
            </button>

            {canManage && (
              <>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 stroke-[2] text-slate-400" />
                  <span>{t('addCategory')}</span>
                </button>

                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3333] hover:bg-[#0B3333]/90 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>{t('addProduct')}</span>
                </button>
              </>
            )}
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

        {/* 4 Top KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: TOTAL PRODUCTS (Core Metric) */}
          <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between ${
            !showAllMetrics ? 'sm:col-span-2 lg:col-span-1' : ''
          }`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'id' ? 'TOTAL PRODUK' : 'TOTAL PRODUCTS'}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums font-sans">
                {prodMetrics.total.toLocaleString('id-ID')}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  prodMetrics.isPositive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                }`}>
                  {prodMetrics.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {prodMetrics.change}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {language === 'id' ? '7 hari terakhir' : 'Last 7 days'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: TOTAL CATALOG VALUE */}
          <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between ${
            !showAllMetrics ? 'hidden lg:flex' : 'flex'
          }`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'id' ? 'NILAI KATALOG' : 'TOTAL CATALOG VALUE'}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate tabular-nums font-sans">
                Rp {valMetrics.total.toLocaleString('id-ID')}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  valMetrics.isPositive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                }`}>
                  {valMetrics.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {valMetrics.change}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {language === 'id' ? '7 hari terakhir' : 'Last 7 days'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: TOTAL CATEGORIES */}
          <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between ${
            !showAllMetrics ? 'hidden lg:flex' : 'flex'
          }`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'id' ? 'TOTAL KATEGORI' : 'TOTAL CATEGORIES'}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums font-sans">
                {catMetrics.total.toLocaleString('id-ID')}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  catMetrics.isPositive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                }`}>
                  {catMetrics.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {catMetrics.change}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {language === 'id' ? '7 hari terakhir' : 'Last 7 days'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: SAFETY STOCK ALERTS */}
          <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between ${
            !showAllMetrics ? 'hidden lg:flex' : 'flex'
          }`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === 'id' ? 'PERINGATAN STOK' : 'LOW STOCK ALERTS'}
              </span>
            </div>
            <div className="mt-3">
              <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums font-sans ${
                lowStockMetrics.total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
              }`}>
                {lowStockMetrics.total.toLocaleString('id-ID')}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                  lowStockMetrics.isPositive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                }`}>
                  {lowStockMetrics.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {lowStockMetrics.change}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {language === 'id' ? '7 hari terakhir' : 'Last 7 days'}
                </span>
              </div>
            </div>
          </div>
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
                : (language === 'id' ? 'Lihat 3 metrik lainnya' : 'Show 3 more metrics')}
            </span>
            {showAllMetrics ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />
            )}
          </button>
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
          {/* Table Controls Toolbar */}
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row gap-3.5 justify-between items-stretch lg:items-center">
            {/* Left Controls: Search, Filter, View Mode */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
              <div className="relative flex-1 min-w-[220px]">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by product name or ID"
                  className="w-full pl-9 pr-4 py-2 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333]"
                />
              </div>

              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="inline-flex items-center gap-1.5 pl-3 pr-8 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer appearance-none"
                >
                  <option value="">Filter Category</option>
                  {(categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl self-start lg:self-auto overflow-x-auto">
              {([
                { id: 'all', label: language === 'id' ? 'Semua' : 'All' },
                { id: 'active', label: language === 'id' ? 'Aktif' : 'Active' },
                { id: 'archived', label: language === 'id' ? 'Diarsipkan' : 'Archived' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content: Loading / Empty / Grid or List */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#0B3333] dark:text-emerald-400 mb-2" />
              <p className="text-xs font-medium">{t('loading')}</p>
            </div>
          ) : (!filteredProducts || filteredProducts.length === 0) ? (
            <div className="py-20 text-center text-slate-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('noProductsFound')}</p>
              <p className="text-xs text-slate-500 mt-1">
                {search || selectedCategory || statusFilter !== 'all'
                  ? (language === 'id' ? 'Coba sesuaikan pencarian atau filter status/kategori.' : 'Try adjusting your search query or status/category filter.')
                  : t('noProductsSubtitle')}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW */
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                const isExpanded = expandedProductId === p.id;
                const hasVariants = p.variants && p.variants.length > 0;

                return (
                  <div
                    key={p.id}
                    className={`bg-white dark:bg-slate-900 rounded-xl border transition-all duration-150 flex flex-col justify-between overflow-hidden shadow-2xs hover:shadow-xs ${
                      isSelected
                        ? 'border-[#0B3333] dark:border-[#2dd4bf] ring-1 ring-[#0B3333]/20 dark:ring-[#2dd4bf]/20'
                        : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Card Top: Checkbox, Status Badge */}
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedIds((prev) =>
                              prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                            );
                          }}
                          className="rounded border-slate-300 text-[#0B3333] focus:ring-[#0B3333]/20 cursor-pointer"
                        />
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            p.is_deleted
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.is_deleted ? 'bg-slate-400' : 'bg-emerald-500'
                            }`}
                          />
                          {p.is_deleted
                            ? language === 'id'
                              ? 'Diarsipkan'
                              : 'Archived'
                            : language === 'id'
                            ? 'Aktif'
                            : 'Active'}
                        </span>
                      </div>

                      {/* Product Thumbnail & Identity */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200/80 dark:border-slate-700/60">
                          {p.image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Package className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                            {p.category_name || 'General Product'} • <span className="font-mono text-[11px]">#{p.sku || p.id.slice(0, 8).toUpperCase()}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Middle: Price, Min Stock, Variants info */}
                    <div className="p-4 space-y-2 text-xs border-t border-slate-100 dark:border-slate-800/80 mt-3 bg-slate-50/40 dark:bg-slate-800/20">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 dark:text-slate-500">{language === 'id' ? 'Harga Jual' : 'Selling Price'}</span>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums font-sans">
                          Rp {p.price.toLocaleString('id-ID')}
                        </span>
                      </div>
                      {p.cost_price ? (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 dark:text-slate-500">{language === 'id' ? 'Modal' : 'Cost'}</span>
                          <span className="text-slate-600 dark:text-slate-400 tabular-nums font-sans">
                            Rp {p.cost_price.toLocaleString('id-ID')}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 dark:text-slate-500">{language === 'id' ? 'Stok Minimum' : 'Safety Min'}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums font-sans">
                          {p.min_stock.toLocaleString('id-ID')} {p.unit || 'pcs'}
                        </span>
                      </div>

                      {hasVariants && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                            className="w-full flex items-center justify-between text-[11px] font-semibold text-[#0B3333] dark:text-[#2dd4bf] hover:underline cursor-pointer"
                          >
                            <span>{p.variants.length} {language === 'id' ? 'Varian Produk' : 'Variants'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                              {p.variants.map((v, i) => (
                                <div key={i} className="text-[11px] flex justify-between items-center text-slate-600 dark:text-slate-300">
                                  <span className="truncate max-w-[120px]">{v.name}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{v.sku}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Bottom Actions */}
                    {canManage && (
                      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1.5 bg-white dark:bg-slate-900">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Edit product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProduct(p);
                            setShowDeleteModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Delete product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST (TABLE) VIEW */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/60 dark:bg-slate-900 text-[11px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="w-12 px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredProducts.map((p) => p.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        className="rounded border-slate-300 text-[#0B3333] focus:ring-[#0B3333]/20 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3.5">{language === 'id' ? 'PRODUK' : 'PRODUCT NAME'}</th>
                    <th className="px-4 py-3.5">{language === 'id' ? 'SKU & TANGGAL' : 'SKU & DATE'}</th>
                    <th className="px-4 py-3.5">{language === 'id' ? 'HARGA' : 'PRICE'}</th>
                    <th className="px-4 py-3.5">{language === 'id' ? 'STOK MIN' : 'MIN STOCK'}</th>
                    <th className="px-4 py-3.5">{language === 'id' ? 'STATUS' : 'STATUS'}</th>
                    {canManage && <th className="px-4 py-3.5 text-right">{language === 'id' ? 'AKSI' : 'ACTIONS'}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredProducts.map((p) => {
                    const isExpanded = expandedProductId === p.id;
                    const hasVariants = p.variants && p.variants.length > 0;
                    const isSelected = selectedIds.includes(p.id);

                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-slate-50/90 dark:bg-slate-800/60' : ''}`}>
                          {/* Row Checkbox */}
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedIds((prev) =>
                                  prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                                );
                              }}
                              className="rounded border-slate-300 text-[#0B3333] focus:ring-[#0B3333]/20 cursor-pointer"
                            />
                          </td>

                          {/* PRODUCT NAME */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200/80 dark:border-slate-700/60">
                                {p.image_url ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={p.image_url}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">
                                  {p.name}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                  {p.category_name || 'General Product'} • {p.sku}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* ID & CREATE DATE */}
                          <td className="px-4 py-4">
                            <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                              #{p.sku || p.id.slice(0, 8).toUpperCase()}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                            </p>
                          </td>

                          {/* PRICE */}
                          <td className="px-4 py-4">
                            <p className="text-xs font-bold tabular-nums font-sans text-slate-900 dark:text-white">
                              Rp {p.price.toLocaleString('id-ID')}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {p.cost_price ? `${language === 'id' ? 'Modal' : 'Cost'}: Rp ${p.cost_price.toLocaleString('id-ID')}` : '—'}
                            </p>
                          </td>

                          {/* MIN STOCK */}
                          <td className="px-4 py-4">
                            <span className="text-xs font-bold tabular-nums font-sans text-slate-900 dark:text-white">
                              {p.min_stock.toLocaleString('id-ID')} {p.unit || 'pcs'}
                            </span>
                          </td>

                          {/* STATUS */}
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                p.is_deleted
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  p.is_deleted ? 'bg-slate-400' : 'bg-emerald-500'
                                }`}
                              />
                              {p.is_deleted
                                ? language === 'id'
                                  ? 'Diarsipkan'
                                  : 'Archived'
                                : language === 'id'
                                ? 'Aktif'
                                : 'Active'}
                            </span>
                          </td>

                          {/* ACTIONS */}
                          {canManage && (
                            <td className="px-4 py-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                {hasVariants && (
                                  <button
                                    onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    title="View variants"
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEditModal(p)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Edit product"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedProduct(p);
                                    setShowDeleteModal(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                                  title="Delete product"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* Expandable Variants Row */}
                        {isExpanded && hasVariants && (
                          <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td colSpan={canManage ? 7 : 6} className="px-8 py-3">
                              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Configured Variants for {p.name}:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                {p.variants.map((v, i) => (
                                  <div
                                    key={i}
                                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                                        {v.name}
                                      </p>
                                      <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                        {v.sku}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-slate-500 text-[11px]">
                                      <span>Price: Rp {v.price.toLocaleString('id-ID')}</span>
                                      <span>Min: {v.min_stock}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Floating Batch Selection Bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 px-5 py-2.5 rounded-full shadow-xl flex items-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <span className="font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700 pr-3">
              {selectedIds.length} Selected
            </span>
            <button
              type="button"
              onClick={() => {
                const selectedProducts = products.filter(p => selectedIds.includes(p.id));
                const csvData = selectedProducts.map(p => `${p.name},${p.sku},${p.price},${p.min_stock}`).join('\n');
                const blob = new Blob([`Name,SKU,Price,Stock\n${csvData}`], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `selected-products-${selectedIds.length}.csv`;
                a.click();
              }}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const first = products.find(p => p.id === selectedIds[0]);
                if (first) handleOpenEditModal(first);
              }}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Info</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete ${selectedIds.length} selected products?`)) {
                  Promise.all(selectedIds.map(id => api.delete(`/products/${id}`)))
                    .then(() => {
                      setSelectedIds([]);
                      fetchProducts();
                      setSuccessMsg(`${selectedIds.length} products deleted.`);
                    })
                    .catch(err => setErrorMsg(err.message || 'Failed to delete'));
                }
              }}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
              title="Deselect all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Product Add / Edit Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {selectedProduct ? t('modalEditProductTitle') : t('modalAddProductTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitProduct} className="mt-4 space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('productNameLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  placeholder="e.g. Brushless Cordless Drill 20V"
                />
              </div>

              {/* SKU and Barcode with Auto-Gen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t('sku')}
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateSKU}
                      className="text-[11px] font-semibold text-[#0B3333] dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Auto
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                    placeholder="e.g. TOOL-DRL-001"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {t('barcode')}
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="text-[11px] font-semibold text-[#0B3333] dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Auto
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                    placeholder="e.g. 899123456789"
                  />
                </div>
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('category')} *
                  </label>
                  <select
                    required
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  >
                    <option value="" disabled>
                      {language === 'id' ? 'Pilih Kategori' : 'Select Category'}
                    </option>
                    {(categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('unit')} *
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  >
                    {STANDARD_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing & Min Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('sellingPriceLabel')} <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    placeholder="0"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('costPriceLabel')} <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0"
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('minStockLabel')} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    required
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  />
                </div>
              </div>

              {/* Image URL & Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Product Image URL
                </label>
                <input
                  type="url"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] resize-none transition-colors"
                  placeholder="Product specifications and details..."
                />
              </div>

              {/* Variants Section */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Product Variants
                    </h4>
                    <p className="text-xs text-slate-500">
                      Configure sizes, specs, or color versions under this product.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVariantRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#0B3333] dark:text-emerald-400 bg-[#0B3333]/10 hover:bg-[#0B3333]/20 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Variant
                  </button>
                </div>

                {formVariants.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center italic bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                    No variants added. Single SKU product.
                  </p>
                ) : (
                  <div className="space-y-3 mt-3">
                    {formVariants.map((v, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs relative space-y-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveVariantRow(idx)}
                          className="absolute top-3.5 right-3.5 text-slate-400 hover:text-red-500 cursor-pointer p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                              Variant Name
                            </label>
                            <input
                              type="text"
                              required
                              value={v.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormVariants((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, name: val } : item
                                  )
                                );
                              }}
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                              placeholder="e.g. Size 42 or 20V Pro"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                              Variant SKU
                            </label>
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormVariants((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, sku: val } : item
                                  )
                                );
                              }}
                              className="w-full h-9 px-3 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                              placeholder="Auto if empty"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                              Variant Price (IDR) <span className="text-red-500 font-bold">*</span>
                            </label>
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              required
                              placeholder="0"
                              value={v.price}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : Number(e.target.value);
                                setFormVariants((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, price: val } : item
                                  )
                                );
                              }}
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-1">
                          <div>
                            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                              Attr Name (e.g. size/color)
                            </label>
                            <input
                              type="text"
                              value={v.attributeKey}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormVariants((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, attributeKey: val } : item
                                  )
                                );
                              }}
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                              Attr Value (e.g. 42 / Red)
                            </label>
                            <input
                              type="text"
                              value={v.attributeVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormVariants((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, attributeVal: val } : item
                                  )
                                );
                              }}
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#0B3333] hover:bg-[#0B3333]/90 text-white font-semibold text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('saving')}</span>
                    </>
                  ) : selectedProduct ? (
                    <span>{t('save')}</span>
                  ) : (
                    <span>{t('create')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('modalAddCategoryTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {catError}
              </div>
            )}

            <form onSubmit={handleSubmitCategory} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('categoryNameLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
                  placeholder="e.g. Electrical Components"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('categoryDescLabel')}
                </label>
                <textarea
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] resize-none transition-colors"
                  placeholder="Category scope and notes..."
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCatSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[#0B3333] hover:bg-[#0B3333]/90 text-white font-semibold text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCatSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('saving')}</span>
                    </>
                  ) : (
                    <span>{t('save')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-center text-slate-900 dark:text-white">
              {t('modalDeleteProductTitle')}
            </h3>
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-1">
              {language === 'id' ? (
                <>Apakah Anda yakin ingin menghapus <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.name}</strong> ({selectedProduct.sku})? Tindakan ini tidak dapat dibatalkan.</>
              ) : (
                <>Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.name}</strong> ({selectedProduct.sku})? This action cannot be undone.</>
              )}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{language === 'id' ? 'Menghapus...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <span>{t('delete')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
