import type { Metadata } from 'next';
import './globals.css';
import Script from 'next/script';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { RealtimeProvider } from '@/context/RealtimeContext';

export const metadata: Metadata = {
  title: 'StockFlow — Warehouse Management System',
  description: 'Scalable and high-performance WMS platform for modern inventory management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var savedTheme = localStorage.getItem('stockflow-theme');
                var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-[#1B1B1F] dark:bg-slate-950 dark:text-slate-100 antialiased">
        <LanguageProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
