import { ApiResponse } from '@/types/auth';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
const cleanUrl = rawApiUrl.trim().replace(/\/+$/, '');
const API_BASE_URL = cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;

export class ApiError extends Error {
  statusCode: number;
  data?: any;

  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

let memoryToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('stockflow_token');
  }
};

export const getAuthToken = () => memoryToken;

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem('stockflow_device_id');
    if (!id) {
      const match = document.cookie.match(/(^|;)\s*stockflow_device_id=([^;]+)/);
      if (match) {
        id = decodeURIComponent(match[2]);
      } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'dev-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      localStorage.setItem('stockflow_device_id', id);
      document.cookie = `stockflow_device_id=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
    }
    return id;
  } catch {
    return '';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const deviceId = getOrCreateDeviceId();
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(deviceId ? { 'X-Device-ID': deviceId } : {}),
  };

  // SEC-003: Attach in-memory Bearer token fallback for cross-domain deployments without localStorage exposure
  if (memoryToken) {
    defaultHeaders['Authorization'] = `Bearer ${memoryToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Ensures HTTP-only cookies are automatically sent & received
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
    throw new ApiError(errorMsg, response.status, data);
  }

  // Trigger immediate notification check for any operational task completion
  if (
    typeof window !== 'undefined' &&
    options.method &&
    options.method !== 'GET' &&
    !endpoint.includes('/notifications')
  ) {
    window.dispatchEvent(new CustomEvent('stockflow-notification-refresh'));
  }

  return data;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
