'use client';

import {
  Heart,
  ArrowUpRight,
  Plus,
  Check,
  Laptop,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { productPhotos, type Product } from '@/lib/catalog';
import { asset, collectionNames, money } from '@/lib/storefront';

export function ProductImage({
  product,
  priority = false,
  className = '',
  image = product.image,
  alt = product.name,
}: {
  product: Product;
  priority?: boolean;
  className?: string;
  image?: string;
  alt?: string;
}) {
  const [failedImage, setFailedImage] = useState('');
  return failedImage === image ? (
    <span className={`image-fallback ${className}`}>
      <Laptop aria-hidden="true" />
      <span>Photo unavailable</span>
    </span>
  ) : (
    // Product images are bundled static assets, with fixed containers to prevent layout shift.
    // oxlint-disable-next-line next/no-img-element -- Local static images need no server optimizer.
    <img
      src={asset(image)}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailedImage(image)}
      className={className}
    />
  );
}

export function ProductCard({
  product,
  saved,
  quantity,
  onSave,
  onSelect,
  onAdd,
}: {
  product: Product;
  saved: boolean;
  quantity: number;
  onSave: () => void;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const full = quantity >= product.stock;
  return (
    <article className="product-card">
      <div className="product-visual">
        <span className="product-category">
          {collectionNames[product.collection]}
        </span>
        <button
          className={`save-button ${saved ? 'is-saved' : ''}`}
          aria-label={`${saved ? 'Unsave' : 'Save'} ${product.name}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
        <button
          className="product-image-button"
          onClick={onSelect}
          aria-label={`View ${product.name}`}
        >
          <ProductImage product={product} />
        </button>
        <button className="quick-view" onClick={onSelect}>
          View details <ArrowUpRight size={14} />
        </button>
        {productPhotos(product).length > 1 && (
          <span className="product-photo-count">
            {productPhotos(product).length} photos
          </span>
        )}
      </div>
      <div className="product-copy">
        <div className="product-labels">
          <span className="product-brand">{product.brand}</span>
          <p className="condition">{product.condition}</p>
        </div>
        <button className="product-title-button" onClick={onSelect}>
          <h3>{product.name}</h3>
        </button>
        <p className="product-subtitle">{product.subtitle}</p>
        <div className="product-bottom">
          <div>
            <p className="price">{money(product.price)}</p>
            {product.oldPrice && (
              <del className="old-price">{money(product.oldPrice)}</del>
            )}
          </div>
        </div>
        <p className="stock-line">
          <Package size={12} />{' '}
          {product.stock > 0
            ? `${product.stock} in stock`
            : 'Currently unavailable'}
          {quantity > 0 && <span>{quantity} in your cart</span>}
        </p>
        <Button
          onClick={onAdd}
          disabled={full || product.stock <= 0}
          className="add-button"
          aria-label={
            full
              ? `Stock limit reached for ${product.name}`
              : `Add ${product.name} to cart`
          }
        >
          {full ? <Check size={16} /> : <Plus size={16} />}
          <span>
            {product.stock <= 0
              ? 'Out of stock'
              : full
                ? 'In your cart'
                : 'Add to cart'}
          </span>
        </Button>
      </div>
    </article>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const photos = productPhotos(product);
  const [selected, setSelected] = useState('');
  const current = photos.includes(selected) ? selected : photos[0];
  const index = photos.indexOf(current);
  const next = (direction: number) =>
    setSelected(photos[(index + direction + photos.length) % photos.length]);
  const onArrowKey = (event: KeyboardEvent<HTMLElement>) => {
    if (photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      next(event.key === 'ArrowLeft' ? -1 : 1);
    }
  };
  return (
    <section
      className="product-gallery"
      aria-label={`Photos of ${product.name}`}
    >
      <div className="gallery-main">
        <a
          href={asset(current)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open photo ${index + 1} full size`}
          onKeyDown={onArrowKey}
        >
          <ProductImage
            key={current}
            product={product}
            image={current}
            alt={`${product.name}, photo ${index + 1} of ${photos.length}`}
            priority
          />
        </a>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-arrow gallery-previous"
              aria-label="Previous laptop photo"
              onKeyDown={onArrowKey}
              onClick={() => next(-1)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="gallery-arrow gallery-next"
              aria-label="Next laptop photo"
              onKeyDown={onArrowKey}
              onClick={() => next(1)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <div className="gallery-meta">
        <output aria-live="polite">
          Photo {index + 1} of {photos.length}
        </output>
        <span>Tap photo to open full size ↗</span>
      </div>
      {photos.length > 1 && (
        <div className="gallery-thumbnails">
          {photos.map((image, photoIndex) => (
            <button
              type="button"
              key={image}
              aria-label={`View laptop photo ${photoIndex + 1}`}
              onKeyDown={onArrowKey}
              aria-pressed={current === image}
              onClick={() => setSelected(image)}
            >
              <ProductImage
                product={product}
                image={image}
                alt={`${product.name} thumbnail ${photoIndex + 1}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductDetails({
  product,
  quantity,
  saved,
  onClose,
  onAdd,
  onSave,
}: {
  product: Product | null;
  quantity: number;
  saved: boolean;
  onClose: () => void;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="product-dialog sm:max-w-4xl">
        {product && (
          <div className="detail-grid">
            <div className="detail-photo">
              <span className="eyebrow">
                {collectionNames[product.collection]} · {product.brand}
              </span>
              <ProductGallery key={product.id} product={product} />
            </div>
            <div className="detail-copy">
              <p className="condition">{product.condition}</p>
              <DialogTitle className="detail-title">{product.name}</DialogTitle>
              <DialogDescription className="detail-description">
                {product.subtitle}
              </DialogDescription>
              <div className="detail-price">
                <strong>{money(product.price)}</strong>
                {product.oldPrice && <del>{money(product.oldPrice)}</del>}
              </div>
              <h3 className="small-heading">Specifications</h3>
              <ul className="spec-list">
                {product.specs.map((spec) => (
                  <li key={spec}>
                    <Check size={15} />
                    {spec}
                  </li>
                ))}
              </ul>
              <div className="detail-note">
                <Package size={20} />
                <p>
                  <strong>{product.stock} in stock</strong>
                  <span>
                    Questions about this laptop or its warranty? Call SPL before
                    you order.
                  </span>
                </p>
              </div>
              <div className="detail-actions">
                <Button
                  onClick={onAdd}
                  disabled={quantity >= product.stock}
                  className="primary-button"
                >
                  {quantity >= product.stock
                    ? 'Stock limit reached'
                    : 'Add to cart'}{' '}
                  <Plus size={17} />
                </Button>
                <Button
                  variant="outline"
                  onClick={onSave}
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove from saved' : 'Save this laptop'}
                  className="outline-button"
                >
                  <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
