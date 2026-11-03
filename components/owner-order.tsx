'use client';
import Image from 'next/image';
import { CheckCircle2, Clock3, Receipt, Truck } from 'lucide-react';
import { useState } from 'react';
import {
  api,
  errorMessage,
  orderTransitions,
  type ConnectedOrder,
} from '@/lib/connected';
import { money } from '@/lib/storefront';
import { PaymentDetails, paymentLabels } from './payment-instructions';
export const orderLabels: Record<string, string> = {
  pending: 'New order',
  confirmed: 'Confirmed',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const actionLabels: Record<string, string> = {
  confirmed: 'Confirm order',
  ready: 'Mark ready',
  completed: 'Mark completed',
  cancelled: 'Cancel order',
};
export function OwnerOrder({
  order,
  csrf,
  onUpdated,
}: {
  order: ConnectedOrder;
  csrf: string | null;
  onUpdated: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const paid =
    order.paymentStatus === 'confirmed' ||
    order.paymentStatus === 'not_required';
  const review = async (decision: 'confirmed' | 'needs_receipt') => {
    if (busy) return;
    if (decision === 'needs_receipt' && note.trim().length < 5) {
      setError('Add a short note so the customer knows what to fix.');
      return;
    }
    setBusy(decision);
    setError('');
    setNotice('');
    try {
      await api(`/api/owner/orders/${order.id}/payment`, {
        method: 'POST',
        csrf,
        body: { decision, note: note.trim(), version: order.version },
      });
      setNotice(
        decision === 'confirmed'
          ? 'Payment confirmed.'
          : 'The customer was asked to check their receipts.',
      );
      setNote('');
      await onUpdated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy('');
    }
  };
  return (
    <article className="portal-card owner-order">
      <div className="portal-order-heading">
        <div>
          <span className="order-small-label">ORDER</span>
          <strong className="order-reference">{order.id}</strong>
        </div>
        <div className="order-badges">
          <span className={`order-status status-${order.status}`}>
            {orderLabels[order.status] ?? order.status}
          </span>
          <span className={`order-status payment-${order.paymentStatus}`}>
            {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
          </span>
        </div>
      </div>
      <p className="order-customer">
        {order.customerName}
        <small>
          {order.customerEmail} · {new Date(order.createdAt).toLocaleString()}
        </small>
      </p>
      {order.reservationExpiresAt && (
        <p className="portal-muted">
          Receipt deadline:{' '}
          {new Date(order.reservationExpiresAt).toLocaleString()}
        </p>
      )}
      {order.cancellationReason && (
        <p className="payment-note">{order.cancellationReason}</p>
      )}
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
      <div className="owner-order-panels">
        <section className="owner-payment-review" aria-label="Receipt review">
          <h3>
            <Receipt size={18} aria-hidden="true" />
            Payment review
          </h3>
          {order.receipts.length > 0 ? (
            <>
              <p className="receipt-count">
                {order.receipts.length}{' '}
                {order.receipts.length === 1
                  ? 'transfer receipt'
                  : 'transfer receipts'}{' '}
                · Order total {money(order.total)}
              </p>
              <div className="receipt-photo-grid owner-receipt-grid">
                {order.receipts.map((receipt, index) => (
                  <a
                    key={receipt.id}
                    className="owner-receipt-preview"
                    href={receipt.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Image
                      src={receipt.imageUrl}
                      width={360}
                      height={360}
                      unoptimized
                      alt={`Receipt ${index + 1} for order ${order.id}`}
                    />
                    <span>Open receipt {index + 1} ↗</span>
                  </a>
                ))}
              </div>
              {order.paymentStatus === 'awaiting_receipt' && (
                <p className="portal-muted">
                  The customer is preparing their receipts. Review becomes
                  available after they send the full set.
                </p>
              )}
            </>
          ) : (
            <p className="portal-muted">
              <Clock3 size={16} aria-hidden="true" />
              {order.paymentStatus === 'not_required'
                ? 'Legacy order. Arrange payment directly with the customer.'
                : 'Waiting for the customer’s receipts.'}
            </p>
          )}
          {order.paymentReviewNote && (
            <p className="receipt-review-note">
              <strong>Your note to the customer</strong>
              {order.paymentReviewNote}
            </p>
          )}
          {order.paymentStatus === 'pending_review' &&
            order.status !== 'cancelled' && (
              <div className="portal-form">
                <label>
                  Note to customer (optional when confirming)
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="If a transfer is missing or unclear, explain what to change."
                  />
                </label>
                <div className="portal-actions">
                  <button
                    className="portal-primary"
                    disabled={Boolean(busy)}
                    onClick={() => void review('confirmed')}
                  >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {busy === 'confirmed' ? 'Confirming…' : 'Confirm payment'}
                  </button>
                  <button
                    className="portal-secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void review('needs_receipt')}
                  >
                    {busy === 'needs_receipt'
                      ? 'Sending…'
                      : 'Request receipt changes'}
                  </button>
                </div>
                <p className="portal-muted">
                  Check every transfer in your bank or wallet and make sure the
                  combined amount covers the order before confirming payment.
                </p>
              </div>
            )}
          {order.paymentMethod && (
            <details>
              <summary>Payment account used</summary>
              <PaymentDetails method={order.paymentMethod} />
            </details>
          )}
        </section>
        <section className="owner-delivery-panel">
          <h3>
            <Truck size={18} aria-hidden="true" />
            Delivery
          </h3>
          <p>
            <strong>{order.delivery.name}</strong>
            <br />
            <a href={`tel:${order.delivery.phone}`}>{order.delivery.phone}</a>
            <br />
            {order.delivery.address}
          </p>
          {order.delivery.note && (
            <p className="payment-note">{order.delivery.note}</p>
          )}
          {order.paymentEvents?.length > 0 && (
            <details>
              <summary>Payment review history</summary>
              <ol className="payment-review-history">
                {order.paymentEvents.map((event, index) => (
                  <li key={index}>
                    <strong>
                      {paymentLabels[event.decision] ??
                        event.decision.replaceAll('_', ' ')}
                    </strong>
                    <small>{new Date(event.createdAt).toLocaleString()}</small>
                    {event.note && <p>{event.note}</p>}
                    <div className="receipt-history-links">
                      {event.receipts.map((receipt, receiptIndex) => (
                        <a
                          key={receipt.id}
                          href={receipt.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Receipt {receiptIndex + 1} ↗
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <details>
            <summary>Order history</summary>
            <ol>
              {order.events.map((event, i) => (
                <li key={i}>
                  {orderLabels[event.status] ??
                    event.status.replaceAll('_', ' ')}{' '}
                  · {new Date(event.createdAt).toLocaleString()}
                </li>
              ))}
            </ol>
          </details>
        </section>
      </div>
      {(orderTransitions[order.status] ?? []).length > 0 && (
        <div className="order-update">
          <div>
            <span className="order-small-label">ORDER STATUS</span>
            {order.status === 'pending' && !paid && (
              <p className="portal-muted">
                Confirm payment before confirming this order.
              </p>
            )}
          </div>
          <div className="portal-actions">
            {orderTransitions[order.status].map((status) => (
              <button
                key={status}
                className={
                  status === 'cancelled'
                    ? 'portal-secondary cancel-order'
                    : 'portal-primary'
                }
                disabled={Boolean(busy) || (status === 'confirmed' && !paid)}
                title={
                  status === 'confirmed' && !paid
                    ? 'Confirm the payment first'
                    : undefined
                }
                onClick={async () => {
                  if (busy) return;
                  if (
                    status === 'cancelled' &&
                    !window.confirm(
                      'Cancel this order and return its items to available stock? If a payment was sent, arrange its refund with the customer.',
                    )
                  )
                    return;
                  setBusy(status);
                  setError('');
                  setNotice('');
                  try {
                    await api(`/api/owner/orders/${order.id}`, {
                      method: 'PUT',
                      csrf,
                      body: { status, version: order.version },
                    });
                    setNotice('Order updated.');
                    await onUpdated();
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                {busy === status
                  ? 'Updating…'
                  : (actionLabels[status] ?? status)}
              </button>
            ))}
          </div>
        </div>
      )}
      {notice && <output className="portal-success">{notice}</output>}
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
