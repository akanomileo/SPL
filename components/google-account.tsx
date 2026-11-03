'use client';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/connected';
type Config = {
  enabled: boolean;
  ownerEnabled: boolean;
  ownerSetupRequired: boolean;
};
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.01v2.5h3.23c1.89-1.74 2.98-4.31 2.98-7.34Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.73 9.4 5.97 12 5.97Z"
      />
    </svg>
  );
}
export function GoogleAccount({
  owner = false,
  returnTo = '/account/',
}: {
  owner?: boolean;
  returnTo?: string;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupCode, setSetupCode] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = await api<Config>('/api/auth/google/config');
        if (!active) return;
        setConfig(value);
        const message = new URLSearchParams(window.location.search).get(
          'authError',
        );
        if (message) {
          setError(message.slice(0, 500));
          const clean = new URL(window.location.href);
          clean.searchParams.delete('authError');
          window.history.replaceState(
            window.history.state,
            '',
            clean.pathname + clean.search + clean.hash,
          );
        }
      } catch (e) {
        if (active) {
          setConfig({
            enabled: false,
            ownerEnabled: false,
            ownerSetupRequired: false,
          });
          setError(errorMessage(e));
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const enabled = config?.enabled && (!owner || config.ownerEnabled);
  const setup = owner && config?.ownerSetupRequired && enabled;
  return (
    <div className="google-account">
      {setup ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const result = await api<{ url: string }>(
                '/api/auth/google/start',
                { method: 'POST', body: { audience: 'owner', setupCode } },
              );
              setSetupCode('');
              window.location.assign(result.url);
            } catch (e) {
              setError(errorMessage(e));
              setBusy(false);
            }
          }}
        >
          <p>
            Enter the private setup code, then choose the Google account you
            want to use as the only owner. You only need this code once.
          </p>
          <label>
            Private owner setup code
            <input
              type="password"
              value={setupCode}
              onChange={(event) => setSetupCode(event.target.value)}
              autoComplete="off"
              required
              maxLength={200}
            />
          </label>
          <button className="portal-secondary google-signin" disabled={busy}>
            <GoogleMark />
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
        </form>
      ) : enabled ? (
        <a
          className="portal-secondary google-signin"
          href={`/api/auth/google/start?audience=${owner ? 'owner' : 'customer'}&returnTo=${encodeURIComponent(returnTo)}`}
        >
          <GoogleMark />
          Continue with Google
        </a>
      ) : (
        <>
          <button className="portal-secondary google-signin" disabled>
            {config
              ? 'Google sign-in unavailable'
              : 'Connecting to Google sign-in…'}
          </button>
          {config && (
            <small>
              {owner
                ? 'The shop administrator needs to complete owner sign-in setup.'
                : 'Google sign-in has not been configured by the shop yet.'}
            </small>
          )}
        </>
      )}
      {enabled && !setup && (
        <small>
          {owner
            ? 'Only your shop’s owner account can open this dashboard.'
            : 'Use your Gmail or Google Workspace account.'}
        </small>
      )}
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
    </div>
  );
}
