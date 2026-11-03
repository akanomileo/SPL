'use client';
import { useEffect, useState } from 'react';
import { Search, Users, ShieldCheck, Ban, RefreshCw } from 'lucide-react';
import {
  api,
  errorMessage,
  type AccountDirectory,
  type CustomerAccount,
} from '@/lib/connected';
import { money } from '@/lib/storefront';
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Yangon',
      }).format(new Date(value))
    : 'Not recorded';
export function AccountManagement({
  csrf,
  onViewOrders,
}: {
  csrf: string | null;
  onViewOrders: (account: CustomerAccount) => void;
}) {
  const [directory, setDirectory] = useState<AccountDirectory | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState<CustomerAccount | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<AccountDirectory>(
          `/api/owner/accounts?${new URLSearchParams({ search, status, page: String(page) })}`,
        );
        if (active) {
          setDirectory(result);
          setError('');
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    };
    const first = setTimeout(() => void load(), 150);
    const timer = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [search, status, page, revision]);
  const changeStatus = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/owner/accounts/${target.id}`, {
        method: 'PUT',
        csrf,
        body: {
          status: target.status === 'active' ? 'suspended' : 'active',
          version: target.version,
        },
      });
      setNotice(
        target.status === 'active'
          ? `${target.name}'s shop access is suspended.`
          : `${target.name}'s shop access is restored. They can sign in again with Google.`,
      );
      setTarget(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
      setRevision((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-management">
      <div className="management-intro">
        <div>
          <h2>Registered customers</h2>
          <p>Google accounts that have signed in to your shop.</p>
        </div>
        <button
          className="portal-secondary"
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh accounts
        </button>
      </div>
      <div className="portal-stats management-stats">
        <article>
          <span>
            <Users size={15} aria-hidden="true" />
            Customers
          </span>
          <strong>{directory?.counts.total ?? '—'}</strong>
        </article>
        <article>
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            Active
          </span>
          <strong>{directory?.counts.active ?? '—'}</strong>
        </article>
        <article>
          <span>
            <Ban size={15} aria-hidden="true" />
            Suspended
          </span>
          <strong>{directory?.counts.suspended ?? '—'}</strong>
        </article>
      </div>
      <div className="management-filters">
        <label>
          <span>Search customers</span>
          <div className="management-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Name or email address"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </label>
        <label>
          Account status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="portal-success">{notice}</output>}
      {target && (
        <section
          className="account-confirm"
          aria-label="Confirm account change"
        >
          <h3>
            {target.status === 'active'
              ? 'Suspend shop access?'
              : 'Restore shop access?'}
          </h3>
          <p>
            <strong>{target.name}</strong> · {target.email}
          </p>
          <p>
            {target.status === 'active'
              ? 'This signs the customer out and blocks Google sign-in to SPL. Their orders and receipts stay available to you. This does not change their Google account.'
              : 'The customer can sign in to SPL again with the same Google account. Their existing orders remain attached.'}
          </p>
          <div className="portal-actions">
            <button
              className={
                target.status === 'active' ? 'portal-danger' : 'portal-primary'
              }
              disabled={busy}
              onClick={() => void changeStatus()}
            >
              {busy
                ? 'Saving…'
                : target.status === 'active'
                  ? 'Confirm suspension'
                  : 'Restore access'}
            </button>
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {!directory ? (
        <output>Loading customer accounts…</output>
      ) : (
        <>
          <div className="management-table-wrap">
            <table className="management-table">
              <caption>Customer accounts · {directory.total} results</caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Access</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Last Google sign-in</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {directory.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      <span>{account.email}</span>
                      <small>
                        Joined: {date(account.createdAt)} ·{' '}
                        {account.googleLinked
                          ? 'Google linked'
                          : 'Legacy account'}
                      </small>
                    </td>
                    <td>
                      <span className={`account-status ${account.status}`}>
                        {account.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="management-link"
                        onClick={() => onViewOrders(account)}
                      >
                        {account.orderCount}{' '}
                        {account.orderCount === 1 ? 'order' : 'orders'}
                      </button>
                      <small>{money(account.completedTotal)} completed</small>
                    </td>
                    <td>{date(account.lastLoginAt)}</td>
                    <td>
                      <button
                        className="portal-secondary"
                        disabled={busy}
                        aria-label={`${account.status === 'active' ? 'Suspend' : 'Restore'} ${account.email}`}
                        onClick={() => {
                          setTarget(account);
                          setNotice('');
                        }}
                      >
                        {account.status === 'active' ? 'Suspend' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!directory.accounts.length && (
            <p className="management-empty">
              {search || status !== 'all'
                ? 'No customers match these filters.'
                : 'Customer accounts appear after their first Google sign-in. Guests can still browse without an account.'}
            </p>
          )}
          <div className="management-pagination">
            <span>
              Page {directory.page} of {directory.pages}
            </span>
            <div className="portal-actions">
              <button
                className="portal-secondary"
                disabled={directory.page <= 1}
                onClick={() => setPage(directory.page - 1)}
              >
                Previous
              </button>
              <button
                className="portal-secondary"
                disabled={directory.page >= directory.pages}
                onClick={() => setPage(directory.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <p className="management-note">
        Only customer shop access can be changed here. Your owner account and
        Google identity stay protected.
      </p>
    </section>
  );
}
