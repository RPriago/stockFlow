export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'purchase_order'
  | 'sales_order'
  | 'capacity'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title_id: string;
  title_en: string;
  message_id: string;
  message_en: string;
  severity: NotificationSeverity;
  link?: string;
  entity_id?: string;
  is_read: boolean;
  created_at: string;
  expires_at: string;
}

export interface NotificationSummary {
  notifications: Notification[];
  unread_count: number;
  total: number;
}

