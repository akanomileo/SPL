'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { AuthForm } from '@/components/auth-form';
import { OrderHistory } from '@/components/order-history';
import { api, errorMessage, type Session } from '@/lib/connected';
export default function Account() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const auth = await api<Session>('/api/auth/session');
      setSession(auth);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Refresh awaits server responses before setting state.
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', csrf: session?.csrf });
      setSession({ user: null, csrf: null });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <div className="portal customer-portal">
      <header className="portal-header">
        <Link className="portal-brand" href="/">
          SHWE PYAE SAN<small>My account</small>
        </Link>
        <Link className="portal-header-link" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to shop
        </Link>
      </header>
      <main className="portal-main">
        {loading ? (
          <output className="portal-loading">
            <span className="portal-loading-dot" />
            Loading your orders…
          </output>
        ) : !session?.user ? (
          <AuthForm onSignedIn={() => void refresh()} />
        ) : session.user.role === 'owner' ? (
          <section className="auth-card">
            <h1>Owner account</h1>
            <p>Open the dashboard to manage your shop.</p>
            <Link className="portal-primary" href="/owner/">
              Open owner dashboard
            </Link>
            <button className="portal-secondary" onClick={() => void logout()}>
              Sign out
            </button>
          </section>
        ) : (
          <>
            <div className="portal-title">
              <div>
                <span className="eyebrow">MY ACCOUNT</span>
                <h1>My orders</h1>
                <p>
                  View your orders, send receipts and check delivery status.
                </p>
              </div>
              <div className="portal-actions">
                <button
                  className="portal-secondary"
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Refresh
                </button>
                <button
                  className="portal-secondary"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
            <OrderHistory key={session.user.id} csrf={session.csrf} />
          </>
        )}
        {error && (
          <div className="portal-error" role="alert">
            {error}
            <button className="portal-link" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
      </main>
      <footer className="portal-footer">
        SHWE PYAE SAN · Thank you for shopping with us.
      </footer>
    </div>
  );
}
