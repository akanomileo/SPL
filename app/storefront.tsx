'use client';
import Link from 'next/link';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { laptopBrandOptions } from '@/lib/brands';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  Laptop,
  MapPin,
  Phone,
  ReceiptText,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  products as seedProducts,
  type Product,
  type ProductCollection,
} from '@/lib/catalog';
import { api, errorMessage } from '@/lib/connected';
import {
  STORAGE_KEY,
  asset,
  collectionNames,
  restoreState,
  searchProducts,
  setQuantity,
  shop,
  sanitizeCart,
  type CollectionFilter,
  type SortOrder,
} from '@/lib/storefront';
import { ProductCard, ProductDetails } from '@/components/shop-product';
import { CartPanel } from '@/components/shop-cart';
import { Checkout } from '@/components/checkout';

type InfoPage = 'how' | 'delivery' | 'privacy' | 'buying' | 'contact';
const infoPages: Record<
  InfoPage,
  {
    title: string;
    intro: string;
    paragraphs: { title: string; text: string }[];
  }
> = {
  how: {
    title: 'How to order',
    intro: 'Choose a laptop, pay the shop and keep track of your order.',
    paragraphs: [
      {
        title: '1. Choose your laptop',
        text: 'Choose Brand New or Good Second, pick a brand and compare the details. Add the laptop you want to your cart.',
      },
      {
        title: '2. Place your order',
        text: 'Sign in with Google at checkout. Add your delivery details, choose a payment method and review your order before sending it to SPL.',
      },
      {
        title: '3. Pay and upload your receipt',
        text: `Use the bank or wallet details shown with your order, then upload a receipt for each transfer. SPL checks the payment and updates your order. Follow it in My orders or call ${shop.phone} if you need help.`,
      },
    ],
  },
  delivery: {
    title: 'Delivery, returns & warranty',
    intro: 'Ask us about the terms for the laptop you choose.',
    paragraphs: [
      {
        title: 'Delivery',
        text: 'Contact SPL with your township and city for delivery options, cost and estimated timing. Delivery is not included in the item subtotal displayed here.',
      },
      {
        title: 'Returns and warranty',
        text: 'Warranty and return terms may depend on the device. Ask the shop for the applicable terms and what is covered before confirming your purchase.',
      },
      {
        title: 'Payment',
        text: 'The shop lists its available payment methods, bank details and QR images at checkout. Make the transfer with your bank or wallet app and upload the receipt for SPL to check.',
      },
    ],
  },
  privacy: {
    title: 'Your information',
    intro: 'Browse without signing in. Use Google to buy and see your orders.',
    paragraphs: [
      {
        title: 'Saved on this device',
        text: 'Your cart and saved products stay in this browser. Sign in with the same Google account on another device to see your orders.',
      },
      {
        title: 'Your delivery details',
        text: 'SPL uses your name, phone, address and order notes to arrange your purchase. Your order and receipt photos are visible to you and the shop owner. Contact the shop if you need to change your details.',
      },
      {
        title: 'When you share',
        text: 'Sign out after using a shared device. Never include a bank password, PIN or card number in an order note or receipt photo.',
      },
    ],
  },
  buying: {
    title: 'Choosing a laptop',
    intro: 'Start with what you use your laptop for.',
    paragraphs: [
      {
        title: 'For everyday work',
        text: 'Compare the processor, memory and storage against the apps you use. Business laptops are a useful place to start for documents, browsing and study.',
      },
      {
        title: 'For creative projects',
        text: 'Check the exact graphics model, memory and display specifications against your software’s requirements. Workstations offer a starting point; the model details matter.',
      },
      {
        title: 'For life on the move',
        text: 'Compare screen size, weight and battery condition. Explore Ultrabook and 2-in-1 categories for portability or a flexible touchscreen.',
      },
      {
        title: 'Before you buy',
        text: 'Ask SPL for current photos, battery health, the included charger, physical condition and warranty terms for the actual unit.',
      },
    ],
  },
  contact: {
    title: 'Contact the shop',
    intro: 'Get help choosing a laptop or confirming an order.',
    paragraphs: [
      { title: 'Call the shop', text: `${shop.phone} · ${shop.city}` },
      {
        title: 'Already placed an order?',
        text: 'Sign in to My orders to see the current status. Call SPL with your order reference if you need help.',
      },
    ],
  },
};

function BrandMark() {
  return (
    <span
      className="brand-mark"
      aria-hidden="true"
      style={{ backgroundImage: `url('${asset('/spl-original-logo.png')}')` }}
    />
  );
}

let shopVisitId: string | null = null;

export default function Storefront({
  onSignOut,
  sessionError,
  signedIn,
}: {
  onSignOut: () => Promise<void>;
  sessionError: string;
  signedIn: boolean;
}) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const categories = [
    'All laptops',
    ...new Set(products.map((p) => p.category)),
  ];
  const [state, setState] = useState(() => restoreState(null, seedProducts));
  const [ready, setReady] = useState(false);
  const restoredFromCatalog = useRef(false);
  const [storageProblem, setStorageProblem] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All laptops');
  const [collection, setCollection] = useState<CollectionFilter>('all');
  const [brand, setBrand] = useState('All brands');
  const [brandSearch, setBrandSearch] = useState('');
  const [managedBrands, setManagedBrands] = useState<string[]>([]);
  const brands = laptopBrandOptions(products, managedBrands).filter((value) =>
    value.toLowerCase().includes(brandSearch.trim().toLowerCase()),
  );
  const [sort, setSort] = useState<SortOrder>('featured');
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestRun, setRequestRun] = useState(0);
  const [info, setInfo] = useState<InfoPage | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (navigator.doNotTrack === '1') return;
    shopVisitId ??= crypto.randomUUID();
    void api('/api/shop-visit', {
      method: 'POST',
      body: { viewId: shopVisitId },
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready || !catalogReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // oxlint-disable-next-line react/react-compiler -- Report an unavailable external storage system to the customer.
      setStorageProblem(true);
    }
  }, [ready, state, catalogReady]);
  useEffect(() => {
    if (notice) {
      const timeout = window.setTimeout(() => setNotice(''), 3500);
      return () => window.clearTimeout(timeout);
    }
  }, [notice]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<{ products: Product[]; brands: string[] }>(
          '/api/catalog',
        );
        if (!active) return;
        setProducts(result.products);
        setManagedBrands(result.brands);
        setBrand((previous) =>
          previous === 'All brands' ||
          laptopBrandOptions(result.products, result.brands).includes(previous)
            ? previous
            : 'All brands',
        );
        if (!restoredFromCatalog.current) {
          // Owner-added laptops are absent from seedProducts. Validate saved
          // IDs against the live catalogue before writing anything to storage.
          let restored = restoreState(null, result.products);
          try {
            restored = restoreState(
              localStorage.getItem(STORAGE_KEY),
              result.products,
            );
          } catch {
            setStorageProblem(true);
          }
          setState(restored);
          restoredFromCatalog.current = true;
          setReady(true);
        } else {
          setState((previous) => ({
            ...previous,
            cart: sanitizeCart(previous.cart, result.products),
          }));
        }
        setSelected((previous) =>
          previous
            ? (result.products.find((p) => p.id === previous.id) ?? null)
            : null,
        );
        setCatalogReady(true);
        setCatalogError('');
        const callbackUrl = new URL(window.location.href);
        if (callbackUrl.searchParams.get('checkout') === '1') {
          setCartOpen(false);
          setRequestRun((run) => run + 1);
          setRequestOpen(true);
          callbackUrl.searchParams.delete('checkout');
          window.history.replaceState(
            window.history.state,
            '',
            callbackUrl.pathname + callbackUrl.search + callbackUrl.hash,
          );
        }
      } catch (error) {
        if (active) {
          setCatalogError(errorMessage(error));
          setCatalogReady(false);
        }
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [catalogEpoch]);

  const filtered = useMemo(
    () =>
      searchProducts(products, query, category, sort, collection, brand).filter(
        (product) => !savedOnly || state.saved.includes(product.id),
      ),
    [
      query,
      category,
      sort,
      collection,
      brand,
      savedOnly,
      state.saved,
      products,
    ],
  );
  const items = products
    .filter((product) => state.cart[product.id])
    .map((product) => ({ product, quantity: state.cart[product.id] }));
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const jumpToCatalog = (
    saved = false,
    nextCollection: CollectionFilter = 'all',
  ) => {
    setSavedOnly(saved);
    setQuery('');
    setCategory('All laptops');
    setCollection(nextCollection);
    setBrand('All brands');
    document.getElementById('catalog')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  const toggleSave = (product: Product) => {
    if (!ready || !catalogReady) {
      setNotice('Please wait while we check the latest stock.');
      return;
    }
    setState((previous) => ({
      ...previous,
      saved: previous.saved.includes(product.id)
        ? previous.saved.filter((id) => id !== product.id)
        : [...previous.saved, product.id],
    }));
  };
  const add = (product: Product) => {
    if (!ready || !catalogReady) return;
    if ((state.cart[product.id] ?? 0) >= product.stock) {
      setNotice('All listed units of this laptop are already in your cart.');
      return;
    }
    setState((previous) => ({
      ...previous,
      cart: setQuantity(
        previous.cart,
        product,
        (previous.cart[product.id] ?? 0) + 1,
      ),
    }));
    setNotice(`${product.name} added to your cart.`);
  };
  const startRequest = () => {
    setCartOpen(false);
    setRequestRun((previous) => previous + 1);
    setRequestOpen(true);
  };
  const orderPlaced = useCallback(() => {
    setState((previous) => ({ ...previous, cart: {} }));
    setCatalogEpoch((previous) => previous + 1);
    setNotice('Order placed. You can follow it in My orders.');
  }, [setState, setCatalogEpoch, setNotice]);

  return (
    <>
      <a className="skip-link" href="#catalog">
        Skip to laptops
      </a>
      <div className="announcement">
        <div className="site-width">
          <span>
            <MapPin size={13} /> {shop.city}
          </span>
          <span>Brand New & Good Second laptops</span>
          <a href={shop.phoneHref}>
            <Phone size={13} />
            {shop.phone}
          </a>
        </div>
      </div>
      {(!catalogReady || catalogError) && (
        <output className="catalog-connection">
          {catalogError
            ? 'We couldn’t refresh the stock. Please try again before ordering.'
            : 'Checking the latest stock…'}
          <button onClick={() => setCatalogEpoch((previous) => previous + 1)}>
            Try again
          </button>
        </output>
      )}
      <header className="site-header">
        <div className="site-width header-inner">
          <a
            className="brand"
            href="#top"
            aria-label="SHWE PYAE SAN home"
            onClick={() => {
              setSavedOnly(false);
              setQuery('');
              setCategory('All laptops');
              setCollection('all');
              setBrand('All brands');
            }}
          >
            <BrandMark />
            <span>
              <strong>SHWE PYAE SAN</strong>
              <small>LAPTOP & MOBILE</small>
            </span>
          </a>
          <form
            className="search-box header-search"
            aria-label="Search catalogue"
            onSubmit={(event) => {
              event.preventDefault();
              document.getElementById('catalog')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            <input
              type="search"
              aria-label="Search laptops"
              placeholder="Search model, brand or specs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="quiet-icon"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="submit"
              className="search-submit"
              aria-label="Search catalogue"
            >
              <Search size={19} aria-hidden="true" />
            </button>
          </form>
          <div className="header-actions">
            {signedIn ? (
              <button className="shop-signout" onClick={() => void onSignOut()}>
                Sign out
              </button>
            ) : (
              <Link className="shop-signout" href="/account/">
                Sign in
              </Link>
            )}
            <Link
              className="header-request"
              href="/account/"
              aria-label="My orders"
            >
              <ReceiptText size={20} />
              <span>My orders</span>
            </Link>
            <Button
              className="bag-button"
              onClick={() => setCartOpen(true)}
              aria-label={`Shopping cart, ${count} items`}
            >
              <ShoppingBag size={18} />
              <span className="bag-word">Cart</span>
              <span className="bag-count">{count}</span>
            </Button>
          </div>
        </div>
        <div className="shop-navigation">
          <div className="site-width shop-navigation-inner">
            {' '}
            <nav className="desktop-nav" aria-label="Main navigation">
              <button
                className={!savedOnly && collection === 'all' ? 'active' : ''}
                onClick={() => jumpToCatalog()}
              >
                All laptops
              </button>
              {(['brand-new', 'good-second'] as ProductCollection[]).map(
                (value) => (
                  <button
                    key={value}
                    className={
                      !savedOnly && collection === value ? 'active' : ''
                    }
                    onClick={() => jumpToCatalog(false, value)}
                  >
                    {collectionNames[value]}
                  </button>
                ),
              )}
              <button
                className={savedOnly ? 'active' : ''}
                onClick={() => jumpToCatalog(true)}
              >
                Saved{' '}
                {state.saved.length > 0 && <span>{state.saved.length}</span>}
              </button>
            </nav>
            <div className="shop-nav-help">
              <button onClick={() => setInfo('how')}>How to order</button>
              <a href={shop.phoneHref}>
                <Phone size={14} aria-hidden="true" />
                {shop.phone}
              </a>
            </div>
          </div>
        </div>
      </header>
      <main id="top" className="site-width">
        {sessionError && (
          <p role="alert" className="portal-error">
            {sessionError}
          </p>
        )}
        <section className="store-heading" aria-labelledby="store-title">
          <div>
            <p className="store-breadcrumb">Home / Laptops</p>
            <h1 id="store-title">Laptop shop</h1>
            <p>Brand New & Good Second · Prices in MMK</p>
          </div>
          <button
            className="store-delivery"
            onClick={() => setInfo('delivery')}
          >
            <MapPin size={18} aria-hidden="true" />
            <span>
              Buying from {shop.city}
              <small>Check delivery & warranty</small>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
        <section
          id="catalog"
          className="catalog"
          aria-labelledby="catalog-title"
        >
          <div className="catalog-layout">
            <aside className="catalog-filters" aria-label="Product filters">
              <div className="filter-heading">
                <h2>Filters</h2>
                <button
                  onClick={() => {
                    setCollection('all');
                    setBrand('All brands');
                    setCategory('All laptops');
                    setQuery('');
                  }}
                >
                  Clear
                </button>
              </div>
              <h3>Condition</h3>
              <div
                className="collection-grid"
                aria-label="Main laptop categories"
              >
                {(['brand-new', 'good-second'] as ProductCollection[]).map(
                  (value) => {
                    const collectionProducts = products.filter(
                      (product) => product.collection === value,
                    );
                    return (
                      <button
                        key={value}
                        className={`collection-card ${collection === value ? 'selected' : ''}`}
                        aria-label={`${collectionNames[value]}: ${collectionProducts.length} laptops`}
                        aria-pressed={collection === value}
                        onClick={() => {
                          setCollection(value);
                          setBrand('All brands');
                          setCategory('All laptops');
                        }}
                      >
                        <span className="collection-copy">
                          <span className="collection-title">
                            {collectionNames[value]}
                          </span>
                        </span>
                        <span className="collection-end">
                          <span>
                            {collectionProducts.length}{' '}
                            {collectionProducts.length === 1
                              ? 'laptop'
                              : 'laptops'}
                          </span>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
              <div className="catalog-toolbar">
                <div className="brand-filter">
                  <span className="filter-label">Brand</span>
                  <input
                    className="brand-search"
                    type="search"
                    aria-label="Search brands"
                    placeholder="Find a brand"
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                  />
                  <div className="brand-pills" aria-label="Filter by brand">
                    {['All brands', ...brands].map((value) => (
                      <button
                        key={value}
                        className={brand === value ? 'selected' : ''}
                        aria-pressed={brand === value}
                        onClick={() => setBrand(value)}
                      >
                        <span>{value}</span>
                        <span className="brand-list-count" aria-hidden="true">
                          {
                            products.filter(
                              (p) =>
                                (collection === 'all' ||
                                  p.collection === collection) &&
                                (value === 'All brands' ||
                                  p.brand.toLowerCase() ===
                                    value.toLowerCase()),
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                    {!brands.length && (
                      <span className="brands-empty">
                        No matching brand. Try another name.
                      </span>
                    )}
                  </div>
                  <small className="brand-stock-note">
                    Counts show listed laptops.
                  </small>
                  <button
                    className={`all-collections ${collection === 'all' ? 'active' : ''}`}
                    aria-pressed={collection === 'all'}
                    onClick={() => {
                      setCollection('all');
                      setBrand('All brands');
                      setCategory('All laptops');
                    }}
                  >
                    All laptops <ArrowRight size={14} />
                  </button>
                </div>
                <div className="catalog-controls">
                  <label className="type-box">
                    <span>Type</span>
                    <select
                      aria-label="Laptop type"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {categories.map((value) => (
                        <option key={value} value={value}>
                          {value === 'All laptops' ? 'All types' : value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </aside>
            <div className="catalog-results">
              <div className="section-heading">
                <div>
                  <h2 id="catalog-title">
                    {savedOnly
                      ? 'Saved laptops'
                      : collection === 'all'
                        ? 'All laptops'
                        : collectionNames[collection]}
                  </h2>
                  <output className="product-count">
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'result' : 'results'}
                  </output>
                </div>
                <div className="sort-box">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  <select
                    aria-label="Sort laptops"
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as SortOrder)
                    }
                  >
                    <option value="featured">Featured</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                  </select>
                </div>
              </div>
              {savedOnly && (
                <div className="saved-banner">
                  <Heart size={16} />
                  <span>Saved in this browser.</span>
                  <button
                    className="text-button"
                    onClick={() => jumpToCatalog()}
                  >
                    Back to shop <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {storageProblem && (
                <output className="storage-warning">
                  Your browser can’t save your cart for next time. You can still
                  shop now, and your placed orders will stay in your account.
                </output>
              )}
              {filtered.length ? (
                <div
                  className="product-grid"
                  key={`${collection}:${brand}:${category}:${savedOnly}`}
                >
                  {filtered.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      saved={state.saved.includes(product.id)}
                      quantity={state.cart[product.id] ?? 0}
                      onSave={() => toggleSave(product)}
                      onSelect={() => setSelected(product)}
                      onAdd={() => add(product)}
                    />
                  ))}
                </div>
              ) : (
                <div className="catalog-empty">
                  {savedOnly ? (
                    <Heart size={38} strokeWidth={1.3} />
                  ) : (
                    <Search size={38} strokeWidth={1.3} />
                  )}
                  <h3>
                    {savedOnly && !state.saved.length
                      ? 'No saved laptops yet'
                      : collection === 'brand-new' &&
                          !products.some(
                            (product) => product.collection === 'brand-new',
                          )
                        ? 'Brand New stock isn’t listed yet'
                        : 'No laptops found'}
                  </h3>
                  <p>
                    {savedOnly && !state.saved.length
                      ? 'Tap the heart on a laptop to save it here.'
                      : collection === 'brand-new' &&
                          !products.some(
                            (product) => product.collection === 'brand-new',
                          )
                        ? 'Check back for new arrivals, or browse the Good Second laptops available now.'
                        : 'Try a different brand, clear your search or view all laptops.'}
                  </p>
                  <Button
                    variant="outline"
                    className="outline-button"
                    onClick={() => {
                      if (!state.saved.length) setSavedOnly(false);
                      setQuery('');
                      setCategory('All laptops');
                      setCollection('all');
                      setBrand('All brands');
                    }}
                  >
                    Show {savedOnly && state.saved.length ? 'saved' : 'all'}{' '}
                    laptops <ArrowRight size={16} />
                  </Button>
                </div>
              )}
              <p className="catalog-disclaimer">
                Questions about a laptop?{' '}
                <a href={shop.phoneHref}>Call {shop.phone}</a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-width footer-grid">
          <div>
            <a className="brand footer-brand" href="#top">
              <BrandMark />
              <span>
                <strong>SHWE PYAE SAN</strong>
                <small>LAPTOP & MOBILE</small>
              </span>
            </a>
            <p>
              SHWE PYAE SAN Laptop & Mobile
              <br />
              {shop.city}
            </p>
            <a className="footer-phone" href={shop.phoneHref}>
              {shop.phone} <ArrowUpRight size={15} />
            </a>
          </div>
          <div>
            <h3>Explore</h3>
            <button onClick={() => jumpToCatalog()}>All laptops</button>
            <button onClick={() => jumpToCatalog(true)}>Saved products</button>
            <button onClick={() => setInfo('buying')}>
              Choosing your laptop
            </button>
          </div>
          <div>
            <h3>Customer service</h3>
            <button onClick={() => setInfo('how')}>How to order</button>
            <button onClick={() => setInfo('delivery')}>
              Delivery & warranty
            </button>
            <button onClick={() => setInfo('contact')}>Contact the shop</button>
          </div>
          <div>
            <h3>My account</h3>
            <button onClick={() => window.location.assign('/account/')}>
              My orders
            </button>
            <button onClick={() => setInfo('privacy')}>Your information</button>
            <p className="footer-note">
              Browse freely. Sign in with Google to order.
              <br />
              Upload your receipt after paying the shop.
            </p>
          </div>
        </div>
        <div className="site-width footer-bottom">
          <span>© SHWE PYAE SAN Laptop & Mobile</span>
          <span>Brand New & Good Second</span>
        </div>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          aria-current={!savedOnly ? 'page' : undefined}
          className={!savedOnly ? 'active' : ''}
          onClick={() => jumpToCatalog()}
        >
          <Laptop size={20} />
          <span>Shop</span>
        </button>
        <button
          className={savedOnly ? 'active' : ''}
          onClick={() => jumpToCatalog(true)}
        >
          <Heart size={20} />
          <span>
            Saved{state.saved.length > 0 ? ` (${state.saved.length})` : ''}
          </span>
        </button>
        <button onClick={() => setCartOpen(true)}>
          <ShoppingBag size={20} />
          <span>Cart{count ? ` (${count})` : ''}</span>
        </button>
        <Link href="/account/" aria-label="My orders">
          <ReceiptText size={20} />
          <span>Orders</span>
        </Link>
      </nav>
      {notice && (
        <output className="shop-toast">
          <Check size={18} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={15} />
          </button>
        </output>
      )}
      <ProductDetails
        product={selected}
        quantity={selected ? (state.cart[selected.id] ?? 0) : 0}
        saved={selected ? state.saved.includes(selected.id) : false}
        onClose={() => setSelected(null)}
        onAdd={() => selected && add(selected)}
        onSave={() => selected && toggleSave(selected)}
      />
      <CartPanel
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        onQuantity={(product, quantity) =>
          setState((previous) => ({
            ...previous,
            cart: setQuantity(previous.cart, product, quantity),
          }))
        }
        onCheckout={() =>
          catalogReady
            ? startRequest()
            : setNotice('Connect to the shop before placing an order.')
        }
      />
      <Checkout
        key={requestRun}
        open={requestOpen}
        onOpenChange={setRequestOpen}
        items={items}
        onPlaced={orderPlaced}
      />
      <Dialog
        open={Boolean(info)}
        onOpenChange={(open) => !open && setInfo(null)}
      >
        <DialogContent className="info-dialog sm:max-w-xl">
          {info && (
            <>
              <span className="eyebrow">SHWE PYAE SAN</span>
              <DialogTitle className="panel-title">
                {infoPages[info].title}
              </DialogTitle>
              <DialogDescription>{infoPages[info].intro}</DialogDescription>
              <div className="info-sections">
                {infoPages[info].paragraphs.map((paragraph) => (
                  <section key={paragraph.title}>
                    <h3>{paragraph.title}</h3>
                    <p>{paragraph.text}</p>
                  </section>
                ))}
              </div>
              {info === 'contact' && (
                <a className="primary-button button-link" href={shop.phoneHref}>
                  <Phone size={17} /> Call {shop.phone}
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
