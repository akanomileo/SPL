'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  FileCheck2,
  Info,
  Phone,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  money,
  requestText,
  shop,
  validateDelivery,
  createRequestId,
  type Delivery,
  type DeliveryErrors,
  type OrderRequest,
} from '@/lib/storefront';
import type { CartLine } from './shop-cart';

const emptyDelivery: Delivery = { name: '', phone: '', address: '', note: '' };

export function DownloadRequest({ text, id }: { text: string; id: string }) {
  return (
    <Button
      className="outline-button"
      variant="outline"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([text], { type: 'text/plain;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${id}.txt`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <Download size={16} /> Download
    </Button>
  );
}

export function RequestDialog({
  open,
  onOpenChange,
  items,
  onPrepared,
  storageProblem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartLine[];
  onPrepared: (request: OrderRequest) => void;
  storageProblem: boolean;
}) {
  const [step, setStep] = useState(1);
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery);
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const [payment, setPayment] = useState('Discuss with the shop');
  const [prepared, setPrepared] = useState<OrderRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  const isPreparing = useRef(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const summary = prepared ? requestText(prepared, delivery, payment) : '';
  const field = (
    name: keyof Delivery,
    label: string,
    placeholder: string,
    autoComplete?: string,
  ) => (
    <div
      className={`form-field ${name === 'address' || name === 'note' ? 'full-field' : ''}`}
    >
      <label htmlFor={`delivery-${name}`}>
        {label}
        {name !== 'note' && <span aria-hidden="true"> *</span>}
      </label>
      <Input
        id={`delivery-${name}`}
        name={name}
        type={name === 'phone' ? 'tel' : 'text'}
        autoComplete={autoComplete}
        value={delivery[name]}
        required={name !== 'note'}
        maxLength={name === 'address' || name === 'note' ? 300 : 80}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `error-${name}` : undefined}
        placeholder={placeholder}
        onChange={(event) => {
          setDelivery((previous) => ({
            ...previous,
            [name]: event.target.value,
          }));
          if (errors[name])
            setErrors((previous) => ({ ...previous, [name]: undefined }));
        }}
        className="delivery-input"
      />
      {errors[name] && (
        <span className="field-error" id={`error-${name}`} role="alert">
          {errors[name]}
        </span>
      )}
    </div>
  );
  const continueToReview = () => {
    const nextErrors = validateDelivery(delivery);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      document.getElementById(`delivery-${first}`)?.focus();
      return;
    }
    setStep(2);
  };
  const prepare = () => {
    if (isPreparing.current || !items.length) return;
    if (Object.keys(validateDelivery(delivery)).length) {
      setStep(1);
      return;
    }
    isPreparing.current = true;
    let id: string;
    try {
      id = createRequestId();
      setPrepareError(false);
    } catch {
      isPreparing.current = false;
      setPrepareError(true);
      return;
    }
    const request: OrderRequest = {
      id,
      createdAt: new Date().toISOString(),
      total,
      items: items.map(({ product, quantity }) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
      })),
    };
    setPrepared(request);
    onPrepared(request);
    setStep(3);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
      summaryRef.current?.focus();
      summaryRef.current?.select();
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="request-dialog sm:max-w-2xl">
        <div className="request-heading">
          <span className="eyebrow">ORDER REQUEST</span>
          <DialogTitle className="panel-title">
            {step === 3 ? 'Your request is ready.' : 'Let’s plan your upgrade.'}
          </DialogTitle>
          <DialogDescription>
            {step === 3
              ? 'One more step: share it with SPL to confirm your order.'
              : 'Prepare the details. Confirm directly with the shop.'}
          </DialogDescription>
          <ol className="checkout-steps" aria-label="Request progress">
            {['Your details', 'Review', 'Share with SPL'].map(
              (label, index) => (
                <li
                  className={step >= index + 1 ? 'active' : ''}
                  aria-current={step === index + 1 ? 'step' : undefined}
                  key={label}
                >
                  <span>
                    {step > index + 1 ? <Check size={12} /> : index + 1}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
        </div>
        {step === 1 && (
          <form
            className="request-body"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              continueToReview();
            }}
          >
            <h3 className="small-heading">Delivery details</h3>
            <div className="delivery-form">
              {field('name', 'Full name', 'Your full name', 'name')}
              {field('phone', 'Phone number', '09 xxx xxx xxx', 'tel')}
              {field(
                'address',
                'Delivery address',
                'Street, township and city',
                'street-address',
              )}
              {field(
                'note',
                'Delivery note (optional)',
                'Landmark or preferred time',
              )}
            </div>
            <div className="form-field payment-field">
              <label htmlFor="payment-preference">Payment preference</label>
              <select
                id="payment-preference"
                value={payment}
                onChange={(event) => setPayment(event.target.value)}
              >
                {[
                  'Discuss with the shop',
                  'KPay',
                  'Bank transfer',
                  'Cash on delivery — subject to location',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
            <p className="privacy-note">
              <Info size={15} />
              Your contact details stay in this page until you copy or download
              them. They are not saved in browser storage or sent automatically.
            </p>
            <div className="request-footer">
              <div>
                <span>Items total</span>
                <strong>{money(total)}</strong>
              </div>
              <Button
                type="submit"
                className="primary-button"
                disabled={!items.length}
              >
                Review request <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        )}
        {step === 2 && (
          <div className="request-body">
            <h3 className="small-heading">Your selection</h3>
            <div className="review-items">
              {items.map(({ product, quantity }) => (
                <div key={product.id}>
                  <span>
                    <b>{quantity} ×</b> {product.name}
                  </span>
                  <strong>{money(product.price * quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="review-delivery">
              <div>
                <h3 className="small-heading">Deliver to</h3>
                <strong>{delivery.name}</strong>
                <p>{delivery.phone}</p>
                <p>{delivery.address}</p>
                {delivery.note && <p>{delivery.note}</p>}
              </div>
              <div>
                <h3 className="small-heading">Payment preference</h3>
                <p>{payment}</p>
                <h3 className="small-heading">Delivery fee</h3>
                <p>Confirmed by SPL</p>
              </div>
            </div>
            <div className="honest-note">
              <Info size={19} />
              <p>
                <strong>This prepares a request, not a confirmed order.</strong>{' '}
                SPL will confirm availability, device condition, delivery,
                warranty and the final price. No payment is taken.
              </p>
            </div>
            {prepareError && (
              <p className="field-error" role="alert">
                Your browser could not prepare a reference. Try an updated
                browser over HTTPS, or call SPL. Your bag and delivery details
                are still here.
              </p>
            )}
            <div className="request-footer">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="back-button"
              >
                <ArrowLeft size={16} /> Back
              </Button>
              <div className="request-total">
                <span>Items total</span>
                <strong>{money(total)}</strong>
              </div>
              <Button
                className="primary-button"
                onClick={prepare}
                disabled={!items.length}
              >
                Prepare request <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}
        {step === 3 && prepared && (
          <div className="request-body">
            <div className="request-success">
              <span>
                <FileCheck2 size={28} />
              </span>
              <p>Prepared on your device</p>
              <strong>{prepared.id}</strong>
            </div>
            <div className="share-instructions">
              <b>
                Copy the request and share it with the shop using your usual
                chat app.
              </b>
              <p>
                Or call {shop.phone} to arrange your purchase. Your request has
                not been sent or accepted.
              </p>
            </div>
            <label className="summary-label" htmlFor="prepared-summary">
              Your request summary
            </label>
            <textarea
              id="prepared-summary"
              ref={summaryRef}
              className="request-summary"
              readOnly
              value={summary}
              rows={7}
            />
            <div className="share-actions">
              <Button className="primary-button" onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy request'}
              </Button>
              <DownloadRequest text={summary} id={prepared.id} />
              <a className="outline-button button-link" href={shop.phoneHref}>
                <Phone size={16} /> Call SPL
              </a>
            </div>
            {copyError && (
              <output className="field-error">
                Copy is unavailable in this browser. The summary is selected;
                copy it manually or download it.
              </output>
            )}
            <p className="helper-text">
              {storageProblem
                ? 'Browser storage is unavailable. Download this request to keep a copy.'
                : 'Copy or download this full summary before leaving. My requests saves only the reference and product list; your contact details are not stored. Your bag is kept until you remove its items.'}
            </p>
            <button
              className="text-button continue-link"
              onClick={() => onOpenChange(false)}
            >
              Continue browsing <ArrowRight size={15} />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RequestsPanel({
  open,
  onOpenChange,
  requests,
  onRemove,
  onReorder,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requests: OrderRequest[];
  onRemove: (id: string) => void;
  onReorder: (request: OrderRequest) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="requests-sheet data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="cart-header">
          <SheetTitle className="panel-title">My requests</SheetTitle>
          <SheetDescription>
            Product lists prepared on this device. History downloads omit
            delivery details. Contact SPL for order status after sharing your
            request.
          </SheetDescription>
        </SheetHeader>
        {requests.length ? (
          <div className="saved-requests">
            {requests.map((request) => (
              <article className="saved-request" key={request.id}>
                <div className="saved-request-heading">
                  <span className="request-label">
                    PREPARED · NOT SUBMITTED
                  </span>
                  <button
                    className="quiet-icon"
                    onClick={() => onRemove(request.id)}
                    aria-label={`Remove request ${request.id}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3>{request.id}</h3>
                <time dateTime={request.createdAt}>
                  {new Date(request.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
                <ul>
                  {request.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
                <strong className="saved-request-total">
                  {money(request.total)}
                </strong>
                <div className="saved-request-actions">
                  <Button
                    className="outline-button"
                    variant="outline"
                    onClick={() => onReorder(request)}
                  >
                    Add items to bag
                  </Button>
                  <DownloadRequest
                    id={request.id}
                    text={requestText(request)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <ReceiptText size={42} strokeWidth={1.3} />
            <h3>No requests yet.</h3>
            <p>Add a laptop to your bag to prepare your first request.</p>
            <Button
              className="primary-button"
              onClick={() => onOpenChange(false)}
            >
              Browse laptops <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
