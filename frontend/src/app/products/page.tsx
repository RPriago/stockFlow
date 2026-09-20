'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Product, Category, ProductListResult, ProductVariant } from '@/types/product';
import { api, ApiError } from '@/lib/api';
import {
  Package,
  Plus,
  Search,
  Barcode,
  FolderPlus,
  Layers,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Sparkles,
  Tag,
  DollarSign,
  Image as ImageIcon,
  ExternalLink,
  ChevronDown,
  ChevronUp,
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

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
        setCategories(res.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      let query = `/products?page=1&limit=50`;
      if (search) query += `&search=${encodeURIComponent(search)}`;
      if (selectedCategory) query += `&category_id=${encodeURIComponent(selectedCategory)}`;

      const res = await api.get<ProductListResult>(query);
      if (res.success && res.data) {
        setProducts(res.data.products);
        setTotalCount(res.data.meta.total);
        setProducts(res.data.products || []);
        setTotalCount(res.data.meta?.total || 0);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load product catalog');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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
      if (q) setSearch(q);

      const handleAppSearch = (e: any) => {
        if (typeof e.detail === 'string') {
          setSearch(e.detail);
        }
      };
      window.addEventListener('app:search', handleAppSearch);
      return () => window.removeEventListener('app:search', handleAppSearch);
    }
  }, []);

  // Real-time auto-refresh across browsers
  useEffect(() => {
    const handleSync = (e: any) => {
      const resource = e?.detail?.resource;
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
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
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
    } catch (err: any) {
      setCatError(err.message || 'Failed to create category');
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete product');
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
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
                {t('productsTitle')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F4F3FF] text-[#6C5CE7] dark:bg-[#7C6EF0]/15 dark:text-[#A594FD] border border-[#E0DCFC] dark:border-[#7C6EF0]/30">
                {totalCount} {t('items')}
              </span>
            </div>
            <p className="text-sm text-[#8B8B99] dark:text-slate-400 mt-1">
              {t('productsSubtitle')}
            </p>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full border border-[#EEEDF5] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-[#1B1B1F] dark:text-white hover:border-[#7C6EF0] hover:text-[#7C6EF0] transition-colors shadow-xs cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[1.8] text-[#8B8B99] dark:text-slate-400" />
                <span>{t('addCategory')}</span>
              </button>

              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 rounded-full bg-[#7C6EF0] text-white text-xs sm:text-sm font-semibold hover:bg-[#6C5CE7] transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>{t('addProduct')}</span>
              </button>
            </div>
          )}
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

        {/* Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Search bar */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchProductsPlaceholder')}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                !selectedCategory
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t('allCategories')}
            </button>
            {(categories || []).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === c.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm">{t('loading')}</p>
            </div>
          ) : (!products || products.length === 0) ? (
            <div className="py-20 text-center text-slate-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('noProductsFound')}</p>
              <p className="text-xs text-slate-500 mt-1">
                {search || selectedCategory
                  ? (language === 'id' ? 'Coba sesuaikan pencarian atau filter kategori.' : 'Try adjusting your search query or filter.')
                  : t('noProductsSubtitle')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <tr>
                    <th className="px-6 py-3.5">{t('colProduct')}</th>
                    <th className="px-6 py-3.5">{t('colSkuBarcode')}</th>
                    <th className="px-6 py-3.5">{t('colCategory')}</th>
                    <th className="px-6 py-3.5">{t('colUnit')}</th>
                    <th className="px-6 py-3.5">{t('colPrice')}</th>
                    <th className="px-6 py-3.5">{t('colMinStock')}</th>
                    <th className="px-6 py-3.5">{t('colVariants')}</th>
                    {canManage && <th className="px-6 py-3.5 text-right">{t('actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(products || []).map((p) => {
                    const isExpanded = expandedProductId === p.id;
                    const hasVariants = p.variants && p.variants.length > 0;

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          {/* Image & Name */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                                {p.image_url ? (
                                  <img
                                    src={p.image_url}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback on broken image
                                      (e.target as any).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                                  {p.name}
                                </p>
                                {p.description && (
                                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 max-w-xs">
                                    {p.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* SKU & Barcode */}
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                              {p.sku}
                            </span>
                            {p.barcode && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-1">
                                <Barcode className="w-3.5 h-3.5" />
                                <span>{p.barcode}</span>
                              </div>
                            )}
                          </td>

                          {/* Category */}
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/30">
                              {p.category_name || 'General'}
                            </span>
                          </td>

                          {/* Unit */}
                          <td className="px-6 py-4">
                            <span className="uppercase text-xs font-semibold text-slate-500">
                              {p.unit}
                            </span>
                          </td>

                          {/* Price */}
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                              Rp {p.price.toLocaleString('id-ID')}
                            </p>
                            {p.cost_price > 0 && (
                              <p className="text-[10px] text-slate-400">
                                Cost: Rp {p.cost_price.toLocaleString('id-ID')}
                              </p>
                            )}
                          </td>

                          {/* Min Stock */}
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/60 dark:border-amber-900/40">
                              <AlertTriangle className="w-3 h-3" />
                              Min: {p.min_stock} {p.unit}
                            </span>
                          </td>

                          {/* Variants Count & Toggle */}
                          <td className="px-6 py-4">
                            {hasVariants ? (
                              <button
                                onClick={() =>
                                  setExpandedProductId(isExpanded ? null : p.id)
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                <span>{p.variants.length} Variants</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">No variants</span>
                            )}
                          </td>

                          {/* Actions */}
                          {canManage && (
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleOpenEditModal(p)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Edit product"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedProduct(p);
                                    setShowDeleteModal(true);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                  title="Delete product"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* Expandable Variants Row */}
                        {isExpanded && hasVariants && (
                          <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td colSpan={canManage ? 8 : 7} className="px-8 py-3">
                              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                                Configured Variants for {p.name}:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                {p.variants.map((v, i) => (
                                  <div
                                    key={i}
                                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                                        {v.name}
                                      </p>
                                      <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        {v.sku}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-slate-500 text-[11px]">
                                      <span>Price: Rp {v.price.toLocaleString('id-ID')}</span>
                                      <span>Min: {v.min_stock}</span>
                                    </div>
                                    {v.attributes && Object.keys(v.attributes).length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {Object.entries(v.attributes).map(([k, val]) => (
                                          <span
                                            key={k}
                                            className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400"
                                          >
                                            {k}: {val}
                                          </span>
                                        ))}
                                      </div>
                                    )}
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
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                      className="text-[11px] font-semibold text-[#7C6EF0] dark:text-[#9B8FF3] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Auto
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                      className="text-[11px] font-semibold text-[#7C6EF0] dark:text-[#9B8FF3] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Auto
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                  className="block w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#7C6EF0] dark:text-[#9B8FF3] bg-[#7C6EF0]/10 hover:bg-[#7C6EF0]/20 transition-colors cursor-pointer"
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
                        className="p-4 bg-white dark:bg-slate-800/80 rounded-2xl border border-[#EEEDF5] dark:border-slate-700/80 shadow-2xs relative space-y-2.5"
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
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                              className="w-full h-9 px-3 text-xs font-mono bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                              className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
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
                  className="block w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] resize-none transition-colors"
                  placeholder="Category scope and notes..."
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCatSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
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
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all shadow-sm shadow-rose-600/20 cursor-pointer disabled:opacity-50"
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
