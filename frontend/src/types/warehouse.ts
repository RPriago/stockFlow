export type LocationType = 'shelf' | 'pallet_rack' | 'cold_storage' | 'staging_area';

export interface Location {
  id: string;
  warehouse_id: string;
  code: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  type: LocationType;
  max_capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  is_active: boolean;
  total_bins?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWarehouseInput {
  code?: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
}

export interface CreateLocationInput {
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  type: LocationType;
  max_capacity: number;
}
