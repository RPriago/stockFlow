'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-[#7C6EF0] mb-3" />
        <p className="text-[#8B8B99] font-medium text-sm">
          Loading StockFlow...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-[#1B1B1F] dark:text-slate-100 flex">
      {/* Sidebar (Left Column) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area (Right Column) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-white dark:bg-slate-950">
        <Navbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-6 lg:p-8 bg-white dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
