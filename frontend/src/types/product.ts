export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  attributes?: Record<string, string>;
  price: number;
  cost_price: number;
  min_stock: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category_id: string;
  category_name: string;
  unit: string;
  min_stock: number;
  price: number;
  cost_price: number;
  image_url: string;
  variants: ProductVariant[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProductListResult {
  products: Product[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface CreateProductInput {
  sku?: string;
  barcode?: string;
  name: string;
  description?: string;
  category_id: string;
  unit: string;
  min_stock: number;
  price: number;
  cost_price: number;
  image_url?: string;
  variants: {
    sku?: string;
    name: string;
    attributes?: Record<string, string>;
    price: number;
    cost_price: number;
    min_stock: number;
  }[];
}
