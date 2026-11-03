import type { Product } from './catalog';
import type { Delivery, RequestItem } from './storefront';
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'owner';
};
export type Session = { user: User | null; csrf: string | null };
export type ManagedProduct = Product & { active: boolean; version: number };
export type PaymentMethod = {
  id: string;
  label: string;
  kind: 'bank' | 'wallet';
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  qrImage: string;
  active: boolean;
  version: number;
};
export type PaymentStatus =
  | 'awaiting_receipt'
  | 'pending_review'
  | 'confirmed'
  | 'needs_receipt'
  | 'not_required';
export type PaymentReceipt = {
  id: string;
  imageUrl: string;
  uploadedAt: string;
};
export type ConnectedOrder = {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  items: RequestItem[];
  delivery: Delivery;
  payment: string;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentReviewNote: string;
  receipt: PaymentReceipt | null;
  receipts: PaymentReceipt[];
  paymentEvents: {
    decision: string;
    note: string;
    receiptId: string | null;
    imageUrl: string | null;
    receipts: { id: string; imageUrl: string }[];
    createdAt: string;
  }[];
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  reservationExpiresAt: string | null;
  cancellationReason: string;
  version: number;
  events: { status: string; createdAt: string }[];
};
export const orderTransitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
export type OrderDirectory = {
  orders: ConnectedOrder[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  summary: {
    total: number;
    pending: number;
    paymentsToCheck: number;
    completedTotal: number;
  };
};
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string | null;
    key?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
  if (options.key) headers['Idempotency-Key'] = options.key;
  const response = await fetch(path, {
    signal: AbortSignal.timeout(20000),
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server did not return a valid response.' }));
  if (!response.ok) throw new Error(data.error ?? 'Please try again.');
  return data as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';

async function uploadImage<T>(
  path: string,
  file: File,
  csrf: string | null,
): Promise<T> {
  if (!csrf) throw new Error('Please sign in again before uploading.');
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 3 * 1024 * 1024 ||
    file.size === 0
  )
    throw new Error('Choose a JPG, PNG or WebP image, up to 3 MB.');
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrf },
    body: file,
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'Upload failed. Please try again.' }));
  if (!response.ok)
    throw new Error(data.error ?? 'Upload failed. Please try again.');
  return data as T;
}
export const uploadReceipt = (
  orderId: string,
  file: File,
  csrf: string | null,
) =>
  uploadImage<{ order: ConnectedOrder }>(
    `/api/orders/${encodeURIComponent(orderId)}/receipt-draft`,
    file,
    csrf,
  );
export const uploadOwnerImage = (file: File, csrf: string | null) =>
  uploadImage<{ image: string }>('/api/owner/images', file, csrf);

export type CustomerAccount = {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended';
  version: number;
  createdAt: string | null;
  lastLoginAt: string | null;
  orderCount: number;
  completedTotal: number;
  googleLinked: boolean;
};
export type AccountDirectory = {
  accounts: CustomerAccount[];
  counts: { total: number; active: number; suspended: number };
  total: number;
  page: number;
  pages: number;
};
export type ShopAnalytics = {
  timezone: string;
  trackingStartedDay: string;
  trackedDays: number;
  today: string;
  firstRecordedDay: string | null;
  days: number;
  daily: {
    day: string;
    visitors: number;
    pageViews: number;
    tracked: boolean;
  }[];
  totals: { visitorDays: number; pageViews: number };
  todayCounts: { day: string; visitors: number; pageViews: number };
};
