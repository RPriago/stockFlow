'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Boxes,
  ClipboardList,
  Truck,
  Users,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { role, logout } = useAuth();
  const { t } = useLanguage();
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('stockflow-theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved === 'dark' || (!saved && prefersDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      queueMicrotask(() => {
        setIsDarkMode(isDark);
      });
    } catch {
      // ignore SSR or storage restriction
    }
  }, []);

  const handleSetTheme = (dark: boolean) => {
    setIsDarkMode(dark);
    try {
      if (dark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('stockflow-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('stockflow-theme', 'light');
      }
    } catch {
      // ignore
    }
  };

  const navItems = [
    { name: t('navDashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('navProducts'), href: '/products', icon: Package },
    { name: t('navWarehouses'), href: '/warehouses', icon: Warehouse },
    { name: t('navInventory'), href: '/inventory', icon: Boxes },
    { name: t('navPurchaseOrders'), href: '/purchase-orders', icon: ClipboardList },
    { name: t('navOutboundOrders'), href: '/outbound-orders', icon: Truck },
  ];

  if (role === 'super_admin' || role === 'warehouse_manager') {
    navItems.push({ name: t('navUsers'), href: '/users', icon: Users });
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[230px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Brand Header */}
        <div>
          <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0B3333] dark:bg-emerald-600 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs">
                SF
              </div>
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
                Stock<span className="text-[#0B3333] dark:text-emerald-400">Flow</span>
              </span>
            </Link>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
                    isActive
                      ? 'bg-[#0B3333]/10 dark:bg-emerald-500/15 text-slate-900 dark:text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#0B3333] dark:before:bg-emerald-400 before:rounded-r'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60 font-medium'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 stroke-[1.8] transition-colors ${
                      isActive
                        ? 'text-[#0B3333] dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {/* Logout */}
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 stroke-[1.8]" />
            <span>{t('logout')}</span>
          </button>

          {/* Light / Dark Mode Capsule Switch */}
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 p-0.5 rounded-full flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleSetTheme(false)}
              className={`flex-1 flex items-center justify-center py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                !isDarkMode
                  ? 'bg-[#0B3333] text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title={t('lightMode')}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetTheme(true)}
              className={`flex-1 flex items-center justify-center py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                isDarkMode
                  ? 'bg-[#0B3333] text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title={t('darkMode')}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
