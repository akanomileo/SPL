'use client';
import Link from 'next/link';
import {
  Check,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AuthForm } from './auth-form';
import { OrderPayment } from './payment-instructions';
import {
  pendingCheckout,
  rememberCheckout,
  forgetCheckout,
} from '@/lib/checkout-recovery';
import type { CartLine } from './shop-cart';
import {
  api,
  errorMessage,
  type ConnectedOrder,
  type PaymentMethod,
  type Session,
} from '@/lib/connected';
import {
  createRequestId,
  money,
  validateDelivery,
  shop,
  type Delivery,
} from '@/lib/storefront';

export function Checkout({
  open,
  onOpenChange,
  items,
  onPlaced,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  items: CartLine[];
  onPlaced: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<ConnectedOrder | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({
    name: '',
    phone: '',
    address: '',
    note: '',
  });
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paymentId, setPaymentId] = useState('');
  const [methodsLoading, setMethodsLoading] = useState(true);
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const recoveryAttempted = useRef(false);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const recover = useCallback(
    async (auth: Session) => {
      if (!auth.user || auth.user.role !== 'customer' || inFlight.current)
        return;
      inFlight.current = true;
      setBusy(true);
      try {
        const pending = pendingCheckout(sessionStorage, auth.user.id);
        if (!pending) {
          setNeedsRecovery(false);
          return;
        }
        setNeedsRecovery(true);
        const result = await api<{ order: ConnectedOrder | null }>(
          '/api/orders/recover',
          {
            method: 'POST',
            csrf: auth.csrf,
            body: { key: pending },
          },
        );
        forgetCheckout(sessionStorage, auth.user.id);
        key.current = null;
        setNeedsRecovery(false);
        if (result.order) {
          setOrder(result.order);
          onPlaced();
          onOpenChange(true);
        }
        setError('');
      } catch (cause) {
        setNeedsRecovery(true);
        setError(
          `We could not check your previous checkout. ${errorMessage(cause)}`,
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [onPlaced, onOpenChange],
  );
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [auth, payments] = await Promise.all([
          api<Session>('/api/auth/session'),
          api<{ paymentMethods: PaymentMethod[] }>('/api/payment-methods'),
        ]);
        if (!active) return;
        setSession(auth);
        if (auth.user?.role === 'customer' && !recoveryAttempted.current) {
          recoveryAttempted.current = true;
          await recover(auth);
        }
        setMethods(payments.paymentMethods);
        setPaymentId((previous) =>
          payments.paymentMethods.some((method) => method.id === previous)
            ? previous
            : (payments.paymentMethods[0]?.id ?? ''),
        );
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setMethodsLoading(false);
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('spl-session-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('spl-session-changed', refresh);
    };
  }, [recover]);
  const total = items.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const selectedMethod = methods.find((method) => method.id === paymentId);
  const fields: [keyof Delivery, string, string][] = [
    ['name', 'Full name', 'name'],
    ['phone', 'Phone number', 'tel'],
    ['address', 'Delivery address', 'street-address'],
    ['note', 'Order note (optional)', 'off'],
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="connected-checkout sm:max-w-2xl">
        <div className="checkout-heading-icon">
          <ShoppingBag size={23} aria-hidden="true" />
        </div>
        <DialogTitle className="panel-title">
          {order ? 'Your order' : step === 2 ? 'One last look' : 'Checkout'}
        </DialogTitle>
        <DialogDescription>
          {order
            ? order.status === 'cancelled'
              ? 'This order was cancelled. Do not transfer money for it. Contact SPL if you already paid.'
              : order.paymentStatus === 'confirmed'
                ? 'Your payment is confirmed. Follow fulfilment in My orders.'
                : 'Pay using your selected method, then upload your receipt below.'
            : 'Add your delivery details, review your order, then send a payment receipt.'}
        </DialogDescription>
        {session?.user?.role === 'customer' && (
          <ol className="checkout-progress" aria-label="Checkout steps">
            {['Delivery', 'Review', 'Payment'].map((label, index) => (
              <li
                key={label}
                className={index + 1 <= (order ? 3 : step) ? 'is-current' : ''}
              >
                <span>
                  {index + 1 < (order ? 3 : step) ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
        )}
        {!session && (
          <output className="portal-loading">
            <span className="portal-loading-dot" />
            Loading checkout…{error}
          </output>
        )}
        {session && !session.user && (
          <AuthForm
            returnTo="/?checkout=1"
            onSignedIn={(auth) => {
              setSession(auth);
              setError('');
            }}
          />
        )}
        {session?.user?.role === 'owner' && (
          <div className="portal-form">
            <p>
              You’re signed in as the owner. Use a customer account to place an
              order.
            </p>
            <button
              className="portal-secondary"
              onClick={async () => {
                try {
                  await api('/api/auth/logout', {
                    method: 'POST',
                    csrf: session.csrf,
                  });
                  setSession({ user: null, csrf: null });
                  window.dispatchEvent(new Event('spl-session-changed'));
                } catch (cause) {
                  setError(errorMessage(cause));
                }
              }}
            >
              Sign out
            </button>
          </div>
        )}
        {session?.user?.role === 'customer' && !order && step === 1 && (
          <form
            className="portal-form"
            onSubmit={(event) => {
              event.preventDefault();
              const errors = validateDelivery(delivery);
              if (Object.keys(errors).length) {
                setError(Object.values(errors).join(' '));
                return;
              }
              if (!selectedMethod) {
                setError(
                  'Choose an available payment method before continuing.',
                );
                return;
              }
              key.current = null;
              setError('');
              setStep(2);
            }}
          >
            <p className="checkout-signed-in">
              <ShieldCheck size={16} aria-hidden="true" />
              Signed in as {session.user.name}
            </p>
            <div className="checkout-delivery-fields">
              {fields.map(([name, label, auto]) => (
                <label
                  key={name}
                  className={
                    name === 'address' || name === 'note'
                      ? 'checkout-wide-field'
                      : ''
                  }
                >
                  {label}
                  {name === 'address' || name === 'note' ? (
                    <textarea
                      rows={name === 'address' ? 2 : 1}
                      autoComplete={auto}
                      value={delivery[name]}
                      onChange={(event) =>
                        setDelivery((previous) => ({
                          ...previous,
                          [name]: event.target.value,
                        }))
                      }
                      required={name === 'address'}
                      maxLength={300}
                    />
                  ) : (
                    <input
                      type={name === 'phone' ? 'tel' : 'text'}
                      autoComplete={auto}
                      value={delivery[name]}
                      onChange={(event) =>
                        setDelivery((previous) => ({
                          ...previous,
                          [name]: event.target.value,
                        }))
                      }
                      required
                      maxLength={80}
                    />
                  )}
                </label>
              ))}
            </div>
            <fieldset className="payment-method-picker">
              <legend>How would you like to pay?</legend>
              {methodsLoading ? (
                <p>Loading payment methods…</p>
              ) : !methods.length ? (
                <div className="payment-unavailable">
                  <h3>Payment details will be available soon</h3>
                  <p>Please contact SPL for help with your purchase.</p>
                  <a href={shop.phoneHref}>Call {shop.phone} ↗</a>
                </div>
              ) : (
                methods.map((method) => (
                  <label
                    key={method.id}
                    aria-label={method.label}
                    className={`payment-method-option ${paymentId === method.id ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={method.id}
                      checked={paymentId === method.id}
                      onChange={() => {
                        setPaymentId(method.id);
                        key.current = null;
                      }}
                    />
                    <span>
                      <strong>{method.label}</strong>
                      <small>
                        {method.bankName ||
                          (method.kind === 'wallet'
                            ? 'Mobile wallet'
                            : 'Bank transfer')}
                        {method.qrImage ? ' · QR available' : ''}
                      </small>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <div className="checkout-next-total">
              <span>
                Items total<strong>{money(total)}</strong>
              </span>
              <button
                className="portal-primary"
                disabled={!items.length || !selectedMethod || methodsLoading}
              >
                Review order
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="portal-muted">
              Delivery charges are confirmed by SPL. Your delivery details are
              sent when you place the order.
            </p>
          </form>
        )}
        {session?.user?.role === 'customer' && !order && step === 2 && (
          <div className="portal-form">
            <ul className="portal-items checkout-review-items">
              {items.map(({ product, quantity }) => (
                <li key={product.id}>
                  <span>
                    {quantity} × {product.name}
                  </span>
                  <strong>{money(product.price * quantity)}</strong>
                </li>
              ))}
            </ul>
            <div className="order-total">
              <span>Items total</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="checkout-review-details">
              <section>
                <h3>Deliver to</h3>
                <p>
                  {delivery.name}
                  <br />
                  {delivery.phone}
                  <br />
                  {delivery.address}
                </p>
                {delivery.note && (
                  <p className="portal-muted">{delivery.note}</p>
                )}
              </section>
              <section>
                <h3>Payment method</h3>
                <p>
                  {selectedMethod?.label ?? 'Choose a payment method'}
                  <br />
                  <span className="portal-muted">
                    {selectedMethod?.bankName}
                  </span>
                </p>
              </section>
            </div>
            <p className="payment-note">
              Placing this order reserves your items. Pay by bank or wallet
              transfer, then upload the receipt. SPL will confirm your payment.
            </p>
            <div className="portal-actions">
              <button
                className="portal-secondary"
                disabled={busy}
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Edit details
              </button>
              <button
                className="portal-primary"
                disabled={
                  busy || needsRecovery || !items.length || !selectedMethod
                }
                onClick={async () => {
                  if (inFlight.current) return;
                  inFlight.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    if (pendingCheckout(sessionStorage, session.user!.id)) {
                      setNeedsRecovery(true);
                      throw new Error(
                        'Check your previous checkout before placing another order.',
                      );
                    }
                    key.current ??= createRequestId();
                    rememberCheckout(
                      sessionStorage,
                      session.user!.id,
                      key.current,
                    );
                    setNeedsRecovery(true);
                    const result = await api<{ order: ConnectedOrder }>(
                      '/api/orders',
                      {
                        method: 'POST',
                        csrf: session.csrf,
                        key: key.current,
                        body: {
                          items: items.map(({ product, quantity }) => ({
                            id: product.id,
                            quantity,
                            price: product.price,
                          })),
                          delivery,
                          paymentMethodId: paymentId,
                          expectedTotal: total,
                        },
                      },
                    );
                    setOrder(result.order);
                    forgetCheckout(sessionStorage, session.user!.id);
                    setNeedsRecovery(false);
                    onPlaced();
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    inFlight.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Placing order…' : 'Place order'}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {needsRecovery && session?.user?.role === 'customer' && (
          <div className="portal-form">
            <p>
              We need to check whether your previous order was received before
              you place another.
            </p>
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => void recover(session)}
            >
              {busy ? 'Checking previous order…' : 'Check previous order'}
            </button>
          </div>
        )}
        {order && (
          <div className="portal-form checkout-complete">
            <output className="portal-success">
              <Check size={18} aria-hidden="true" />
              Order received · {order.id}
            </output>
            <div className="order-total">
              <span>Items total</span>
              <strong>{money(order.total)}</strong>
            </div>
            <OrderPayment
              order={order}
              csrf={session?.csrf ?? null}
              onUpdated={setOrder}
            />
            <div className="portal-actions">
              <Link className="portal-primary" href="/account/">
                View my orders
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <button
                className="portal-secondary"
                onClick={() => onOpenChange(false)}
              >
                Continue shopping
              </button>
            </div>
            <p className="portal-muted">
              You can come back to My orders to send a receipt or check for
              updates.
            </p>
          </div>
        )}
        {error && session && (
          <p className="portal-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
