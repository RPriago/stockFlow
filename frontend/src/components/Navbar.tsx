'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { api } from '@/lib/api';
import { Notification, NotificationSummary } from '@/types/notification';
import {
  Menu,
  Search,
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  Trash2,
  Clock,
  X,
  ExternalLink,
  Package,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  Loader2,
} from 'lucide-react';

interface NavbarProps {
  onMenuToggle: () => void;
}

// Module-level cache to prevent flicker/glitch during client-side navigation
let cachedUnreadCount = 0;
let cachedNotifications: Notification[] = [];

if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('stockflow-unread-count');
    if (saved !== null) {
      cachedUnreadCount = parseInt(saved, 10) || 0;
    }
  } catch {}
}

const updateCachedUnreadCount = (count: number) => {
  cachedUnreadCount = count;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('stockflow-unread-count', count.toString());
    } catch {}
  }
};

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  const [notifications, setNotifications] = useState<Notification[]>(cachedNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(cachedUnreadCount);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get<NotificationSummary>('/notifications');
      if (res.success && res.data) {
        const notifs = res.data.notifications || [];
        const count = res.data.unread_count || 0;
        cachedNotifications = notifs;
        updateCachedUnreadCount(count);
        setNotifications(notifs);
        setUnreadCount(count);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const handleRefresh = () => {
      fetchNotifications();
    };

    window.addEventListener('stockflow-notification-refresh', handleRefresh);
    window.addEventListener('stockflow-sync', handleRefresh);
    // Poll every 15 seconds for background updates
    const timer = setInterval(fetchNotifications, 15000);
    return () => {
      window.removeEventListener('stockflow-notification-refresh', handleRefresh);
      window.removeEventListener('stockflow-sync', handleRefresh);
      clearInterval(timer);
    };
  }, [fetchNotifications]);

  // Click outside to close notification popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(event.target as Node)
      ) {
        setShowNotifPopover(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifPopover(false);
      }
    };

    if (showNotifPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifPopover]);

  // Mark single notification as read
  const handleMarkAsRead = async (notif: Notification, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (notif.is_read) return;

    // Optimistic update
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n));
      cachedNotifications = next;
      return next;
    });
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      updateCachedUnreadCount(next);
      return next;
    });

    try {
      await api.patch(`/notifications/${notif.id}/read`, {});
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      fetchNotifications();
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true }));
      cachedNotifications = next;
      return next;
    });
    updateCachedUnreadCount(0);
    setUnreadCount(0);

    try {
      await api.post('/notifications/mark-all-read', {});
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      fetchNotifications();
    }
  };

  // Delete notification
  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const target = notifications.find((n) => n.id === id);
    const wasUnread = target && !target.is_read;

    // Optimistic delete
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      cachedNotifications = next;
      return next;
    });
    if (wasUnread) {
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        updateCachedUnreadCount(next);
        return next;
      });
    }

    try {
      await api.delete(`/notifications/${id}`);
    } catch (err) {
      console.error('Failed to delete notification:', err);
      fetchNotifications();
    }
  };

  // Clear read notifications
  const handleClearRead = async () => {
    setNotifications((prev) => prev.filter((n) => !n.is_read));

    try {
      await api.delete('/notifications');
    } catch (err) {
      console.error('Failed to clear read notifications:', err);
      fetchNotifications();
    }
  };

  // Format relative timestamp
  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return language === 'id' ? 'Baru saja' : 'Just now';
    if (minutes < 60) return `${minutes}m ${language === 'id' ? 'lalu' : 'ago'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}j ${language === 'id' ? 'lalu' : 'h ago'}`;
    const days = Math.floor(hours / 24);
    return `${days}d ${language === 'id' ? 'lalu' : 'd ago'}`;
  };

  // Get icon for notification
  const getNotificationIcon = (notif: Notification) => {
    switch (notif.type) {
      case 'out_of_stock':
        return <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'low_stock':
        return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'purchase_order':
        return <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'sales_order':
        return <ShoppingCart className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case 'capacity':
        return <WarehouseIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  const filteredNotifications = notifications.filter((n) =>
    notifFilter === 'unread' ? !n.is_read : true
  );

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-[#EEEDF5] dark:border-slate-800 flex items-center justify-between px-6 lg:px-8 sticky top-0 z-30 transition-colors">
      {/* Left: Mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-[#8B8B99] hover:text-[#1B1B1F] dark:text-slate-400 dark:hover:text-white hover:bg-[#EEEDF5] dark:hover:bg-slate-800 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5 stroke-[1.8]" />
        </button>
      </div>

      {/* Right: Search, Language Switcher, Notifications, Profile */}
      <div className="flex items-center gap-3.5 ml-auto">
        {/* Search button / input */}
        <div className="relative">
          {showSearch ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchQuery.trim();
                if (q) {
                  setShowSearch(false);
                  setSearchQuery('');
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('app:search', { detail: q }));
                  }
                  router.push(`/products?search=${encodeURIComponent(q)}`);
                }
              }}
              className="flex items-center"
            >
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
                className="w-48 sm:w-72 pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-full text-[#1B1B1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]"
              />
              <Search className="w-3.5 h-3.5 text-[#8B8B99] dark:text-slate-400 absolute left-3 pointer-events-none stroke-[1.8]" />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="absolute right-2.5 p-0.5 text-[#8B8B99] hover:text-[#1B1B1F] dark:hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 flex items-center justify-center text-[#8B8B99] dark:text-slate-400 hover:text-[#1B1B1F] dark:hover:text-white hover:border-[#C7BFFA] transition-all cursor-pointer"
              title={t('search')}
            >
              <Search className="w-4 h-4 stroke-[1.8]" />
            </button>
          )}
        </div>

        {/* Language Capsule Switcher */}
        <div className="flex items-center bg-[#EEEDF5] dark:bg-slate-800 p-0.5 rounded-full text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer text-[11px] ${
              language === 'id'
                ? 'bg-[#7C6EF0] text-white shadow-xs font-bold'
                : 'text-[#8B8B99] dark:text-slate-400 hover:text-[#1B1B1F] dark:hover:text-white'
            }`}
            title={t('languageIndonesian')}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer text-[11px] ${
              language === 'en'
                ? 'bg-[#7C6EF0] text-white shadow-xs font-bold'
                : 'text-[#8B8B99] dark:text-slate-400 hover:text-[#1B1B1F] dark:hover:text-white'
            }`}
            title={t('languageEnglish')}
          >
            EN
          </button>
        </div>

        {/* Notifications Icon with Dynamic Unread Badge & Dropdown */}
        <div className="relative">
          <button
            ref={bellButtonRef}
            type="button"
            onClick={() => {
              setShowNotifPopover((prev) => !prev);
              if (!showNotifPopover) {
                fetchNotifications();
              }
            }}
            className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
              showNotifPopover
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-800 border-[#EEEDF5] dark:border-slate-700 text-[#8B8B99] dark:text-slate-400 hover:text-[#1B1B1F] dark:hover:text-white hover:border-[#C7BFFA]'
            }`}
            title={language === 'id' ? 'Notifikasi' : 'Notifications'}
            aria-label="Open notifications"
          >
            <Bell className="w-4 h-4 stroke-[1.8]" />

            {/* Red dot badge only shows when there are unread notifications */}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F04452] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Popover Dropdown */}
          {showNotifPopover && (
            <div
              ref={popoverRef}
              className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {language === 'id' ? 'Notifikasi' : 'Notifications'}
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      {unreadCount} {language === 'id' ? 'baru' : 'new'}
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{language === 'id' ? 'Tandai semua dibaca' : 'Mark all read'}</span>
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => setNotifFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    notifFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {language === 'id' ? 'Semua' : 'All'} ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilter('unread')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    notifFilter === 'unread'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {language === 'id' ? 'Belum Dibaca' : 'Unread'} ({unreadCount})
                </button>
              </div>

              {/* Notification List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredNotifications.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                      <Bell className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {language === 'id' ? 'Tidak ada notifikasi' : 'No notifications'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {language === 'id'
                        ? notifFilter === 'unread'
                          ? 'Semua notifikasi sudah dibaca.'
                          : 'Semua operasional gudang berjalan lancar.'
                        : notifFilter === 'unread'
                        ? 'All notifications have been read.'
                        : 'All warehouse operations are running smoothly.'}
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => {
                    const title = language === 'id' ? notif.title_id || notif.title_en : notif.title_en || notif.title_id;
                    const message = language === 'id' ? notif.message_id || notif.message_en : notif.message_en || notif.message_id;

                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          handleMarkAsRead(notif);
                          if (notif.link) {
                            router.push(notif.link);
                            setShowNotifPopover(false);
                          }
                        }}
                        className={`p-3.5 transition-colors cursor-pointer group flex items-start gap-3 relative ${
                          notif.is_read
                            ? 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50'
                            : 'bg-indigo-50/40 hover:bg-indigo-50/70 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40'
                        }`}
                      >
                        {/* Status Icon */}
                        <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notif)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h4
                              className={`text-xs truncate ${
                                notif.is_read
                                  ? 'font-medium text-slate-700 dark:text-slate-300'
                                  : 'font-bold text-slate-900 dark:text-white'
                              }`}
                            >
                              {title}
                            </h4>
                            {!notif.is_read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 flex-shrink-0" />
                            )}
                          </div>

                          <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {message}
                          </p>

                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeAgo(notif.created_at)}
                            </span>
                            {notif.link && (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-0.5">
                                {language === 'id' ? 'Buka' : 'View'}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delete single button */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteNotification(notif.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 transition-opacity absolute top-3 right-3 rounded"
                          title={language === 'id' ? 'Hapus' : 'Delete'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-3.5">
                <span className="flex items-center gap-1 text-[10px]">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {language === 'id' ? 'Otomatis hilang per 3x24 jam' : 'Auto-expires in 3 days'}
                </span>

                {notifications.some((n) => n.is_read) && (
                  <button
                    type="button"
                    onClick={handleClearRead}
                    className="text-[10px] font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{language === 'id' ? 'Bersihkan dibaca' : 'Clear read'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2.5 pl-2">
          <div className="w-9 h-9 rounded-full bg-[#F4F3FF] dark:bg-slate-800 text-[#7C6EF0] dark:text-[#9D93F5] border border-[#EEEDF5] dark:border-slate-700 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
            {user?.name ? user.name.charAt(0) : 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-[#1B1B1F] dark:text-white leading-tight">
              {user?.name || 'Authorized User'}
            </p>
            <p className="text-[11px] text-[#8B8B99] dark:text-slate-400 capitalize">
              {user?.role ? user.role.replace('_', ' ') : 'WMS User'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
