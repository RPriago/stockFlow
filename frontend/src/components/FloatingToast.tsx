'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import {
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface FloatingToastProps {
  type?: ToastType;
  title?: string;
  message: string | null;
  onClose: () => void;
  duration?: number;
}

export default function FloatingToast({
  type = 'success',
  title,
  message,
  onClose,
  duration = 4200,
}: FloatingToastProps) {
  const { language } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const defaultTitles: Record<ToastType, { id: string; en: string }> = {
    success: { id: 'Berhasil', en: 'Success' },
    error: { id: 'Terjadi Kesalahan', en: 'Something went wrong' },
    warning: { id: 'Peringatan', en: 'Attention Required' },
    info: { id: 'Informasi', en: 'Information' },
  };

  const resolvedTitle =
    title || (language === 'id' ? defaultTitles[type].id : defaultTitles[type].en);

  // Trigger entering animation when message changes
  useEffect(() => {
    if (message) {
      setIsRendered(true);
      const enterTimer = setTimeout(() => {
        setIsVisible(true);
      }, 20);

      return () => clearTimeout(enterTimer);
    } else {
      setIsVisible(false);
      const exitTimer = setTimeout(() => {
        setIsRendered(false);
      }, 500);
      return () => clearTimeout(exitTimer);
    }
  }, [message]);

  // Handle auto-dismiss timer with pause on hover
  useEffect(() => {
    if (!message || isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, isPaused, duration]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsRendered(false);
    }, 500);
  };

  if (!isRendered && !message) return null;

  // Variants styling matching pill reference
  const styles = {
    success: {
      container:
        'bg-[#EAF8EF]/95 dark:bg-[#0D2B1A]/95 border-[#B7ECC8] dark:border-[#1E5633] text-[#136633] dark:text-[#38D37B]',
      icon: <CheckCircle2 className="w-6 h-6 text-[#1FAA59] dark:text-[#38D37B] shrink-0 stroke-[2]" />,
      title: 'text-[#136633] dark:text-[#38D37B]',
      desc: 'text-[#2E7247] dark:text-[#8DD4A7]',
      close:
        'text-[#1FAA59] hover:text-[#136633] hover:bg-[#1FAA59]/10 dark:text-[#38D37B] dark:hover:text-[#67E29D]',
    },
    error: {
      container:
        'bg-[#FDECEB]/95 dark:bg-[#331110]/95 border-[#F8BEBA] dark:border-[#662220] text-[#912018] dark:text-[#F97066]',
      icon: <AlertOctagon className="w-6 h-6 text-[#D92D20] dark:text-[#F97066] shrink-0 stroke-[2]" />,
      title: 'text-[#912018] dark:text-[#F97066]',
      desc: 'text-[#B43B33] dark:text-[#FDA29B]',
      close:
        'text-[#D92D20] hover:text-[#912018] hover:bg-[#D92D20]/10 dark:text-[#F97066] dark:hover:text-[#FDA29B]',
    },
    warning: {
      container:
        'bg-[#FEF6E4]/95 dark:bg-[#2C210A]/95 border-[#FADBA3] dark:border-[#574113] text-[#78350F] dark:text-[#FBBF24]',
      icon: <AlertTriangle className="w-6 h-6 text-[#D97706] dark:text-[#FBBF24] shrink-0 stroke-[2]" />,
      title: 'text-[#78350F] dark:text-[#FBBF24]',
      desc: 'text-[#92400E] dark:text-[#FDE68A]',
      close:
        'text-[#D97706] hover:text-[#78350F] hover:bg-[#D97706]/10 dark:text-[#FBBF24] dark:hover:text-[#FDE68A]',
    },
    info: {
      container:
        'bg-[#EEF4FE]/95 dark:bg-[#0D1C33]/95 border-[#BFD5FB] dark:border-[#1C3A6A] text-[#1E40AF] dark:text-[#60A5FA]',
      icon: <Info className="w-6 h-6 text-[#2563EB] dark:text-[#60A5FA] shrink-0 stroke-[2]" />,
      title: 'text-[#1E40AF] dark:text-[#60A5FA]',
      desc: 'text-[#1D4ED8] dark:text-[#93C5FD]',
      close:
        'text-[#2563EB] hover:text-[#1E40AF] hover:bg-[#2563EB]/10 dark:text-[#60A5FA] dark:hover:text-[#BFD5FB]',
    },
  }[type];

  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className={`pointer-events-auto flex items-center gap-3.5 px-5 py-3.5 rounded-3xl border shadow-xl shadow-slate-900/10 backdrop-blur-md min-w-[300px] max-w-md sm:max-w-lg transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          styles.container
        } ${
          isVisible
            ? 'translate-y-0 opacity-100 scale-100'
            : '-translate-y-16 opacity-0 scale-95'
        }`}
        role="alert"
      >
        {/* Left Icon */}
        {styles.icon}

        {/* Text Area */}
        <div className="flex-1 min-w-0 pr-1">
          <div className={`text-sm font-bold leading-tight ${styles.title}`}>
            {resolvedTitle}
          </div>
          <div className={`text-xs mt-0.5 leading-snug break-words ${styles.desc}`}>
            {message}
          </div>
        </div>

        {/* Close Action Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className={`p-1 rounded-full transition-colors cursor-pointer shrink-0 ml-1 ${styles.close}`}
          aria-label="Close notification"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}

