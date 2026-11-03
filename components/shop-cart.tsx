'use client';

import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import type { Product } from '@/lib/catalog';
import { money } from '@/lib/storefront';
import { ProductImage } from './shop-product';

export type CartLine = { product: Product; quantity: number };
export function CartPanel({
  open,
  onOpenChange,
  items,
  onQuantity,
  onCheckout,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  items: CartLine[];
  onQuantity: (product: Product, quantity: number) => void;
  onCheckout: () => void;
}) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="cart-sheet data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="cart-header">
          <SheetTitle className="panel-title">
            Shopping cart <span>{count}</span>
          </SheetTitle>
          <SheetDescription>
            Review your laptops before checkout.
          </SheetDescription>
        </SheetHeader>
        {items.length > 0 ? (
          <>
            <div className="cart-lines">
              {items.map(({ product, quantity }) => (
                <div className="cart-line" key={product.id}>
                  <div className="cart-photo">
                    <ProductImage product={product} />
                  </div>
                  <div className="cart-line-copy">
                    <div className="cart-line-title">
                      <h3>{product.name}</h3>
                      <button
                        className="quiet-icon"
                        aria-label={`Remove ${product.name}`}
                        onClick={() => onQuantity(product, 0)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p>{money(product.price)} each</p>
                    <div className="cart-line-controls">
                      <div className="quantity-control">
                        <button
                          aria-label={`Decrease ${product.name} quantity`}
                          onClick={() => onQuantity(product, quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span aria-label="Quantity" aria-live="polite">
                          {quantity}
                        </span>
                        <button
                          disabled={quantity >= product.stock}
                          aria-label={`Increase ${product.name} quantity`}
                          onClick={() => onQuantity(product, quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong>{money(product.price * quantity)}</strong>
                    </div>
                    {quantity >= product.stock && (
                      <span className="stock-limit">
                        All listed units are in your cart.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <SheetFooter className="cart-footer">
              <div className="total-row">
                <span>Items total</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="delivery-row">
                <span>Delivery</span>
                <span>Confirmed by the shop</span>
              </div>
              <Button onClick={onCheckout} className="primary-button wide">
                Proceed to checkout <ArrowRight size={17} />
              </Button>
              <p className="helper-text">
                Choose a payment method at checkout. After paying the shop,
                upload your receipt for confirmation.
              </p>
            </SheetFooter>
          </>
        ) : (
          <div className="panel-empty">
            <ShoppingBag size={42} strokeWidth={1.3} />
            <h3>Your cart is empty</h3>
            <p>Add a laptop to get started.</p>
            <Button
              className="primary-button"
              onClick={() => onOpenChange(false)}
            >
              Shop laptops <ArrowRight size={17} />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
