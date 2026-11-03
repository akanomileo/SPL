import type { Product } from './catalog';

export function laptopBrandOptions(
  catalog: Pick<Product, 'brand'>[] = [],
  managedNames: string[] = [],
): string[] {
  const directory = new Map<string, string>();
  for (const name of [...managedNames, ...catalog.map((p) => p.brand)]) {
    const value = name.trim();
    if (value && !directory.has(value.toLowerCase()))
      directory.set(value.toLowerCase(), value);
  }
  return [...directory.values()].sort((a, b) => a.localeCompare(b));
}
