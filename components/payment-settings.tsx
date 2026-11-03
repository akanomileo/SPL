'use client';
import Image from 'next/image';
import {
  Plus,
  QrCode,
  CreditCard,
  EyeOff,
  Pencil,
  ImagePlus,
} from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, type PaymentMethod } from '@/lib/connected';
import { PaymentDetails } from './payment-instructions';
const blankMethod: PaymentMethod = {
  id: '',
  label: '',
  kind: 'bank',
  bankName: '',
  accountName: '',
  accountNumber: '',
  instructions: '',
  qrImage: '',
  active: true,
  version: 0,
};
export function PaymentSettings({
  methods,
  csrf,
  onSaved,
}: {
  methods: PaymentMethod[];
  csrf: string | null;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const field = (
    key: 'label' | 'bankName' | 'accountName' | 'accountNumber',
    label: string,
    placeholder: string,
    required = false,
  ) => (
    <label>
      {label}
      <input
        value={editing?.[key] ?? ''}
        placeholder={placeholder}
        maxLength={key === 'accountName' ? 100 : 80}
        required={required}
        onChange={(event) =>
          setEditing((previous) =>
            previous ? { ...previous, [key]: event.target.value } : previous,
          )
        }
      />
    </label>
  );
  return (
    <div className="payment-settings">
      <div className="portal-section-title">
        <div>
          <h2>Payment methods</h2>
          <p>
            Add the accounts customers can pay into. Only visible methods appear
            at checkout.
          </p>
        </div>
        <button
          className="portal-primary"
          onClick={() => {
            setEditing({ ...blankMethod });
            setNotice('');
            setError('');
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add method
        </button>
      </div>
      {notice && <output className="portal-success">{notice}</output>}
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
      <div className="inventory-layout payment-settings-layout">
        <section
          className="payment-method-list"
          aria-label="Saved payment methods"
        >
          {!methods.length && (
            <div className="portal-card portal-empty">
              <QrCode size={36} aria-hidden="true" />
              <h3>Add your payment details</h3>
              <p>
                Use your bank account or wallet, and upload its QR photo if you
                have one. Checkout becomes available once a method is visible.
              </p>
            </div>
          )}
          {methods.map((method) => (
            <article
              key={method.id}
              className={`portal-card saved-payment-method ${!method.active ? 'is-hidden' : ''}`}
            >
              <div className="portal-order-heading">
                <div className="payment-method-heading">
                  <span className="portal-icon">
                    <CreditCard size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{method.label}</h3>
                    <span
                      className={`order-status ${method.active ? 'status-confirmed' : 'status-cancelled'}`}
                    >
                      {method.active ? 'Visible at checkout' : 'Hidden'}
                    </span>
                  </div>
                </div>
                <button
                  className="portal-secondary"
                  aria-label={`Edit ${method.label}`}
                  onClick={() => {
                    setEditing({ ...method });
                    setError('');
                    setNotice('');
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edit
                </button>
              </div>
              <PaymentDetails method={method} />
              <button
                className="portal-link"
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/api/owner/payment-methods/${method.id}`, {
                      method: 'PATCH',
                      csrf,
                      body: {
                        ...method,
                        active: !method.active,
                        version: method.version,
                      },
                    });
                    setNotice(
                      method.active
                        ? 'Method hidden. Existing orders keep their payment details.'
                        : 'Method is now available at checkout.',
                    );
                    if (editing?.id === method.id) setEditing(null);
                    await onSaved();
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <EyeOff size={14} aria-hidden="true" />
                {method.active ? 'Hide from checkout' : 'Show at checkout'}
              </button>
            </article>
          ))}
        </section>
        <section className="portal-card product-editor payment-editor">
          {!editing ? (
            <>
              <span className="portal-icon">
                <QrCode size={24} aria-hidden="true" />
              </span>
              <h2>Bank and wallet details</h2>
              <p>
                Add a method to start accepting receipt uploads. You can update
                the account or QR image later.
              </p>
              <p className="portal-muted">
                Changing these details affects new orders. Customers with an
                existing order see the details saved when they ordered.
              </p>
            </>
          ) : (
            <form
              className="portal-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError('');
                try {
                  await api(
                    editing.id
                      ? `/api/owner/payment-methods/${editing.id}`
                      : '/api/owner/payment-methods',
                    {
                      method: editing.id ? 'PATCH' : 'POST',
                      csrf,
                      body: editing,
                    },
                  );
                  setEditing(null);
                  setNotice('Payment details saved.');
                  await onSaved();
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>
                {editing.id ? 'Edit payment method' : 'Add payment method'}
              </h2>
              {field('label', 'Display name', 'e.g. My KPay account', true)}
              <label>
                Method type
                <select
                  value={editing.kind}
                  onChange={(event) =>
                    setEditing((previous) =>
                      previous
                        ? {
                            ...previous,
                            kind: event.target.value as 'bank' | 'wallet',
                          }
                        : previous,
                    )
                  }
                >
                  <option value="bank">Bank transfer</option>
                  <option value="wallet">Mobile wallet</option>
                </select>
              </label>
              {field(
                'bankName',
                'Bank or wallet name',
                'e.g. KBZ Bank or KPay',
                !editing.qrImage && editing.kind === 'bank',
              )}
              {field(
                'accountName',
                'Account holder',
                'Name shown on the account',
                !editing.qrImage,
              )}
              {field(
                'accountNumber',
                editing.kind === 'wallet'
                  ? 'Wallet phone / account number'
                  : 'Account number',
                'Enter exactly as shown by your bank',
                !editing.qrImage,
              )}
              <p className="portal-muted">
                Account fields are optional when a QR photo includes the payment
                details.
              </p>
              <label>
                Payment instructions (optional)
                <textarea
                  rows={3}
                  maxLength={600}
                  placeholder="e.g. Add your order number to the transfer note."
                  value={editing.instructions}
                  onChange={(event) =>
                    setEditing((previous) =>
                      previous
                        ? { ...previous, instructions: event.target.value }
                        : previous,
                    )
                  }
                />
              </label>
              <label className="qr-upload-label">
                <ImagePlus size={20} aria-hidden="true" />
                QR photo (optional)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setError('');
                    if (
                      file.size > 3 * 1024 * 1024 ||
                      !['image/jpeg', 'image/png', 'image/webp'].includes(
                        file.type,
                      )
                    ) {
                      setError('Choose a JPG, PNG or WebP image up to 3 MB.');
                      event.target.value = '';
                      return;
                    }
                    setBusy(true);
                    try {
                      const response = await fetch('/api/owner/images', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {
                          'Content-Type': file.type,
                          'X-CSRF-Token': csrf ?? '',
                        },
                        body: file,
                      });
                      const result = await response.json();
                      if (!response.ok)
                        throw new Error(
                          result.error ?? 'Could not upload the QR photo.',
                        );
                      setEditing((previous) =>
                        previous
                          ? { ...previous, qrImage: result.image }
                          : previous,
                      );
                      setNotice(
                        'QR photo uploaded. Save the method to make it available.',
                      );
                    } catch (cause) {
                      setError(errorMessage(cause));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <small>JPG, PNG or WebP · up to 3 MB</small>
              </label>
              {editing.qrImage && (
                <div className="qr-editor-preview">
                  <Image
                    src={editing.qrImage}
                    width={220}
                    height={220}
                    unoptimized
                    alt="Payment QR preview"
                  />
                  <button
                    type="button"
                    className="portal-link"
                    onClick={() =>
                      setEditing((previous) =>
                        previous ? { ...previous, qrImage: '' } : previous,
                      )
                    }
                  >
                    Remove QR image
                  </button>
                </div>
              )}
              <label className="portal-checkbox">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(event) =>
                    setEditing((previous) =>
                      previous
                        ? { ...previous, active: event.target.checked }
                        : previous,
                    )
                  }
                />
                Visible at checkout
              </label>
              <div className="portal-actions">
                <button className="portal-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save payment method'}
                </button>
                <button
                  type="button"
                  className="portal-secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
