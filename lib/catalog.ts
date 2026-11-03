export type ProductCollection = 'brand-new' | 'good-second';

export type Product = {
  id: number;
  name: string;
  subtitle: string;
  price: number;
  oldPrice?: number;
  collection: ProductCollection;
  brand: string;
  category: string;
  condition: string;
  stock: number;
  image: string;
  images?: string[];
  specs: string[];
  active?: boolean;
  version?: number;
};

export function productPhotos(
  product: Pick<Product, 'image' | 'images'>,
): string[] {
  return [
    ...new Set(
      product.images?.length
        ? product.images
        : product.image
          ? [product.image]
          : [],
    ),
  ];
}

export const products: Product[] = [
  {
    id: 1,
    collection: 'good-second',
    brand: 'Lenovo',
    name: 'Lenovo ThinkPad X1 Carbon Gen 8',
    subtitle: 'Core i5 · 8GB · 256GB · LTE',
    price: 1500000,
    oldPrice: 1750000,
    category: 'Business',
    condition: 'Excellent · Grade A',
    stock: 3,
    image: '/products/laptop-1.jpg',
    specs: [
      '14″ Full HD display',
      'Intel Core i5 10th Gen',
      '8GB DDR4 memory',
      '256GB NVMe SSD',
      'LTE SIM support',
      '84% battery health',
    ],
  },
  {
    id: 2,
    collection: 'good-second',
    brand: 'Dell',
    name: 'Dell Inspiron 7591 2-in-1',
    subtitle: 'Core i7 · 16GB · 512GB · Touch',
    price: 1850000,
    oldPrice: 2050000,
    category: '2-in-1',
    condition: 'Like new · Grade A+',
    stock: 5,
    image: '/products/laptop-2.jpg',
    specs: [
      '15.6″ 4K touch display',
      'Intel Core i7 10th Gen',
      '16GB DDR4 memory',
      '512GB NVMe SSD',
      'NVIDIA MX250 graphics',
      'Original Dell touch pen',
    ],
  },
  {
    id: 3,
    collection: 'good-second',
    brand: 'HP',
    name: 'HP ZBook Studio G5',
    subtitle: 'Core i7 · 32GB · 1TB · Quadro',
    price: 2700000,
    category: 'Workstation',
    condition: 'Excellent · Grade A',
    stock: 2,
    image: '/products/laptop-3.jpg',
    specs: [
      '15.6″ Full HD IPS',
      'Intel Core i7 8th Gen',
      '32GB DDR4 memory',
      '1TB NVMe SSD',
      'NVIDIA Quadro P1000',
      '3-month SPL warranty',
    ],
  },
  {
    id: 4,
    collection: 'good-second',
    brand: 'Microsoft',
    name: 'Microsoft Surface Laptop 4',
    subtitle: 'Ryzen 5 · 16GB · 256GB · 13.5″',
    price: 1650000,
    category: 'Ultrabook',
    condition: 'Very good · Grade A',
    stock: 4,
    image: '/products/laptop-4.jpg',
    specs: [
      '13.5″ PixelSense display',
      'AMD Ryzen 5 processor',
      '16GB LPDDR4x memory',
      '256GB SSD',
      'Windows Hello camera',
      'Original 65W charger',
    ],
  },
  {
    id: 5,
    collection: 'good-second',
    brand: 'Lenovo',
    name: 'Lenovo ThinkPad X1 Yoga',
    subtitle: 'Core i5 · 8GB · 256GB · QHD Touch',
    price: 1280000,
    oldPrice: 1420000,
    category: '2-in-1',
    condition: 'Very good · Grade A',
    stock: 6,
    image: '/products/laptop-5.jpg',
    specs: [
      '14″ QHD touchscreen',
      'Intel Core i5 processor',
      '8GB memory',
      '256GB SSD',
      '360° convertible hinge',
      'Integrated stylus',
    ],
  },
  {
    id: 6,
    collection: 'good-second',
    brand: 'HP',
    name: 'HP EliteBook Workstation',
    subtitle: 'Core i7 · 16GB · 512GB · Graphics',
    price: 2200000,
    category: 'Workstation',
    condition: 'Excellent · Grade A',
    stock: 2,
    image: '/products/laptop-6.jpg',
    specs: [
      '15.6″ Full HD display',
      'Intel Core i7 processor',
      '16GB DDR4 memory',
      '512GB SSD',
      'Dedicated graphics',
      'Backlit keyboard',
    ],
  },
  {
    id: 7,
    collection: 'good-second',
    brand: 'Lenovo',
    name: 'Lenovo ThinkPad T490',
    subtitle: 'Core i5 · 16GB · 256GB · 14″',
    price: 1120000,
    category: 'Business',
    condition: 'Good · Grade B+',
    stock: 8,
    image: '/products/laptop-7.jpg',
    specs: [
      '14″ Full HD display',
      'Intel Core i5 8th Gen',
      '16GB DDR4 memory',
      '256GB SSD',
      'Fingerprint reader',
      'USB-C charging',
    ],
  },
  {
    id: 8,
    collection: 'good-second',
    brand: 'Microsoft',
    name: 'Surface Laptop Platinum',
    subtitle: 'Core i5 · 8GB · 256GB · Touch',
    price: 1380000,
    oldPrice: 1520000,
    category: 'Ultrabook',
    condition: 'Very good · Grade A',
    stock: 3,
    image: '/products/laptop-8.jpg',
    specs: [
      '13.5″ touch display',
      'Intel Core i5 processor',
      '8GB memory',
      '256GB SSD',
      'Aluminium body',
      'Lightweight design',
    ],
  },
];
