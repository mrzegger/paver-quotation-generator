export type PaverFinish = 'classic' | 'g1' | 'g2' | 'g3';

export interface PaverItem {
  id: string;
  category: 'Rectangular' | 'Square' | 'Plank' | 'Special';
  name: string;
  dimensions: string; // e.g., '100x200x60mm'
  pcsPerSqm: number;
  pricesVatInc: {
    classic?: number;
    g1?: number;
    g2?: number;
    g3?: number;
  };
  defaultDisplayName?: string;
}

export const INITIAL_PAVER_CATALOG: PaverItem[] = [
  // Rectangular
  {
    id: 'rect-brick',
    category: 'Rectangular',
    name: 'brick',
    dimensions: '100x200x60mm',
    pcsPerSqm: 50,
    pricesVatInc: {
      classic: 20.00,
      g1: 27.00,
      g2: 24.50,
      g3: 21.00,
    },
    defaultDisplayName: 'Brickstone paver'
  },
  {
    id: 'rect-os-brick',
    category: 'Rectangular',
    name: 'o.s. brick',
    dimensions: '200x400x60mm',
    pcsPerSqm: 12.5,
    pricesVatInc: {
      classic: 80.00,
      g1: 108.00,
      g2: 99.00,
      g3: 84.50,
    },
    defaultDisplayName: 'O.S. Brickstone paver'
  },

  // Square
  {
    id: 'sq-xsmall',
    category: 'Square',
    name: 'x-small',
    dimensions: '100x100x60mm',
    pcsPerSqm: 100,
    pricesVatInc: {
      classic: 10.00,
      g1: 14.00,
      g2: 12.50,
      g3: 11.00,
    },
    defaultDisplayName: 'Mini Square paver'
  },
  {
    id: 'sq-regular',
    category: 'Square',
    name: 'regular',
    dimensions: '200x200x60mm',
    pcsPerSqm: 25,
    pricesVatInc: {
      classic: 40.00,
      g1: 54.00,
      g2: 49.50,
      g3: 42.50,
    },
    defaultDisplayName: 'Square paver'
  },
  {
    id: 'sq-medium',
    category: 'Square',
    name: 'medium',
    dimensions: '300x300x60mm',
    pcsPerSqm: 11.11,
    pricesVatInc: {
      classic: 90.50,
      g1: 122.50,
      g2: 112.00,
      g3: 95.50,
    },
    defaultDisplayName: 'Mid Square paver'
  },
  {
    id: 'sq-large',
    category: 'Square',
    name: 'large',
    dimensions: '400x400x80mm',
    pcsPerSqm: 6.25,
    pricesVatInc: {
      classic: 216.50,
      g1: 289.50,
      g2: 263.50,
      g3: 226.00,
    },
    defaultDisplayName: 'Large Square paver'
  },

  // Plank
  {
    id: 'plank-thin',
    category: 'Plank',
    name: 'thin',
    dimensions: '50x400x75mm',
    pcsPerSqm: 50,
    pricesVatInc: {
      classic: 26.00,
      g1: 34.50,
      g2: 32.00,
      g3: 27.00,
    },
    defaultDisplayName: 'Thin Plank paver'
  },
  {
    id: 'plank-short',
    category: 'Plank',
    name: 'short',
    dimensions: '100x300x70mm',
    pcsPerSqm: 33.33,
    pricesVatInc: {
      classic: 30.50,
      g1: 42.50,
      g2: 39.00,
      g3: 33.00,
    },
    defaultDisplayName: 'Short Plank paver'
  },
  {
    id: 'plank-regular',
    category: 'Plank',
    name: 'regular',
    dimensions: '100x400x60mm',
    pcsPerSqm: 25,
    pricesVatInc: {
      classic: 40.00,
      g1: 54.00,
      g2: 49.50,
      g3: 42.50,
    },
    defaultDisplayName: 'Plank paver'
  },

  // Special
  {
    id: 'special-hexagon',
    category: 'Special',
    name: 'hexagon',
    dimensions: '300x300x60mm',
    pcsPerSqm: 12.83,
    pricesVatInc: {
      classic: 100.00,
      g1: 135.00,
      g2: 123.50,
      g3: 106.00,
    },
    defaultDisplayName: 'Hexagon paver'
  },
  {
    id: 'special-grasspaver',
    category: 'Special',
    name: 'grasspaver',
    dimensions: '400x400x80mm',
    pcsPerSqm: 6.25,
    pricesVatInc: {
      classic: 216.50,
    },
    defaultDisplayName: 'Pourous Grass paver square'
  }
];

export const FINISH_LABELS: Record<PaverFinish, { name: string; subtitle: string; prefix: string; badge?: string }> = {
  classic: { name: 'Classic', subtitle: 'Standard Concrete', prefix: 'Classic' },
  g1: { name: 'G1 Pervious', subtitle: 'Super-Fine', prefix: 'G1 Pervious', badge: '/badge_g1.png' },
  g2: { name: 'G2 Pervious', subtitle: 'Fine', prefix: 'G2 Pervious', badge: '/badge_g2.png' },
  g3: { name: 'G3 Pervious', subtitle: 'Coarse', prefix: 'G3 Pervious', badge: '/badge_g3.png' },
};

export const STANDARD_COLORS = [
  { name: 'Cement Gray', isGray: true, hex: '#9ca3af' },
  { name: 'Light Gray', isGray: false, hex: '#d1d5db' },
  { name: 'Dark Gray / Charcoal', isGray: false, hex: '#4b5563' },
  { name: 'Beige', isGray: false, hex: '#d2b48c' },
  { name: 'Terracotta / Red', isGray: false, hex: '#b91c1c' },
  { name: 'Greenfield Green', isGray: false, hex: '#15803d' },
  { name: 'Greenfield Blue', isGray: false, hex: '#1d4ed8' },
  { name: 'Yellow / Gold', isGray: false, hex: '#eab308' },
  { name: 'Brown / Earth', isGray: false, hex: '#78350f' },
];
