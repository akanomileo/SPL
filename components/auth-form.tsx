'use client';
import { GoogleAccount } from './google-account';
import type { Session } from '@/lib/connected';
export function AuthForm({
  owner = false,
  returnTo = '/account/',
}: {
  owner?: boolean;
  returnTo?: string;
  onSignedIn?: (session: Session) => void;
}) {
  return (
    <section className="auth-card google-only-card">
      <span className="eyebrow">
        {owner ? 'OWNER SIGN-IN' : 'WELCOME TO SPL'}
      </span>
      <h2>{owner ? 'Sign in to your shop' : 'Continue with Google'}</h2>
      <p>
        {owner
          ? 'Sign in with your shop’s Google account to manage orders and products.'
          : 'Sign in to place an order, send your receipt, and check for updates.'}
      </p>
      <GoogleAccount owner={owner} returnTo={returnTo} />
      <p className="auth-footnote">
        New here? Your account is created the first time you sign in. Come back
        with the same Google account next time.
      </p>
    </section>
  );
}
