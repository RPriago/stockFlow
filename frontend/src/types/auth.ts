export type Role = 'super_admin' | 'warehouse_manager' | 'warehouse_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  warehouse_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
}

export interface LoginResult {
  user: User;
  token: string;
  expires_at: string;
}

export interface UserListResult {
  users: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}
