export type POStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contact_person: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierPayload {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
}

export interface POItem {
  product_id: string;
  variant_id?: string;
  product_name: string;
  sku: string;
  unit: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  subtotal: number;
  target_location_id?: string;
}

export interface CreatePOItemPayload {
  product_id: string;
  variant_id?: string;
  quantity_ordered: number;
  unit_cost: number;
  target_location_id?: string;
}

export interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  warehouse_name: string;
  status: POStatus;
  items: POItem[];
  total_quantity_ordered: number;
  total_quantity_received: number;
  total_amount: number;
  expected_date?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePOPayload {
  supplier_id: string;
  warehouse_id: string;
  expected_date?: string;
  notes?: string;
  items: CreatePOItemPayload[];
}

export interface ReceiveItemPayload {
  product_id: string;
  variant_id?: string;
  location_id: string;
  quantity_received: number;
}

export interface ReceivePOPayload {
  items: ReceiveItemPayload[];
  notes?: string;
}

export interface POStats {
  total_orders: number;
  draft_orders: number;
  pending_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_procurement_value: number;
}
