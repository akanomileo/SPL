'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api, errorMessage, type OrderDirectory } from '@/lib/connected';
import { OwnerOrder, orderLabels } from './owner-order';
import { OrderPayment } from './payment-instructions';
import { money } from '@/lib/storefront';

function OrderProgress({ status }: { status: string }) {
  const steps = ['pending', 'confirmed', 'ready', 'completed'];
  const current = steps.indexOf(status);
  if (status === 'cancelled') return null;
  return (
    <ol className="order-progress" aria-label="Order progress">
      {steps.map((step, index) => (
        <li
          key={step}
          className={index <= current ? 'is-reached' : ''}
          aria-current={index === current ? 'step' : undefined}
        >
          <span>
            {index < current ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              index + 1
            )}
          </span>
          {orderLabels[step]}
        </li>
      ))}
    </ol>
  );
}

export function OrderHistory({
  owner = false,
  customerId,
  csrf,
  onChanged,
}: {
  owner?: boolean;
  customerId?: string;
  csrf: string | null;
  onChanged?: () => Promise<void>;
}) {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OrderDirectory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const query = new URLSearchParams({
          page: String(page),
          status,
          search,
        });
        if (customerId) query.set('customerId', customerId);
        const result = await api<OrderDirectory>(
          `${owner ? '/api/owner/orders' : '/api/orders'}?${query}`,
        );
        if (active) {
          setData(result);
          setError('');
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [owner, customerId, page, status, search, revision]);
  const updated = async () => {
    setRevision((value) => value + 1);
    await onChanged?.();
  };
  return (
    <section aria-label="Order history">
      <div className="management-filters">
        <label>
          Search order reference
          <input
            type="search"
            value={search}
            maxLength={100}
            placeholder="SPL-…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setData(null);
            }}
          />
        </label>
        <label>
          Filter status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setData(null);
            }}
          >
            {[
              'all',
              'receipt-review',
              'pending',
              'confirmed',
              'ready',
              'completed',
              'cancelled',
            ].map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? 'All orders'
                  : value === 'receipt-review'
                    ? 'Payments to check'
                    : orderLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="portal-secondary"
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh orders
      </button>
      {error && (
        <p className="portal-error" role="alert">
          {error}
          <button
            className="portal-link"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </p>
      )}
      {!data ? (
        <output>Loading orders…</output>
      ) : (
        <>
          <p className="portal-muted">
            {data.total} matching {data.total === 1 ? 'order' : 'orders'}
          </p>
          <div className="portal-orders">
            {data.orders.map((order) =>
              owner ? (
                <OwnerOrder
                  key={order.id}
                  order={order}
                  csrf={csrf}
                  onUpdated={updated}
                />
              ) : (
                <article className="portal-card" key={order.id}>
                  <div className="portal-order-heading">
                    <strong className="order-reference">{order.id}</strong>
                    <span className={`order-status status-${order.status}`}>
                      {orderLabels[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="portal-muted">
                    Placed {new Date(order.createdAt).toLocaleString()}
                  </p>
                  <OrderProgress status={order.status} />
                  <ul className="portal-items">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.quantity} × {item.name}
                        </span>
                        <strong>{money(item.price * item.quantity)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="order-total">
                    <span>Items total</span>
                    <strong>{money(order.total)}</strong>
                  </div>
                  <OrderPayment
                    order={order}
                    csrf={csrf}
                    onUpdated={() => setRevision((value) => value + 1)}
                  />
                  <details>
                    <summary>Delivery details & order history</summary>
                    <p>
                      {order.delivery.name}
                      <br />
                      {order.delivery.phone}
                      <br />
                      {order.delivery.address}
                    </p>
                    {order.delivery.note && <p>{order.delivery.note}</p>}
                    <ol>
                      {order.events.map((event, index) => (
                        <li key={index}>
                          {orderLabels[event.status] ?? event.status} ·{' '}
                          {new Date(event.createdAt).toLocaleString()}
                        </li>
                      ))}
                    </ol>
                  </details>
                </article>
              ),
            )}
            {!data.orders.length && (
              <p className="portal-card">No orders match this view.</p>
            )}
          </div>
          <div className="management-pagination">
            <span>
              Page {data.page} of {data.pages}
            </span>
            <div className="portal-actions">
              <button
                className="portal-secondary"
                disabled={data.page <= 1}
                onClick={() => {
                  setPage(data.page - 1);
                  setData(null);
                }}
              >
                Previous
              </button>
              <button
                className="portal-secondary"
                disabled={data.page >= data.pages}
                onClick={() => {
                  setPage(data.page + 1);
                  setData(null);
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
