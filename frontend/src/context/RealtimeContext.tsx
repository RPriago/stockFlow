'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getAuthToken } from '@/lib/api';

export interface DataChangeEvent {
  resource: string;
  method?: string;
  path?: string;
  timestamp?: number;
}

interface RealtimeContextType {
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextType>({ isConnected: false });

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsConnected(false);
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
      const token = getAuthToken();
      const url = token
        ? `${baseUrl}/events?token=${encodeURIComponent(token)}`
        : `${baseUrl}/events`;

      try {
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.addEventListener('connected', () => {
          if (isMounted) setIsConnected(true);
        });

        eventSource.addEventListener('data_changed', (e: MessageEvent) => {
          try {
            const data: DataChangeEvent = JSON.parse(e.data);
            if (typeof window !== 'undefined') {
              // Dispatch granular sync event
              window.dispatchEvent(new CustomEvent('stockflow-sync', { detail: data }));
              // Also trigger notification and dashboard refresh
              window.dispatchEvent(new CustomEvent('stockflow-notification-refresh'));
            }
          } catch {
            // Ignore parse error
          }
        });

        eventSource.addEventListener('ping', () => {
          // Heartbeat keep-alive
        });

        eventSource.onerror = () => {
          if (isMounted) setIsConnected(false);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            if (isMounted) connect();
          }, 5000);
        };
      } catch (err) {
        console.error('Failed to establish EventSource connection:', err);
      }
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [isAuthenticated]);

  return (
    <RealtimeContext.Provider value={{ isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);

