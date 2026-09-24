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
    const initTimer = setTimeout(() => {
      fetchNotifications();
    }, 0);

    const handleRefresh = () => {
      fetchNotifications();
    };

    window.addEventListener('stockflow-notification-refresh', handleRefresh);
    window.addEventListener('stockflow-sync', handleRefresh);
    // Poll every 15 seconds for background updates
    const timer = setInterval(fetchNotifications, 15000);
    return () => {
      clearTimeout(initTimer);
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
    // eslint-disable-next-line react-hooks/purity
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
        return <Package className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
      case 'sales_order':
        return <ShoppingCart className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
      case 'capacity':
        return <WarehouseIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  const filteredNotifications = notifications.filter((n) =>
    notifFilter === 'unread' ? !n.is_read : true
  );

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 sm:px-6 lg:px-8 sticky top-0 z-30 transition-colors">
      {/* Left: Mobile hamburger & Persistent Desktop Search */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5 stroke-[1.8]" />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = searchQuery.trim();
            if (q) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('app:search', { detail: q }));
              }
              router.push(`/products?search=${encodeURIComponent(q)}`);
            }
          }}
          className="relative w-full hidden sm:block"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by SKU, product name, or warehouse..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50/70 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] dark:focus:border-emerald-500 transition-colors"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none stroke-[1.8]" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Right: Mobile Search, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3.5 ml-auto">
        {/* Mobile search button */}
        <div className="relative sm:hidden">
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
                className="w-40 pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none stroke-[1.8]" />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
                className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
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
              className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              aria-label={t('search')}
            >
              <Search className="w-4 h-4 stroke-[1.8]" />
            </button>
          )}
        </div>

        {/* Language Capsule Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 p-0.5 rounded-full text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-2 sm:px-2.5 py-1 rounded-full transition-all cursor-pointer text-[10px] sm:text-[11px] ${
              language === 'id'
                ? 'bg-[#0B3333] text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title={t('languageIndonesian')}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2 sm:px-2.5 py-1 rounded-full transition-all cursor-pointer text-[10px] sm:text-[11px] ${
              language === 'en'
                ? 'bg-[#0B3333] text-white shadow-xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
            className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              showNotifPopover
                ? 'bg-[#0B3333]/10 dark:bg-emerald-950/40 border-[#0B3333] dark:border-emerald-500 text-[#0B3333] dark:text-emerald-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
            }`}
            title={language === 'id' ? 'Notifikasi' : 'Notifications'}
            aria-label="Open notifications"
          >
            <Bell className="w-4 h-4 stroke-[1.8]" />

            {/* Red dot badge only shows when there are unread notifications */}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Mobile backdrop for notification popover */}
          {showNotifPopover && (
            <div
              className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-xs sm:hidden animate-in fade-in duration-150"
              onClick={() => setShowNotifPopover(false)}
            />
          )}

          {/* Notification Popover Dropdown */}
          {showNotifPopover && (
            <div
              ref={popoverRef}
              className="fixed inset-x-2.5 top-[68px] max-w-md mx-auto sm:mx-0 sm:max-w-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[calc(100vh-80px)] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            >
              {/* Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {language === 'id' ? 'Notifikasi' : 'Notifications'}
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex-shrink-0">
                      {unreadCount} {language === 'id' ? 'baru' : 'new'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-medium text-[#0B3333] hover:text-[#072525] dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span className="whitespace-nowrap">{language === 'id' ? 'Tandai dibaca' : 'Mark all read'}</span>
                    </button>
                  )}
                  {/* Close button on mobile devices */}
                  <button
                    type="button"
                    onClick={() => setShowNotifPopover(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 sm:hidden cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="px-3.5 sm:px-4 pt-2.5 pb-1 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex-shrink-0">
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
              <div className="flex-1 min-h-0 max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
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
                          if (notif.link && notif.link.startsWith('/') && !notif.link.startsWith('//')) {
                            router.push(notif.link);
                            setShowNotifPopover(false);
                          }
                        }}
                        className={`p-3.5 transition-colors cursor-pointer group flex items-start gap-3 relative ${
                          notif.is_read
                            ? 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50'
                            : 'bg-[#0B3333]/5 hover:bg-[#0B3333]/10 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/35'
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
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0B3333] dark:bg-emerald-400 flex-shrink-0" />
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
                              <span className="text-[#0B3333] dark:text-emerald-400 font-semibold flex items-center gap-0.5">
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
                          className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 transition-opacity absolute top-3 right-3 rounded cursor-pointer"
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
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-3.5 flex-shrink-0">
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
          <div className="w-9 h-9 rounded-full bg-[#0B3333]/10 dark:bg-emerald-950/50 text-[#0B3333] dark:text-emerald-400 border border-[#0B3333]/20 dark:border-emerald-800/40 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
            {user?.name ? user.name.charAt(0) : 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
              {user?.name || 'Authorized User'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
              {user?.role ? user.role.replace('_', ' ') : 'WMS User'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
