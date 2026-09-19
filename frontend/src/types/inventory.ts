export type MovementType = 'stock_in' | 'stock_out' | 'adjustment' | 'reserve' | 'release';

export interface InventoryItem {
  id: string;
  product_id: string;
  variant_id?: string;
  warehouse_id: string;
  location_id: string;
  product_name: string;
  sku: string;
  warehouse_name: string;
  location_code: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  min_stock: number;
  unit: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  product_id: string;
  variant_id?: string;
  warehouse_id: string;
  location_id: string;
  product_name: string;
  sku: string;
  warehouse_name: string;
  location_code: string;
  movement_type: MovementType;
  quantity: number;
  balance_before: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface InventoryStats {
  total_on_hand: number;
  total_available: number;
  total_reserved: number;
  total_items_count: number;
  low_stock_items_count: number;
  movements_today: number;
}

export interface StockInPayload {
  product_id: string;
  variant_id?: string;
  warehouse_id: string;
  location_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
}

export interface StockOutPayload {
  product_id: string;
  variant_id?: string;
  warehouse_id: string;
  location_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
}

export interface StockAdjustmentPayload {
  product_id: string;
  variant_id?: string;
  warehouse_id: string;
  location_id: string;
  actual_quantity: number;
  reason: string;
  notes?: string;
}
