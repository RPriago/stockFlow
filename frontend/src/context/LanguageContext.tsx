'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, TranslationKey } from '@/lib/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('id');

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('stockflow-lang') as Language | null;
      if (savedLang === 'en' || savedLang === 'id') {
        setLanguageState(savedLang);
      } else {
        // Check browser language
        const browserLang = navigator.language?.toLowerCase() || '';
        if (browserLang.startsWith('en')) {
          setLanguageState('en');
        } else {
          setLanguageState('id');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('stockflow-lang', lang);
    } catch {
      // ignore
    }
  };

  const t = (key: TranslationKey, fallback?: string): string => {
    const dict = translations[language] || translations.id;
    return dict[key] || fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

const fallbackLanguageContext: LanguageContextType = {
  language: 'id',
  setLanguage: () => {},
  t: (key: TranslationKey, fallback?: string) => translations.id[key] || fallback || key,
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  return context || fallbackLanguageContext;
}

