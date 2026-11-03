'use client';
import Link from 'next/link';
import { ProductImage } from '@/components/shop-product';
import { ProductPhotos } from '@/components/product-photos';
import { productPhotos } from '@/lib/catalog';
import { OrderHistory } from '@/components/order-history';
import { AccountManagement } from '@/components/account-management';
import { VisitorAnalytics } from '@/components/shop-analytics';
import { laptopBrandOptions } from '@/lib/brands';
import { BrandManagement } from '@/components/brand-management';
import { PaymentSettings } from '@/components/payment-settings';
import {
  ArrowUpRight,
  RefreshCw,
  LogOut,
  ShoppingBag,
  Package,
  CreditCard,
  Plus,
  Users,
  BarChart3,
  Tags,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AuthForm } from '@/components/auth-form';
import {
  api,
  errorMessage,
  type OrderDirectory,
  type ManagedProduct,
  type PaymentMethod,
  type Session,
  type CustomerAccount,
} from '@/lib/connected';
import { money } from '@/lib/storefront';
const blank: ManagedProduct = {
  id: 0,
  name: '',
  subtitle: '',
  category: 'Laptop',
  collection: 'good-second',
  brand: '',
  condition: '',
  price: 0,
  stock: 0,
  image: '',
  images: [],
  specs: [''],
  active: true,
  version: 0,
};
export default function Owner() {
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderDirectory['summary']>({
    total: 0,
    pending: 0,
    paymentsToCheck: 0,
    completedTotal: 0,
  });
  const [tab, setTab] = useState<
    'orders' | 'products' | 'payments' | 'accounts' | 'analytics' | 'brands'
  >('orders');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [editing, setEditing] = useState<ManagedProduct | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customerFilter, setCustomerFilter] = useState<CustomerAccount | null>(
    null,
  );
  const refresh = useCallback(async () => {
    try {
      const auth = await api<Session>('/api/auth/session');
      setSession(auth);
      if (auth.user?.role === 'owner') {
        const [catalog, received, payments] = await Promise.all([
          api<{ products: ManagedProduct[]; brands: string[] }>(
            '/api/owner/products',
          ),
          api<OrderDirectory>('/api/owner/orders'),
          api<{ paymentMethods: PaymentMethod[] }>(
            '/api/owner/payment-methods',
          ),
        ]);
        setProducts(catalog.products);
        setBrands(catalog.brands);
        setOrderSummary(received.summary);
        setPaymentMethods(payments.paymentMethods);
      }
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Refresh awaits server responses before setting state.
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', csrf: session?.csrf });
      setSession({ user: null, csrf: null });
      setProducts([]);
      setBrands([]);
      setOrderSummary({
        total: 0,
        pending: 0,
        paymentsToCheck: 0,
        completedTotal: 0,
      });
      setPaymentMethods([]);
      setEditing(null);
      setCustomerFilter(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const field = (
    key: 'name' | 'subtitle' | 'category' | 'condition' | 'brand',
    label: string,
    max: number,
  ) => (
    <label key={key}>
      {label}
      <input
        value={editing?.[key] ?? ''}
        onChange={(e) =>
          setEditing((p) => (p ? { ...p, [key]: e.target.value } : p))
        }
        required
        maxLength={max}
      />
    </label>
  );
  return (
    <div className="portal owner-portal">
      <header className="portal-header">
        <Link href="/owner/" className="portal-brand">
          SHWE PYAE SAN <small>Owner dashboard</small>
        </Link>
        <Link href="/" target="_blank" rel="noreferrer">
          View shop <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <main className="portal-main">
        {loading ? (
          <output className="portal-loading">
            <span className="portal-loading-dot" />
            Opening dashboard…
          </output>
        ) : !session?.user ? (
          <AuthForm owner onSignedIn={() => void refresh()} />
        ) : session.user.role !== 'owner' ? (
          <section className="auth-card">
            <h1>Owner access required</h1>
            <p>This account is a customer account.</p>
            <Link className="portal-primary" href="/account/">
              My customer orders
            </Link>
            <button
              className="portal-secondary"
              disabled={busy || uploadingPhotos}
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </section>
        ) : (
          <div className="owner-workspace">
            <aside className="owner-sidebar">
              <span className="owner-menu-title">SHOP MANAGEMENT</span>{' '}
              <nav className="portal-tabs" aria-label="Dashboard sections">
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'orders'}
                  onClick={() => {
                    setTab('orders');
                    setError('');
                  }}
                >
                  <ShoppingBag size={17} aria-hidden="true" />
                  Orders
                </button>
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'products'}
                  onClick={() => {
                    setTab('products');
                    setError('');
                  }}
                >
                  <Package size={17} aria-hidden="true" />
                  Products
                </button>
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'brands'}
                  onClick={() => {
                    setTab('brands');
                    setError('');
                  }}
                >
                  <Tags size={17} aria-hidden="true" />
                  Brands
                </button>
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'payments'}
                  onClick={() => {
                    setTab('payments');
                    setError('');
                  }}
                >
                  <CreditCard size={17} aria-hidden="true" />
                  Payments
                </button>
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'accounts'}
                  onClick={() => {
                    setTab('accounts');
                    setError('');
                  }}
                >
                  <Users size={17} aria-hidden="true" />
                  Accounts
                </button>
                <button
                  disabled={busy || uploadingPhotos}
                  aria-pressed={tab === 'analytics'}
                  onClick={() => {
                    setTab('analytics');
                    setError('');
                  }}
                >
                  <BarChart3 size={17} aria-hidden="true" />
                  Visitors
                </button>
              </nav>
              <div className="owner-menu-account">
                <strong>{session.user.name}</strong>
                <span>Owner account</span>
              </div>
            </aside>
            <div className="owner-workarea">
              <div className="portal-title">
                <div>
                  <span className="eyebrow">SHWE PYAE SAN</span>
                  <h1>
                    {tab === 'accounts'
                      ? 'Customer accounts'
                      : tab === 'analytics'
                        ? 'Shop visitors'
                        : tab === 'brands'
                          ? 'Shop brands'
                          : 'Shop overview'}
                  </h1>
                  <p>
                    {tab === 'accounts'
                      ? 'Manage customer access and view their orders.'
                      : tab === 'analytics'
                        ? 'See how many browsers visit your shop each day.'
                        : tab === 'brands'
                          ? 'Choose the brand names shown in your shop.'
                          : 'Orders, payments and inventory.'}
                  </p>
                </div>
                <div className="portal-actions">
                  {tab !== 'accounts' && tab !== 'analytics' && (
                    <button
                      className="portal-secondary"
                      onClick={() => void refresh()}
                    >
                      <RefreshCw size={16} aria-hidden="true" />
                      Refresh
                    </button>
                  )}
                  <button
                    className="portal-secondary"
                    disabled={busy || uploadingPhotos}
                    onClick={() => void logout()}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
              {tab !== 'accounts' &&
                tab !== 'analytics' &&
                tab !== 'brands' && (
                  <div className="portal-stats">
                    <article>
                      <span>New orders</span>
                      <strong>{orderSummary.pending}</strong>
                    </article>
                    <article>
                      <span>Payments to check</span>
                      <strong>{orderSummary.paymentsToCheck}</strong>
                    </article>
                    <article>
                      <span>Low stock</span>
                      <strong>
                        {
                          products.filter((p) => p.active && p.stock <= 2)
                            .length
                        }
                      </strong>
                    </article>
                    <article>
                      <span>Completed items total</span>
                      <strong>{money(orderSummary.completedTotal)}</strong>
                      <small>All orders · excludes delivery</small>
                    </article>
                  </div>
                )}
              {notice && <output className="portal-success">{notice}</output>}
              {tab === 'brands' ? (
                <BrandManagement
                  brands={brands}
                  products={products}
                  csrf={session.csrf}
                  onSaved={refresh}
                />
              ) : tab === 'accounts' ? (
                <AccountManagement
                  csrf={session.csrf}
                  onViewOrders={(account) => {
                    setCustomerFilter(account);
                    setTab('orders');
                  }}
                />
              ) : tab === 'analytics' ? (
                <VisitorAnalytics />
              ) : tab === 'orders' ? (
                <>
                  <h2>Customer orders</h2>
                  {customerFilter && (
                    <div className="customer-order-filter">
                      <span>
                        Orders for <strong>{customerFilter.name}</strong> ·{' '}
                        {customerFilter.email}
                      </span>
                      <button
                        className="portal-secondary"
                        onClick={() => setCustomerFilter(null)}
                      >
                        Show all customers
                      </button>
                    </div>
                  )}
                  <OrderHistory
                    key={customerFilter?.id ?? 'all-customers'}
                    owner
                    customerId={customerFilter?.id}
                    csrf={session.csrf}
                    onChanged={refresh}
                  />
                </>
              ) : tab === 'payments' ? (
                <PaymentSettings
                  methods={paymentMethods}
                  csrf={session.csrf}
                  onSaved={refresh}
                />
              ) : (
                <div className="inventory-layout">
                  <section>
                    <div className="portal-section-title">
                      <h2>Product catalog</h2>
                      <button
                        className="portal-primary"
                        disabled={busy || uploadingPhotos}
                        onClick={() => {
                          setEditing({ ...blank, specs: [''] });
                          setNotice('');
                          setError('');
                        }}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Add product
                      </button>
                    </div>
                    <div className="inventory-list">
                      {products.map((product) => (
                        <article className="inventory-product" key={product.id}>
                          <ProductImage product={product} />
                          <div>
                            <h3>{product.name}</h3>
                            <p>
                              {product.collection === 'brand-new'
                                ? 'Brand New'
                                : 'Good Second'}{' '}
                              · {product.brand}
                              <br />
                              {money(product.price)} · {product.stock} in stock
                              · {productPhotos(product).length}{' '}
                              {productPhotos(product).length === 1
                                ? 'photo'
                                : 'photos'}
                            </p>
                            <span
                              className={`order-status ${product.active ? 'status-confirmed' : 'status-cancelled'}`}
                            >
                              {product.active ? 'Visible' : 'Hidden'}
                            </span>
                          </div>
                          <button
                            className="portal-secondary"
                            disabled={busy || uploadingPhotos}
                            aria-label={`Edit ${product.name}`}
                            onClick={() => {
                              setEditing({
                                ...product,
                                specs: [...product.specs],
                              });
                              setError('');
                              setNotice('');
                            }}
                          >
                            Edit
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="portal-card product-editor">
                    {!editing ? (
                      <>
                        <h2>Edit your catalog</h2>
                        <p>
                          Choose a laptop to edit its price, stock and photos.
                        </p>
                      </>
                    ) : (
                      <form
                        className="portal-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (busy || uploadingPhotos) return;
                          setBusy(true);
                          setError('');
                          try {
                            await api(
                              editing.id
                                ? `/api/owner/products/${editing.id}`
                                : '/api/owner/products',
                              {
                                method: editing.id ? 'PUT' : 'POST',
                                csrf: session.csrf,
                                body: editing,
                              },
                            );
                            setEditing(null);
                            setNotice(
                              'Product saved. The shop will update shortly.',
                            );
                            await refresh();
                          } catch (err) {
                            setError(errorMessage(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <h2>{editing.id ? 'Edit product' : 'New product'}</h2>
                        {field('name', 'Product name', 120)}
                        {field('subtitle', 'Short description', 180)}
                        <label>
                          Main category
                          <select
                            value={editing.collection}
                            onChange={(e) =>
                              setEditing((p) =>
                                p
                                  ? {
                                      ...p,
                                      collection: e.target.value as
                                        | 'brand-new'
                                        | 'good-second',
                                    }
                                  : p,
                              )
                            }
                          >
                            <option value="brand-new">Brand New</option>
                            <option value="good-second">Good Second</option>
                          </select>
                        </label>
                        <label>
                          Brand name
                          <input
                            aria-label="Brand name"
                            aria-describedby="brand-entry-help"
                            value={editing.brand}
                            list="laptop-brand-directory"
                            maxLength={50}
                            required
                            onChange={(e) =>
                              setEditing((p) =>
                                p ? { ...p, brand: e.target.value } : p,
                              )
                            }
                          />
                          <datalist id="laptop-brand-directory">
                            {laptopBrandOptions(products, brands).map(
                              (brand) => (
                                <option key={brand} value={brand}>
                                  {brand}
                                </option>
                              ),
                            )}
                          </datalist>
                          <small
                            className="brand-editor-note"
                            id="brand-entry-help"
                          >
                            Choose a suggested brand or enter another laptop
                            brand.
                          </small>
                        </label>
                        {field('category', 'Device type', 40)}
                        {field('condition', 'Condition', 100)}
                        <div className="portal-two-columns">
                          <label>
                            Price (Ks)
                            <input
                              type="number"
                              min="1"
                              max="1000000000000"
                              step="1"
                              value={editing.price || ''}
                              onChange={(e) =>
                                setEditing((p) =>
                                  p
                                    ? { ...p, price: Number(e.target.value) }
                                    : p,
                                )
                              }
                              required
                            />
                          </label>
                          <label>
                            Available stock
                            <input
                              type="number"
                              min="0"
                              max="1000000"
                              step="1"
                              value={editing.stock}
                              onChange={(e) =>
                                setEditing((p) =>
                                  p
                                    ? { ...p, stock: Number(e.target.value) }
                                    : p,
                                )
                              }
                              required
                            />
                          </label>
                        </div>
                        <label>
                          Previous price (optional)
                          <input
                            type="number"
                            min={editing.price + 1}
                            step="1"
                            value={editing.oldPrice ?? ''}
                            onChange={(e) =>
                              setEditing((p) =>
                                p
                                  ? {
                                      ...p,
                                      oldPrice: e.target.value
                                        ? Number(e.target.value)
                                        : undefined,
                                    }
                                  : p,
                              )
                            }
                          />
                        </label>
                        <label>
                          Specifications (one per line)
                          <textarea
                            rows={5}
                            value={editing.specs.join('\n')}
                            onChange={(e) =>
                              setEditing((p) =>
                                p
                                  ? { ...p, specs: e.target.value.split('\n') }
                                  : p,
                              )
                            }
                            required
                          />
                        </label>
                        <ProductPhotos
                          key={editing.id}
                          images={productPhotos(editing)}
                          csrf={session.csrf}
                          disabled={busy}
                          onBusy={setUploadingPhotos}
                          onChange={(images) =>
                            setEditing((current) =>
                              current
                                ? { ...current, images, image: images[0] ?? '' }
                                : current,
                            )
                          }
                        />
                        <label className="portal-checkbox">
                          <input
                            type="checkbox"
                            checked={editing.active}
                            onChange={(e) =>
                              setEditing((p) =>
                                p ? { ...p, active: e.target.checked } : p,
                              )
                            }
                          />
                          Visible in customer shop
                        </label>
                        <p className="portal-muted">
                          Stock means items still available to buy. Items in
                          existing orders are already reserved.
                        </p>
                        <div className="portal-actions">
                          <button
                            className="portal-primary"
                            disabled={
                              busy ||
                              uploadingPhotos ||
                              !productPhotos(editing).length
                            }
                          >
                            {busy ? 'Saving…' : 'Save product'}
                          </button>
                          <button
                            type="button"
                            className="portal-secondary"
                            onClick={() => setEditing(null)}
                            disabled={busy || uploadingPhotos}
                          >
                            Cancel edit
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <p className="portal-error" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer className="portal-footer">SHWE PYAE SAN · Owner dashboard</footer>
    </div>
  );
}
