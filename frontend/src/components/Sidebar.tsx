'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  LayoutDashboard,
  Box,
  Warehouse,
  ArrowDownUp,
  ClipboardList,
  Truck,
  Users,
  Menu,
  LogOut,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { role, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
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

  const mainNavItems = [
    { name: t('navDashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('navProducts'), href: '/products', icon: Box },
    { name: t('navWarehouses'), href: '/warehouses', icon: Warehouse },
    { name: t('navInventory'), href: '/inventory', icon: ArrowDownUp },
    { name: t('navPurchaseOrders'), href: '/purchase-orders', icon: ClipboardList },
  ];

  const logisticsNavItems = [
    { name: t('navOutboundOrders'), href: '/outbound-orders', icon: Truck },
  ];

  if (role === 'super_admin' || role === 'warehouse_manager') {
    logisticsNavItems.push({
      name: role === 'super_admin' ? 'Staff & Roles (RBAC)' : t('navUsers'),
      href: '/users',
      icon: Users,
    });
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
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[240px] bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 flex-shrink-0 select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Section */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
            <Link href="/dashboard" className="flex items-center group py-1">
              <Image
                src="/djt_group.png"
                alt="DJT Group"
                width={115}
                height={40}
                className="h-7 w-auto max-w-[145px] object-contain invert dark:invert-0 transition-all duration-200"
                priority
              />
            </Link>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu className="w-4 h-4 stroke-[2]" />
            </button>
          </div>

          {/* MAIN Group */}
          <div className="px-3 pt-4">
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-1.5">
              MAIN
            </p>
            <nav className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-100/90 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border border-slate-200/90 dark:border-slate-700 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 stroke-[1.8] ${
                        isActive
                          ? 'text-[#0B3333] dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* LOGISTICS & CHANNELS Group */}
          <div className="px-3 pt-5">
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-1.5">
              LOGISTICS & CHANNELS
            </p>
            <nav className="space-y-1">
              {logisticsNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-100/90 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold border border-slate-200/90 dark:border-slate-700 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 stroke-[1.8] ${
                        isActive
                          ? 'text-[#0B3333] dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
          {/* Controls row: Theme & Language */}
          <div className="flex items-center justify-between gap-1.5 px-1">
            <button
              onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Switch language"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>{language.toUpperCase()}</span>
            </button>

            {/* Theme switcher capsule */}
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 p-0.5 rounded-full flex items-center">
              <button
                type="button"
                onClick={() => handleSetTheme(false)}
                className={`p-1 rounded-full text-xs transition-all cursor-pointer ${
                  !isDarkMode
                    ? 'bg-[#0B3333] text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={t('lightMode')}
              >
                <Sun className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleSetTheme(true)}
                className={`p-1 rounded-full text-xs transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#0B3333] text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('darkMode')}
              >
                <Moon className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 stroke-[1.8]" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
