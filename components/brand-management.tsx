'use client';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage, type ManagedProduct } from '@/lib/connected';

export function BrandManagement({
  brands,
  products,
  csrf,
  onSaved,
}: {
  brands: string[];
  products: ManagedProduct[];
  csrf: string | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const change = async (method: 'POST' | 'DELETE', value: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ name?: string }>('/api/owner/brands', {
        method,
        csrf,
        body: { name: value },
      });
      await onSaved();
      if (method === 'POST') setName('');
      setNotice(
        method === 'POST'
          ? `${result.name} is in your shop brand list.`
          : `${value} removed.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="brand-management" aria-label="Shop brand management">
      <form
        className="brand-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void change('POST', name);
        }}
      >
        <label>
          Brand name
          <input
            required
            maxLength={50}
            placeholder="e.g. ASUS"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="portal-primary"
          type="submit"
          disabled={busy || !name.trim()}
        >
          <Plus size={16} aria-hidden="true" />
          {busy ? 'Saving…' : 'Add brand'}
        </button>
      </form>
      <p className="brand-management-help">
        These names appear in the shop filter and the laptop editor. Existing
        laptop brands are already here.
      </p>
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="portal-success">{notice}</output>}
      <div className="portal-section-title">
        <h2>Your brands</h2>
        <span>{brands.length} brands</span>
      </div>
      <ul className="managed-brand-list">
        {brands.map((brand) => {
          const matching = products.filter(
            (p) => p.brand.toLowerCase() === brand.toLowerCase(),
          );
          const brandNew = matching.filter(
            (p) => p.collection === 'brand-new',
          ).length;
          const goodSecond = matching.filter(
            (p) => p.collection === 'good-second',
          ).length;
          return (
            <li key={brand}>
              <div>
                <strong>{brand}</strong>
                <span>
                  Brand New: {brandNew} · Good Second: {goodSecond}
                </span>
              </div>
              <button
                className="portal-secondary"
                type="button"
                disabled={busy || matching.length > 0}
                aria-label={`Remove ${brand}`}
                title={
                  matching.length
                    ? 'Used by a laptop. Change its brand in Products first.'
                    : `Remove ${brand}`
                }
                onClick={() => void change('DELETE', brand)}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span>Remove</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!brands.length && <p>Add your first brand above.</p>}
      <p className="brand-management-help">
        Counts include hidden listings. Brands used by a laptop cannot be
        removed.
      </p>
    </section>
  );
}
