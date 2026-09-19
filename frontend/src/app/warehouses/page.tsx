'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Warehouse, Location, LocationType } from '@/types/warehouse';
import { api, ApiError } from '@/lib/api';
import {
  Warehouse as WarehouseIcon,
  Plus,
  MapPin,
  Layers,
  Grid,
  Trash2,
  Edit2,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
  ThermometerSnowflake,
  PackageCheck,
  Building2,
  ArrowRight,
} from 'lucide-react';

export default function WarehousesPage() {
  const { role } = useAuth();
  const { t, language } = useLanguage();
  const canManage = role === 'super_admin' || role === 'warehouse_manager';

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWhId, setSelectedWhId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingWh, setIsLoadingWh] = useState(true);
  const [isLoadingLoc, setIsLoadingLoc] = useState(false);

  // Derive selected warehouse from fresh `warehouses` list, guaranteeing up-to-date capacity and data
  const selectedWarehouse =
    (selectedWhId ? warehouses.find((w) => w.id === selectedWhId) : null) ||
    (warehouses.length > 0 ? warehouses[0] : null);

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [showWhModal, setShowWhModal] = useState(false);
  const [isEditingWh, setIsEditingWh] = useState(false);
  const [showBinModal, setShowBinModal] = useState(false);
  const [showDeleteWhModal, setShowDeleteWhModal] = useState(false);

  // Warehouse Form State
  const [whCode, setWhCode] = useState('');
  const [whName, setWhName] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whCapacity, setWhCapacity] = useState<number | ''>(25000);
  const [isWhSubmitting, setIsWhSubmitting] = useState(false);
  const [whFormError, setWhFormError] = useState<string | null>(null);

  // Bin Form State
  const [binZone, setBinZone] = useState('A');
  const [binRack, setBinRack] = useState('01');
  const [binShelf, setBinShelf] = useState('01');
  const [binSlot, setBinSlot] = useState('A');
  const [binType, setBinType] = useState<LocationType>('shelf');
  const [binMaxCapacity, setBinMaxCapacity] = useState<number | ''>(500);
  const [isBinSubmitting, setIsBinSubmitting] = useState(false);
  const [binFormError, setBinFormError] = useState<string | null>(null);
  const [binOccupancy, setBinOccupancy] = useState<Record<string, number>>({});

  // Fetch Warehouses
  const fetchWarehouses = useCallback(async () => {
    setIsLoadingWh(true);
    try {
      const res = await api.get<Warehouse[]>('/warehouses');
      if (res.success && res.data) {
        setWarehouses(res.data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch warehouses');
    } finally {
      setIsLoadingWh(false);
    }
  }, []);

  // Fetch Locations & Occupancy for Selected Warehouse
  const fetchLocations = useCallback(async (whId: string) => {
    setIsLoadingLoc(true);
    try {
      const [locRes, invRes] = await Promise.all([
        api.get<Location[]>(`/warehouses/${whId}/locations`),
        api.get<{ items: { location_id: string; quantity_on_hand: number }[] }>(`/inventory?warehouse_id=${whId}&limit=500`),
      ]);

      if (locRes.success && locRes.data) {
        setLocations(locRes.data);
      }

      if (invRes.success && invRes.data && invRes.data.items) {
        const occMap: Record<string, number> = {};
        for (const it of invRes.data.items) {
          occMap[it.location_id] = (occMap[it.location_id] || 0) + (it.quantity_on_hand || 0);
        }
        setBinOccupancy(occMap);
      }
    } catch (err: any) {
      console.error('Failed to fetch locations:', err);
    } finally {
      setIsLoadingLoc(false);
    }
  }, []);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  useEffect(() => {
    if (selectedWarehouse?.id) {
      fetchLocations(selectedWarehouse.id);
    }
  }, [selectedWarehouse?.id, fetchLocations]);

  // Open Add Warehouse
  const handleOpenAddWh = () => {
    setIsEditingWh(false);
    setWhCode('');
    setWhName('');
    setWhAddress('');
    setWhCity('');
    setWhCapacity(25000);
    setWhFormError(null);
    setShowWhModal(true);
  };

  // Open Edit Warehouse
  const handleOpenEditWh = (wh: Warehouse) => {
    setIsEditingWh(true);
    setSelectedWhId(wh.id);
    setWhCode(wh.code);
    setWhName(wh.name);
    setWhAddress(wh.address);
    setWhCity(wh.city);
    setWhCapacity(wh.capacity);
    setWhFormError(null);
    setShowWhModal(true);
  };

  // Generate Warehouse Code
  const handleGenerateWhCode = () => {
    const city = whCity ? whCity.substring(0, 3).toUpperCase() : 'WH';
    const rand = Math.floor(10 + Math.random() * 90);
    setWhCode(`WH-${city}-${rand}`);
  };

  // Submit Warehouse
  const handleSubmitWh = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhFormError(null);
    setIsWhSubmitting(true);

    const capNum = Number(whCapacity);

    // Client-side guard: Cannot downscale warehouse capacity below already allocated bin capacities
    if (isEditingWh && selectedWarehouse && capNum < currentTotalBinCapacity) {
      setWhFormError(
        language === 'id'
          ? `Kapasitas gudang (${capNum.toLocaleString()} unit) tidak boleh lebih kecil dari kapasitas rak yang sudah teralokasi (${currentTotalBinCapacity.toLocaleString()} unit).`
          : `Warehouse capacity (${capNum.toLocaleString()} units) cannot be smaller than already allocated bin capacity (${currentTotalBinCapacity.toLocaleString()} units).`
      );
      setIsWhSubmitting(false);
      return;
    }

    const payload = {
      code: whCode,
      name: whName,
      address: whAddress,
      city: whCity,
      capacity: capNum,
      is_active: isEditingWh && selectedWarehouse ? selectedWarehouse.is_active : true,
    };

    try {
      if (isEditingWh && selectedWarehouse) {
        await api.put(`/warehouses/${selectedWarehouse.id}`, payload);
        setSuccessMsg(`Warehouse "${whName}" updated successfully!`);
      } else {
        const createRes = await api.post<Warehouse>('/warehouses', payload);
        if (createRes.success && createRes.data?.id) {
          setSelectedWhId(createRes.data.id);
        }
        setSuccessMsg(`Warehouse "${whName}" created successfully!`);
      }
      setShowWhModal(false);
      await fetchWarehouses();
    } catch (err: any) {
      setWhFormError(err.message || 'Operation failed');
    } finally {
      setIsWhSubmitting(false);
    }
  };

  // Delete Warehouse
  const handleDeleteWh = async () => {
    if (!selectedWarehouse) return;
    setIsWhSubmitting(true);
    try {
      await api.delete(`/warehouses/${selectedWarehouse.id}`);
      setSuccessMsg(`Warehouse "${selectedWarehouse.name}" deleted.`);
      setShowDeleteWhModal(false);
      setSelectedWhId(null);
      await fetchWarehouses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete warehouse');
    } finally {
      setIsWhSubmitting(false);
    }
  };

  // Submit Location Bin
  const handleSubmitBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    const binCap = Number(binMaxCapacity);
    if (binCap <= 0) {
      setBinFormError(language === 'id' ? 'Kapasitas rak harus lebih dari 0 unit.' : 'Bin capacity must be greater than 0.');
      return;
    }

    if (selectedWarehouse.capacity > 0 && currentTotalBinCapacity + binCap > selectedWarehouse.capacity) {
      const avail = Math.max(0, selectedWarehouse.capacity - currentTotalBinCapacity);
      setBinFormError(
        language === 'id'
          ? `Gagal menambah rak: Total kapasitas rak melebihi kapasitas gudang! Gudang '${selectedWarehouse.name}' berkapasitas ${selectedWarehouse.capacity.toLocaleString()} unit (sudah teralokasi ${currentTotalBinCapacity.toLocaleString()} unit, sisa kuota yang dapat dibuat hanya ${avail.toLocaleString()} unit, mencoba menambah ${binCap.toLocaleString()} unit).`
          : `Failed to add bin: Exceeds warehouse capacity! Warehouse '${selectedWarehouse.name}' has capacity of ${selectedWarehouse.capacity.toLocaleString()} units (already allocated ${currentTotalBinCapacity.toLocaleString()} units, remaining quota is ${avail.toLocaleString()} units, requested ${binCap.toLocaleString()} units).`
      );
      return;
    }

    setIsBinSubmitting(true);

    const payload = {
      zone: binZone,
      rack: binRack,
      shelf: binShelf,
      bin: binSlot,
      type: binType,
      max_capacity: binCap,
    };

    try {
      await api.post(`/warehouses/${selectedWarehouse.id}/locations`, payload);
      setSuccessMsg(`Location bin created!`);
      setShowBinModal(false);
      await fetchLocations(selectedWarehouse.id);
      await fetchWarehouses(); // update bin counts
    } catch (err: any) {
      setBinFormError(err.message || 'Failed to create bin');
    } finally {
      setIsBinSubmitting(false);
    }
  };

  // Delete Bin
  const handleDeleteBin = async (locId: string) => {
    if (!confirm('Are you sure you want to delete this storage bin location?')) return;
    try {
      await api.delete(`/locations/${locId}`);
      setSuccessMsg('Storage location removed.');
      if (selectedWarehouse) {
        fetchLocations(selectedWarehouse.id);
        fetchWarehouses();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete location');
    }
  };

  // Warehouse capacity stats vs allocated bins
  const currentTotalBinCapacity = locations.reduce((sum, l) => sum + (l.max_capacity || 0), 0);
  const remainingWhCapacity = selectedWarehouse ? Math.max(0, (selectedWarehouse.capacity || 0) - currentTotalBinCapacity) : 0;
  const isWhOverAllocated = selectedWarehouse ? currentTotalBinCapacity > selectedWarehouse.capacity : false;

  // Group locations by Zone and Rack
  const groupedLocations = locations.reduce((acc, loc) => {
    const key = `Zone ${loc.zone.toUpperCase()} · Rack ${loc.rack}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(loc);
    return acc;
  }, {} as Record<string, Location[]>);

  const getStorageTypeBadge = (type: LocationType) => {
    switch (type) {
      case 'shelf':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/50">
            <Boxes className="w-2.5 h-2.5" /> Shelf
          </span>
        );
      case 'pallet_rack':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50">
            <Layers className="w-2.5 h-2.5" /> Pallet Rack
          </span>
        );
      case 'cold_storage':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border border-cyan-200/50">
            <ThermometerSnowflake className="w-2.5 h-2.5" /> Cold Storage
          </span>
        );
      case 'staging_area':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/50">
            <PackageCheck className="w-2.5 h-2.5" /> Staging
          </span>
        );
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
                {t('warehousesTitle')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F4F3FF] text-[#6C5CE7] dark:bg-[#7C6EF0]/15 dark:text-[#A594FD] border border-[#E0DCFC] dark:border-[#7C6EF0]/30">
                {warehouses.length} {t('units')}
              </span>
            </div>
            <p className="text-sm text-[#8B8B99] dark:text-slate-400 mt-1">
              {t('warehousesSubtitle')}
            </p>
          </div>

          {canManage && (
            <button
              onClick={handleOpenAddWh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white text-sm font-semibold transition-all shadow-sm shadow-[#7C6EF0]/20 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{t('addFacility')}</span>
            </button>
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

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isLoadingWh ? (
            <div className="col-span-3 py-10 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="col-span-3 py-16 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                {t('noWarehousesTitle')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('noWarehousesSubtitle')}
              </p>
            </div>
          ) : (
            warehouses.map((wh) => {
              const isSelected = selectedWarehouse?.id === wh.id;
              return (
                <div
                  key={wh.id}
                  onClick={() => setSelectedWhId(wh.id)}
                  className={`cursor-pointer p-5 rounded-2xl border transition-all relative ${
                    isSelected
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {wh.code}
                        </span>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">
                          {wh.name}
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                      <span className="truncate">{wh.address}, {wh.city}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-slate-600 dark:text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>{language === 'id' ? 'Kapasitas' : 'Capacity'}: {wh.capacity.toLocaleString()} units</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {wh.total_bins || 0} Bins
                        </span>
                      </div>
                      {isSelected && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500 dark:text-slate-400">
                            {language === 'id' ? 'Alokasi Rak' : 'Bin Allocation'}:
                          </span>
                          <span className={`font-mono font-semibold ${isWhOverAllocated ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {currentTotalBinCapacity.toLocaleString()} / {wh.capacity.toLocaleString()}
                            {isWhOverAllocated && ` (Over: +${(currentTotalBinCapacity - wh.capacity).toLocaleString()})`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {canManage && isSelected && (
                    <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/40 flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditWh(wh);
                        }}
                        className="px-2.5 py-1 rounded text-xs font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWhId(wh.id);
                          setShowDeleteWhModal(true);
                        }}
                        className="px-2.5 py-1 rounded text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Selected Warehouse Rack & Bin Location Inspector */}
        {selectedWarehouse && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Grid className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Rack & Bin Map: {selectedWarehouse.name}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Visual layout of storage bins across aisles, racks, and shelves.
                </p>
              </div>

              {canManage && (
                <button
                  onClick={() => {
                    setBinZone('A');
                    setBinRack('01');
                    setBinShelf('01');
                    setBinSlot('A');
                    setBinType('shelf');
                    setBinMaxCapacity(500);
                    setBinFormError(null);
                    setShowBinModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors self-start sm:self-auto border border-indigo-200/50 dark:border-indigo-800/40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Storage Bin</span>
                </button>
              )}
            </div>

            {isLoadingLoc ? (
              <div className="py-12 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : Object.keys(groupedLocations).length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  No storage bins configured in this facility
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Click &apos;Add Storage Bin&apos; to map out zones, racks, and bins.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedLocations).map(([groupTitle, locs]) => (
                  <div key={groupTitle} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {groupTitle}
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        ({locs.length} bins)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {locs.map((l) => (
                        <div
                          key={l.id}
                          className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs hover:shadow-xs transition-shadow relative group"
                        >
                          {canManage && (
                            <button
                              onClick={() => handleDeleteBin(l.id)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5"
                              title="Delete bin"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                            {l.code}
                          </div>

                          <div className="mt-1.5 flex flex-col gap-1">
                            <div>{getStorageTypeBadge(l.type)}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              Shelf {l.shelf} · Bin {l.bin}
                            </div>
                            {/* Bin Capacity and Real-Time Occupancy */}
                            <div className="mt-1 pt-1.5 border-t border-slate-200 dark:border-slate-700/60 space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-400 font-medium">
                                  {language === 'id' ? 'Terisi' : 'Occupancy'}:
                                </span>
                                <span
                                  className={`font-mono font-semibold ${
                                    (binOccupancy[l.id] || 0) >= l.max_capacity
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {binOccupancy[l.id] || 0} / {l.max_capacity} pcs
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    (binOccupancy[l.id] || 0) >= l.max_capacity
                                      ? 'bg-rose-500'
                                      : l.max_capacity > 0 && (binOccupancy[l.id] || 0) / l.max_capacity >= 0.8
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{
                                    width: `${
                                      l.max_capacity > 0
                                        ? Math.min(100, Math.round(((binOccupancy[l.id] || 0) / l.max_capacity) * 100))
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Warehouse Modal */}
      {showWhModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditingWh ? 'Edit Warehouse' : 'Add New Warehouse'}
              </h3>
              <button
                type="button"
                onClick={() => setShowWhModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {whFormError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {whFormError}
              </div>
            )}

            <form onSubmit={handleSubmitWh} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Warehouse Name *
                </label>
                <input
                  type="text"
                  required
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  placeholder="e.g. Jakarta Central Fulfillment"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Facility Code
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateWhCode}
                      className="text-[11px] font-semibold text-[#7C6EF0] hover:text-[#6C5CE7] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Auto
                    </button>
                  </div>
                  <input
                    type="text"
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="WH-JKT-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={whCity}
                    onChange={(e) => setWhCity(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="Jakarta Barat"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Street Address *
                </label>
                <input
                  type="text"
                  required
                  value={whAddress}
                  onChange={(e) => setWhAddress(e.target.value)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  placeholder="Jl. Raya Industri No. 12, Kalideres"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Storage Capacity (Max Units / Items) *
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="25000"
                  required
                  value={whCapacity}
                  onChange={(e) => setWhCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowWhModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWhSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                >
                  {isWhSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : isEditingWh ? (
                    'Update Warehouse'
                  ) : (
                    'Save Warehouse'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Location Bin Modal */}
      {showBinModal && selectedWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Add Bin Location
              </h3>
              <button
                type="button"
                onClick={() => setShowBinModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {binFormError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {binFormError}
              </div>
            )}

            {/* Warehouse Capacity & Allocation Status */}
            <div className="mt-4 p-3.5 rounded-xl border border-[#EEEDF5] dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {language === 'id' ? 'Kapasitas Total Gudang' : 'Total Warehouse Capacity'}:
                </span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                  {selectedWarehouse.capacity.toLocaleString()} unit
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">
                  {language === 'id' ? 'Sudah Teralokasi ke Rak' : 'Already Allocated to Bins'}:
                </span>
                <span className="font-semibold font-mono text-[#7C6EF0] dark:text-indigo-400">
                  {currentTotalBinCapacity.toLocaleString()} unit ({locations.length} rak)
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">
                  {language === 'id' ? 'Sisa Kuota yang Dapat Dialokasikan' : 'Remaining Allocatable Quota'}:
                </span>
                <span
                  className={`font-bold font-mono ${
                    remainingWhCapacity <= 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {remainingWhCapacity.toLocaleString()} unit
                </span>
              </div>

              {remainingWhCapacity <= 0 && (
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-[11px] font-semibold mt-1">
                  ⚠️ {language === 'id'
                    ? 'Kapasitas gudang sudah teralokasi penuh (100%)! Tidak dapat menambah rak baru kecuali kapasitas gudang ditingkatkan atau rak yang tidak terpakai dihapus.'
                    : 'Warehouse capacity is 100% allocated! Cannot add new storage bins unless warehouse capacity is increased or unused bins removed.'}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitBin} className="mt-4 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-[#EEEDF5] dark:border-slate-700 text-xs flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Generated Bin Code:
                </span>
                <span className="font-mono font-bold text-[#7C6EF0] dark:text-indigo-300 text-sm">
                  {binZone.toUpperCase() || '?'}-{binRack || '?'}-{binShelf || '?'}-{binSlot.toUpperCase() || '?'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Zone (e.g. A, B, C) *
                  </label>
                  <input
                    type="text"
                    required
                    value={binZone}
                    onChange={(e) => setBinZone(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm uppercase font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="A"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Rack # (e.g. 01, 02) *
                  </label>
                  <input
                    type="text"
                    required
                    value={binRack}
                    onChange={(e) => setBinRack(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="01"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Shelf Level (e.g. 01, 02) *
                  </label>
                  <input
                    type="text"
                    required
                    value={binShelf}
                    onChange={(e) => setBinShelf(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Bin Slot (e.g. A, B, P1) *
                  </label>
                  <input
                    type="text"
                    required
                    value={binSlot}
                    onChange={(e) => setBinSlot(e.target.value)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm uppercase font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="A"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Storage Type *
                  </label>
                  <select
                    value={binType}
                    onChange={(e) => setBinType(e.target.value as LocationType)}
                    className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  >
                    <option value="shelf">Standard Shelf</option>
                    <option value="pallet_rack">Heavy Pallet Rack</option>
                    <option value="cold_storage">Cold Storage</option>
                    <option value="staging_area">Staging Dispatch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {language === 'id' ? 'Kapasitas Maks Rak (Unit)' : 'Max Capacity (Units)'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={remainingWhCapacity > 0 ? remainingWhCapacity : undefined}
                    placeholder="500"
                    required
                    value={binMaxCapacity}
                    onChange={(e) => setBinMaxCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                    className={`block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none transition-colors ${
                      Number(binMaxCapacity) > remainingWhCapacity
                        ? 'border-rose-500 focus:ring-2 focus:ring-rose-500'
                        : 'border-[#EEEDF5] dark:border-slate-700 focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0]'
                    }`}
                  />
                  {Number(binMaxCapacity) > remainingWhCapacity && (
                    <p className="text-rose-600 dark:text-rose-400 text-[11px] font-medium mt-1">
                      ⚠️ {language === 'id'
                        ? `Melebihi sisa kapasitas gudang! Maksimal input adalah ${remainingWhCapacity.toLocaleString()} unit.`
                        : `Exceeds warehouse remaining capacity! Maximum allowed is ${remainingWhCapacity.toLocaleString()} units.`}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBinModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isBinSubmitting ||
                    remainingWhCapacity <= 0 ||
                    Number(binMaxCapacity) > remainingWhCapacity
                  }
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isBinSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Add Bin'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Warehouse Modal */}
      {showDeleteWhModal && selectedWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-center text-slate-900 dark:text-white">
              Delete Warehouse Facility?
            </h3>
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-1">
              Are you sure you want to delete{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {selectedWarehouse.name}
              </strong>{' '}
              ({selectedWarehouse.code})? All associated storage bins will also be removed.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteWhModal(false)}
                className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteWh}
                disabled={isWhSubmitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all shadow-sm shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {isWhSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
