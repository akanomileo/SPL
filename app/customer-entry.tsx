'use client';
import { useEffect, useState } from 'react';
import { api, errorMessage, type Session } from '@/lib/connected';
import Storefront from './storefront';
export default function CustomerEntry() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const value = await api<Session>('/api/auth/session');
        if (active) {
          setSession(value);
          setError('');
        }
      } catch (e) {
        if (active) {
          setSession(null);
          setError(errorMessage(e));
        }
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return (
    <Storefront
      signedIn={Boolean(session?.user)}
      onSignOut={async () => {
        if (!session?.user) return;
        try {
          await api('/api/auth/logout', { method: 'POST', csrf: session.csrf });
          setSession(null);
          setError('');
          window.dispatchEvent(new Event('spl-session-changed'));
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
      sessionError={error}
    />
  );
}
