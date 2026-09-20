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
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
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
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[230px] bg-white dark:bg-slate-900 border-r border-[#EEEDF5] dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Brand Header */}
        <div>
          <div className="h-16 flex items-center justify-between px-5 border-b border-[#EEEDF5] dark:border-slate-800">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1B1B1F] dark:bg-white text-white dark:text-[#1B1B1F] flex items-center justify-center font-bold text-xs tracking-wider shadow-sm">
                SF
              </div>
              <span className="font-bold text-base tracking-tight text-[#1B1B1F] dark:text-white">
                Stock<span className="text-[#7C6EF0]">Flow</span>
              </span>
            </Link>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-full hover:bg-[#EEEDF5] dark:hover:bg-slate-800 text-[#8B8B99] transition-colors"
              aria-label="Close menu"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3.5 space-y-1.5 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#7C6EF0] text-white shadow-sm shadow-[#7C6EF0]/25 font-semibold'
                      : 'text-[#8B8B99] dark:text-slate-400 hover:text-[#7C6EF0] hover:bg-[#F4F3FF] dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 stroke-[1.8] ${
                      isActive ? 'text-white' : 'text-[#8B8B99] dark:text-slate-400'
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-[#EEEDF5] dark:border-slate-800 space-y-3">
          {/* Logout */}
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium text-[#8B8B99] dark:text-slate-400 hover:text-[#E0475C] hover:bg-[#FBE8EA] dark:hover:bg-rose-950/30 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 stroke-[1.8]" />
            <span>{t('logout')}</span>
          </button>

          {/* Light / Dark Mode Capsule Switch */}
          <div className="bg-[#EEEDF5] dark:bg-slate-800 p-1 rounded-full flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleSetTheme(false)}
              className="flex-1 flex items-center justify-center py-1 rounded-full text-xs font-medium transition-all cursor-pointer bg-[#7C6EF0] text-white shadow-xs dark:bg-transparent dark:text-slate-400 dark:hover:text-white dark:shadow-none"
              title={t('lightMode')}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetTheme(true)}
              className="flex-1 flex items-center justify-center py-1 rounded-full text-xs font-medium transition-all cursor-pointer text-[#8B8B99] hover:text-[#1B1B1F] dark:bg-[#7C6EF0] dark:text-white dark:hover:text-white dark:shadow-xs"
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
