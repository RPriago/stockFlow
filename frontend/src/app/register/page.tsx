'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Role } from '@/types/auth';
import { ApiError } from '@/lib/api';
import AuthHero from '@/components/AuthHero';
import {
  Lock,
  Mail,
  User as UserIcon,
  Briefcase,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
} from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('stockflow-theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      queueMicrotask(() => {
        setIsDarkMode(isDark);
      });
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

    if (!selectedRole) {
      setErrorMsg(language === 'id' ? 'Silakan pilih peran akun' : 'Please select your role');
      return;
    }

    setIsSubmitting(true);

    try {
      await register(name.trim(), email.trim(), password, selectedRole as Role);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message || 'Registration failed');
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-white dark:bg-slate-950 transition-colors">
      {/* Left Column: Form Section */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 xl:p-16 min-h-screen relative">
        {/* Top Header: Controls (Language & Theme) */}
        <div className="flex items-center justify-between w-full mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
              Stock<span className="text-[#0B3333] dark:text-emerald-400">Flow</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Capsule */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-full text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLanguage('id')}
                className={`px-2.5 py-1 rounded-full transition-all cursor-pointer text-[11px] ${
                  language === 'id'
                    ? 'bg-[#0B3333] text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                ID
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded-full transition-all cursor-pointer text-[11px] ${
                  language === 'en'
                    ? 'bg-[#0B3333] text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-full">
              <button
                type="button"
                onClick={() => handleSetTheme(false)}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  !isDarkMode
                    ? 'bg-[#0B3333] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title={t('lightMode')}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetTheme(true)}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#0B3333] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title={t('darkMode')}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Center Content: Register Form */}
        <div className="w-full max-w-md mx-auto my-auto py-4">
          {/* Heading and Subtitle */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Create an Account
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Sign up to manage warehouse inventory, track stock levels, and monitor logistics in real time.
            </p>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-xs sm:text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Full Name Field */}
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="h-4 w-4" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] text-sm transition-all"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Email
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] text-sm transition-all"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] text-sm transition-all"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Role Dropdown Field */}
            <div>
              <label
                htmlFor="role"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Role
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Briefcase className="h-4 w-4" />
                </div>
                <select
                  id="role"
                  name="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  required
                  className={`block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm transition-all appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] ${
                    selectedRole ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <option value="" disabled>
                    Select your role
                  </option>
                  <option value="warehouse_staff">Warehouse Staff</option>
                  <option value="warehouse_manager">Warehouse Manager</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#0B3333] hover:bg-[#072525] active:bg-[#041a1a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0B3333] disabled:opacity-50 transition-all shadow-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    <span>Signing Up...</span>
                  </>
                ) : (
                  'Sign Up'
                )}
              </button>
            </div>
          </form>

          {/* Bottom Switcher */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-semibold text-[#0B3333] dark:text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          © 2026 StockFlow WMS. All rights reserved.
        </div>
      </div>

      {/* Right Column: Hero Visual */}
      <AuthHero />
    </div>
  );
}
