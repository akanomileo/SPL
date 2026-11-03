'use client';
import Image from 'next/image';
import { Check, Copy, ImagePlus, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  api,
  errorMessage,
  uploadReceipt,
  type ConnectedOrder,
  type PaymentMethod,
} from '@/lib/connected';
import { money } from '@/lib/storefront';

export const paymentLabels: Record<string, string> = {
  awaiting_receipt: 'Receipts to send',
  pending_review: 'Receipts under review',
  confirmed: 'Payment confirmed',
  needs_receipt: 'Check your receipts',
  not_required: 'Arrange with the shop',
};

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="copy-value">
      <span className="copy-selectable">{value}</span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
        <small>{copied ? 'Copied' : 'Copy'}</small>
      </button>
      {failed && (
        <small className="copy-failure">
          Copy unavailable. Select the number to copy.
        </small>
      )}
    </div>
  );
}

export function PaymentDetails({
  method,
  total,
}: {
  method: Pick<
    PaymentMethod,
    | 'label'
    | 'bankName'
    | 'accountName'
    | 'accountNumber'
    | 'instructions'
    | 'qrImage'
  >;
  total?: number;
}) {
  return (
    <div className="payment-details">
      {method.qrImage && (
        <a
          className="payment-qr"
          href={method.qrImage}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${method.label} QR image`}
        >
          <Image
            src={method.qrImage}
            width={220}
            height={220}
            unoptimized
            alt={`${method.label} payment QR`}
          />
          <span>Open QR image ↗</span>
        </a>
      )}
      <div className="payment-bank-details">
        <h3>{method.label}</h3>
        {method.bankName && (
          <p className="payment-bank-name">{method.bankName}</p>
        )}
        <dl>
          {method.accountName && (
            <div>
              <dt>Account name</dt>
              <dd>{method.accountName}</dd>
            </div>
          )}
          {method.accountNumber && (
            <div>
              <dt>Account number</dt>
              <dd>
                <CopyValue
                  value={method.accountNumber}
                  label="account number"
                />
              </dd>
            </div>
          )}
          {total !== undefined && (
            <div>
              <dt>Items total</dt>
              <dd>
                <CopyValue value={String(total)} label="items total" />
                <strong className="payment-formatted-total">
                  {money(total)}
                </strong>
              </dd>
            </div>
          )}
        </dl>
        {method.instructions && (
          <p className="payment-note">{method.instructions}</p>
        )}
      </div>
    </div>
  );
}

function SelectedReceipt({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // oxlint-disable-next-line react/react-compiler -- Revoke each photo's blob URL when removed or unmounted.
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="receipt-photo">
      {preview && (
        <Image
          src={preview}
          width={240}
          height={240}
          unoptimized
          alt={`Selected receipt: ${file.name}`}
        />
      )}
      <span className="receipt-photo-caption">{file.name}</span>
      <button
        type="button"
        className="receipt-remove"
        disabled={disabled}
        aria-label={`Remove selected receipt ${file.name}`}
        onClick={onRemove}
      >
        <X size={15} aria-hidden="true" />
        Remove
      </button>
    </div>
  );
}

export function ReceiptUpload({
  order,
  csrf,
  onUpdated,
}: {
  order: ConnectedOrder;
  csrf: string | null;
  onUpdated: (order: ConnectedOrder) => void;
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const canUpload =
    !['cancelled', 'completed'].includes(order.status) &&
    ['awaiting_receipt', 'needs_receipt', 'pending_review'].includes(
      order.paymentStatus,
    );
  const count = order.receipts.length + files.length;
  const canSend =
    files.length > 0 ||
    (order.receipts.length > 0 && order.paymentStatus !== 'pending_review');
  return (
    <div className="receipt-section">
      {order.paymentReviewNote && (
        <p className="receipt-review-note">
          <strong>Note from SPL</strong>
          {order.paymentReviewNote}
        </p>
      )}
      {order.receipts.length > 0 && (
        <>
          <h4>
            {order.receipts.length}{' '}
            {order.receipts.length === 1
              ? 'receipt attached'
              : 'receipts attached'}
          </h4>
          <div className="receipt-photo-grid">
            {order.receipts.map((receipt, index) => (
              <div className="receipt-photo" key={receipt.id}>
                <a href={receipt.imageUrl} target="_blank" rel="noreferrer">
                  <Image
                    src={receipt.imageUrl}
                    width={240}
                    height={240}
                    unoptimized
                    alt={`Uploaded receipt ${index + 1}`}
                  />
                  <span className="receipt-photo-caption">
                    Receipt {index + 1} ↗
                  </span>
                </a>
                {canUpload && (
                  <button
                    type="button"
                    className="receipt-remove"
                    disabled={busy}
                    aria-label={`Remove uploaded receipt ${index + 1}`}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        const result = await api<{ order: ConnectedOrder }>(
                          receipt.imageUrl,
                          {
                            method: 'DELETE',
                            csrf,
                            body: { version: order.version },
                          },
                        );
                        onUpdated(result.order);
                      } catch (cause) {
                        setError(errorMessage(cause));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <X size={15} aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {canUpload && (
        <form
          className="portal-form receipt-upload"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSend || busy) return;
            setBusy(true);
            setError('');
            let latest = order;
            try {
              for (let index = 0; index < files.length; index++) {
                const selected = files[index];
                setProgress(
                  `Uploading receipt ${index + 1} of ${files.length}…`,
                );
                const result = await uploadReceipt(
                  order.id,
                  selected.file,
                  csrf,
                );
                latest = result.order;
                onUpdated(latest);
                // Successful photos remain attached if a later upload fails. Retry only the remaining photos.
                setFiles((current) =>
                  current.filter((item) => item.id !== selected.id),
                );
              }
              setProgress('Sending receipts for review…');
              const result = await api<{ order: ConnectedOrder }>(
                `/api/orders/${order.id}/receipts/submit`,
                {
                  method: 'POST',
                  csrf,
                  body: { version: latest.version },
                },
              );
              onUpdated(result.order);
            } catch (cause) {
              setError(errorMessage(cause));
            } finally {
              setBusy(false);
              setProgress('');
            }
          }}
        >
          <p className="split-payment-help">
            Paying in several transfers? Add a receipt for each transfer, then
            send them together. The amounts should cover your full order.
          </p>
          {order.paymentMethod?.kind === 'wallet' && (
            <p className="portal-muted">
              For a 1,000,000 Ks transfer limit, you can split a 2,700,000 Ks
              payment into 1,000,000 + 1,000,000 + 700,000 Ks and attach all
              three receipts.
            </p>
          )}
          <label className="receipt-picker">
            <ImagePlus size={22} aria-hidden="true" />
            <span>
              {count > 0 ? 'Add more receipt photos' : 'Choose receipt photos'}
              <small>
                Choose several photos · JPG, PNG or WebP · 3 MB each · up to 20
                receipts
              </small>
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || count >= 20}
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (!picked.length) return;
                setError('');
                if (
                  picked.some(
                    (file) =>
                      !['image/jpeg', 'image/png', 'image/webp'].includes(
                        file.type,
                      ) ||
                      file.size === 0 ||
                      file.size > 3 * 1024 * 1024,
                  )
                ) {
                  setError('Choose JPG, PNG or WebP photos up to 3 MB each.');
                  return;
                }
                const additions = picked.filter(
                  (file) =>
                    !files.some(
                      (item) =>
                        item.file.name === file.name &&
                        item.file.size === file.size &&
                        item.file.lastModified === file.lastModified,
                    ),
                );
                if (count + additions.length > 20) {
                  setError('You can attach up to 20 receipts to one order.');
                  return;
                }
                setFiles((current) => [
                  ...current,
                  ...additions.map((file) => ({
                    id: crypto.randomUUID(),
                    file,
                  })),
                ]);
              }}
            />
          </label>
          {files.length > 0 && (
            <div className="receipt-photo-grid">
              {files.map((item) => (
                <SelectedReceipt
                  key={item.id}
                  file={item.file}
                  disabled={busy}
                  onRemove={() =>
                    setFiles((current) =>
                      current.filter((selected) => selected.id !== item.id),
                    )
                  }
                />
              ))}
            </div>
          )}
          <button className="portal-primary" disabled={!canSend || busy}>
            <Upload size={16} aria-hidden="true" />
            {busy
              ? progress || 'Updating receipts…'
              : `Send ${count || ''} ${count === 1 ? 'receipt' : 'receipts'} to SPL`}
          </button>
          {busy && (
            <output className="portal-muted">
              {progress || 'Updating receipts…'}
            </output>
          )}
          <p className="portal-muted">
            Include the amount and transaction reference in every photo. Adding
            or removing a receipt pauses the review until you send the set
            again.
          </p>
        </form>
      )}
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function OrderPayment({
  order,
  csrf,
  onUpdated,
}: {
  order: ConnectedOrder;
  csrf: string | null;
  onUpdated: (order: ConnectedOrder) => void;
}) {
  return (
    <section className="order-payment" aria-label="Payment details">
      <div className="portal-order-heading">
        <h3>Payment</h3>
        <span className={`order-status payment-${order.paymentStatus}`}>
          {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
        </span>
      </div>
      {order.status === 'cancelled' ? (
        <p>
          This order was cancelled. {order.cancellationReason} Do not transfer
          money for this order. Contact SPL if you already sent a payment.
        </p>
      ) : order.paymentMethod ? (
        <>
          {order.reservationExpiresAt && (
            <p className="payment-note">
              Upload a receipt before{' '}
              {new Date(order.reservationExpiresAt).toLocaleString()} to keep
              your stock reservation. If you have transferred money and cannot
              upload a receipt, contact SPL before this deadline.
            </p>
          )}
          {order.paymentStatus === 'awaiting_receipt' ||
          order.paymentStatus === 'needs_receipt' ? (
            <p>
              Pay using the details below, then send all your receipts. Include
              your order number in the transfer note where possible.
            </p>
          ) : order.paymentStatus === 'pending_review' ? (
            <p>
              Receipts received. SPL will check all transfers and update your
              payment status here.
            </p>
          ) : order.paymentStatus === 'confirmed' ? (
            <p>
              SPL has confirmed your payment. Your order status is shown above.
            </p>
          ) : null}
          <details
            className="payment-snapshot"
            open={
              order.paymentStatus === 'awaiting_receipt' ||
              order.paymentStatus === 'needs_receipt'
            }
          >
            <summary>Bank / wallet details</summary>
            <PaymentDetails method={order.paymentMethod} total={order.total} />
            <p className="portal-muted">
              Items total excludes delivery. Confirm any delivery charge with
              SPL before transferring.
            </p>
          </details>
          <ReceiptUpload order={order} csrf={csrf} onUpdated={onUpdated} />
        </>
      ) : (
        <p>Contact SPL to arrange payment for this order.</p>
      )}
    </section>
  );
}
