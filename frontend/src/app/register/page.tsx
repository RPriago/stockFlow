'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Role } from '@/types/auth';
import { ApiError } from '@/lib/api';
import {
  Lock,
  Mail,
  User as UserIcon,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Boxes,
} from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('warehouse_staff');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('stockflow-theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {
      // ignore
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(language === 'id' ? 'Nama lengkap wajib diisi' : 'Full name is required');
      return;
    }

    if (password.length < 8) {
      setErrorMsg(
        language === 'id'
          ? 'Password minimal 8 karakter'
          : 'Password must be at least 8 characters long'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await register(name.trim(), email.trim(), password, selectedRole);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message || 'Registration failed');
      } else {
        setErrorMsg(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950 transition-colors relative">
      {/* Top Right Controls: Language & Theme Switches */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        {/* Language Capsule */}
        <div className="flex items-center bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-800 p-0.5 rounded-full text-xs font-semibold shadow-xs">
          <button
            type="button"
            onClick={() => setLanguage('id')}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer text-[11px] ${
              language === 'id'
                ? 'bg-[#7C6EF0] text-white shadow-xs font-bold'
                : 'text-[#8B8B99] dark:text-slate-400 hover:text-[#1B1B1F] dark:hover:text-white'
            }`}
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
          >
            EN
          </button>
        </div>

        {/* Theme Capsule */}
        <div className="flex items-center bg-white dark:bg-slate-900 border border-[#EEEDF5] dark:border-slate-800 p-0.5 rounded-full shadow-xs">
          <button
            type="button"
            onClick={() => handleSetTheme(false)}
            className="p-1.5 rounded-full transition-all cursor-pointer bg-[#7C6EF0] text-white shadow-xs dark:bg-transparent dark:text-slate-400 dark:hover:text-white dark:shadow-none"
            title="Light mode"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSetTheme(true)}
            className="p-1.5 rounded-full transition-all cursor-pointer text-[#8B8B99] hover:text-[#1B1B1F] dark:bg-[#7C6EF0] dark:text-white dark:hover:text-white dark:shadow-xs"
            title="Dark mode"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Register Box */}
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-[#7C6EF0]/10 dark:bg-[#7C6EF0]/20 px-3 py-1.5 rounded-full mb-3">
            <Boxes className="w-5 h-5 text-[#7C6EF0]" />
            <span className="text-xs font-bold tracking-wide uppercase text-[#7C6EF0]">
              StockFlow WMS
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
            {language === 'id' ? 'Daftar Akun Demo' : 'Create Demo Account'}
          </h1>
          <p className="text-xs text-[#8B8B99] dark:text-slate-400 mt-1">
            {language === 'id'
              ? 'Daftar untuk menguji fitur live demo sebagai Staf atau Manajer Gudang'
              : 'Sign up to test live demo features as Warehouse Staff or Manager'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#EEEDF5] dark:border-slate-800 p-6 sm:p-7 shadow-xs">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-400 animate-in fade-in zoom-in-95">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#1B1B1F] dark:text-slate-200 mb-2">
                {language === 'id' ? 'Pilih Peran Pengguna' : 'Select Testing Role'}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Staff Option */}
                <button
                  type="button"
                  onClick={() => setSelectedRole('warehouse_staff')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                    selectedRole === 'warehouse_staff'
                      ? 'border-[#7C6EF0] bg-[#7C6EF0]/5 dark:bg-[#7C6EF0]/15 ring-2 ring-[#7C6EF0]/20'
                      : 'border-[#EEEDF5] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    {selectedRole === 'warehouse_staff' && (
                      <CheckCircle2 className="w-4 h-4 text-[#7C6EF0]" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1B1B1F] dark:text-white">
                      Warehouse Staff
                    </p>
                    <p className="text-[10px] text-[#8B8B99] dark:text-slate-400 mt-0.5 line-clamp-2">
                      {language === 'id'
                        ? 'Input barang, buat SO, customer, picking & dispatch'
                        : 'Stock intake, create SO, customers, pick & dispatch'}
                    </p>
                  </div>
                </button>

                {/* Manager Option */}
                <button
                  type="button"
                  onClick={() => setSelectedRole('warehouse_manager')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                    selectedRole === 'warehouse_manager'
                      ? 'border-[#7C6EF0] bg-[#7C6EF0]/5 dark:bg-[#7C6EF0]/15 ring-2 ring-[#7C6EF0]/20'
                      : 'border-[#EEEDF5] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    {selectedRole === 'warehouse_manager' && (
                      <CheckCircle2 className="w-4 h-4 text-[#7C6EF0]" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1B1B1F] dark:text-white">
                      Warehouse Manager
                    </p>
                    <p className="text-[10px] text-[#8B8B99] dark:text-slate-400 mt-0.5 line-clamp-2">
                      {language === 'id'
                        ? 'Kelola gudang, approval PO, confirm SO & analitik'
                        : 'Manage warehouses, PO approval, confirm SO & reports'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-[#1B1B1F] dark:text-slate-200 mb-1">
                {language === 'id' ? 'Nama Lengkap' : 'Full Name'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe (Recruiter Demo)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-[#1B1B1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]"
                />
                <UserIcon className="w-4 h-4 text-[#8B8B99] dark:text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-[#1B1B1F] dark:text-slate-200 mb-1">
                {t('emailAddress')}
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-[#1B1B1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]"
                />
                <Mail className="w-4 h-4 text-[#8B8B99] dark:text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#1B1B1F] dark:text-slate-200 mb-1">
                {t('password')} (min. 8 chars)
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-[#1B1B1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]"
                />
                <Lock className="w-4 h-4 text-[#8B8B99] dark:text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-xs transition-all shadow-sm shadow-[#7C6EF0]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{language === 'id' ? 'Mendaftarkan...' : 'Registering...'}</span>
                </>
              ) : (
                <span>
                  {language === 'id' ? 'Buat Akun & Mulai Demo' : 'Create Account & Start Demo'}
                </span>
              )}
            </button>
          </form>

          {/* Link to Login */}
          <div className="mt-5 pt-4 border-t border-[#EEEDF5] dark:border-slate-800 text-center">
            <p className="text-xs text-[#8B8B99] dark:text-slate-400">
              {language === 'id' ? 'Sudah punya akun?' : 'Already have an account?'}{' '}
              <Link
                href="/login"
                className="font-semibold text-[#7C6EF0] hover:underline cursor-pointer ml-1"
              >
                {language === 'id' ? 'Masuk di sini' : 'Log in here'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
