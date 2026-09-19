export type SOStatus =
  | 'draft'
  | 'confirmed'
  | 'picking'
  | 'packing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface Customer {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerPayload {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

export interface UpdateCustomerPayload {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  is_active?: boolean;
}

export interface SOItem {
  product_id: string;
  variant_id?: string;
  product_name: string;
  sku: string;
  unit: string;
  location_id: string;
  location_code: string;
  quantity_ordered: number;
  unit_price: number;
  subtotal: number;
}

export interface CreateSOItemPayload {
  product_id: string;
  variant_id?: string;
  location_id: string;
  quantity_ordered: number;
  unit_price: number;
}

export interface SalesOrder {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  warehouse_id: string;
  warehouse_name: string;
  status: SOStatus;
  items: SOItem[];
  total_quantity: number;
  total_amount: number;
  shipping_address: string;
  carrier?: string;
  tracking_number?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  confirmed_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSOPayload {
  customer_id: string;
  warehouse_id: string;
  shipping_address: string;
  notes?: string;
  items: CreateSOItemPayload[];
}

export interface DispatchSOPayload {
  carrier: string;
  tracking_number: string;
  notes?: string;
}

export interface SOStats {
  total_orders: number;
  draft_orders: number;
  pending_fulfillment: number;
  shipped_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_revenue: number;
}
