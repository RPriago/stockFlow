'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { ApiError } from '@/lib/api';
import AuthHero from '@/components/AuthHero';
import { Lock, Mail, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon, Info } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
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
    setInfoMsg(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message || t('loginError'));
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(t('networkError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(t('forgotPasswordNotice'));
  };

  return (
    <div className="min-h-screen flex w-full bg-white dark:bg-slate-950 transition-colors">
      {/* Left Column: Form Section */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 xl:p-16 min-h-screen relative">
        {/* Top Header: Controls (Language & Theme) */}
        <div className="flex items-center justify-between w-full mb-8">
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

        {/* Center Content: Login Form */}
        <div className="w-full max-w-md mx-auto my-auto py-6">
          {/* Heading and Subtitle */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('welcomeBack')}
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('signInSubtitle')}
            </p>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-xs sm:text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-3 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t('emailAddress')}
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
                  placeholder={t('emailPlaceholder')}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t('password')}
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0B3333]/20 focus:border-[#0B3333] text-sm transition-all"
                  placeholder={t('passwordPlaceholder')}
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

            {/* Forgot Password Link */}
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-[#0B3333] dark:hover:text-emerald-400 hover:underline cursor-pointer"
              >
                {t('forgotPassword')}
              </button>
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
                    <span>{t('signingIn')}</span>
                  </>
                ) : (
                  t('signIn')
                )}
              </button>
            </div>
          </form>

          {/* Bottom Switcher */}
          <div className="mt-8 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('dontHaveAccount')}{' '}
              <Link
                href="/register"
                className="font-semibold text-[#0B3333] dark:text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                {t('signUp')}
              </Link>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          {t('copyright')}
        </div>
      </div>

      {/* Right Column: Hero Visual */}
      <AuthHero />
    </div>
  );
}
