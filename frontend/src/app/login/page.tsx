'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { ApiError } from '@/lib/api';
import { Lock, Mail, Loader2, AlertCircle, Sun, Moon } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message || t('loginError'));
      } else {
        setErrorMsg(t('networkError'));
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
            title={t('lightMode')}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSetTheme(true)}
            className="p-1.5 rounded-full transition-all cursor-pointer text-[#8B8B99] hover:text-[#1B1B1F] dark:bg-[#7C6EF0] dark:text-white dark:hover:text-white dark:shadow-xs"
            title={t('darkMode')}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1B1B1F] dark:bg-white text-white dark:text-[#1B1B1F] font-black text-xl shadow-lg mb-4">
            SF
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1B1B1F] dark:text-white">
            Stock<span className="text-[#7C6EF0]">Flow</span>
          </h1>
          <p className="mt-1 text-sm text-[#8B8B99] dark:text-slate-400">
            {t('appSubtitle')}
          </p>
        </div>

        {/* Card Container with Dark Mode styles */}
        <div className="bg-white dark:bg-slate-900 rounded-[24px] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.08)] border border-[#EEEDF5] dark:border-slate-800 p-8 sm:p-10 transition-colors">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#1B1B1F] dark:text-white">{t('signIn')}</h2>
            <p className="text-xs text-[#8B8B99] dark:text-slate-400 mt-1">
              {t('signInSubtitle')}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-[#FBE8EA] dark:bg-rose-950/40 border border-[#E0475C]/20 flex items-start gap-3 text-[#E0475C] text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B99] dark:text-slate-400 mb-1.5"
              >
                {t('emailAddress')}
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8B8B99] dark:text-slate-400">
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
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-[#EEEDF5] dark:border-slate-800 rounded-xl text-[#1B1B1F] dark:text-white placeholder-[#8B8B99] dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0] focus:border-transparent text-sm transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B99] dark:text-slate-400 mb-1.5"
              >
                {t('password')}
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8B8B99] dark:text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-[#EEEDF5] dark:border-slate-800 rounded-xl text-[#1B1B1F] dark:text-white placeholder-[#8B8B99] dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0] focus:border-transparent text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#7C6EF0] hover:bg-[#6C5CE7] active:bg-[#5B4BD5] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7C6EF0] disabled:opacity-50 transition-all shadow-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('signingIn')}
                  </>
                ) : (
                  t('signIn')
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-[#EEEDF5] dark:border-slate-800 text-center">
            <p className="text-xs text-[#8B8B99] dark:text-slate-400">
              {language === 'id' ? 'Ingin mencoba demo recruiter?' : 'Testing the recruiter demo?'}{' '}
              <Link
                href="/register"
                className="font-semibold text-[#7C6EF0] hover:text-[#6C5CE7] hover:underline"
              >
                {language === 'id' ? 'Daftar di sini' : 'Sign up here'}
              </Link>
            </p>
          </div>
        </div>

        {/* Clean Footer */}
        <div className="mt-8 text-center text-xs text-[#8B8B99] dark:text-slate-500">
          {t('copyright')}
        </div>
      </div>
    </div>
  );
}
