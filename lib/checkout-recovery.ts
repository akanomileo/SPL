// Only an opaque submission key is stored in this tab. Delivery details and
// receipts remain on the server; recovery always requires its customer session.
type CheckoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storageKey = (customerId: string) =>
  `spl-pending-checkout-v1:${customerId}`;

export function pendingCheckout(storage: CheckoutStorage, customerId: string) {
  const key = storage.getItem(storageKey(customerId));
  if (key === null) return null;
  if (!/^SPL-[A-F0-9-]{8,50}$/.test(key))
    throw new Error(
      'Checkout recovery data is invalid. Contact SPL before ordering again.',
    );
  return key;
}

export function rememberCheckout(
  storage: CheckoutStorage,
  customerId: string,
  key: string,
) {
  storage.setItem(storageKey(customerId), key);
}

export function forgetCheckout(storage: CheckoutStorage, customerId: string) {
  storage.removeItem(storageKey(customerId));
}
