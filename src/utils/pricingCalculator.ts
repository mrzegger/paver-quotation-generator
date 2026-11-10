import { PaverItem, PaverFinish } from '../data/paverCatalog';

export interface QuotationLineItem {
  id: string;
  type: 'paver' | 'custom' | 'delivery';
  
  // For paver
  paverId?: string;
  category?: string;
  name?: string;
  finish?: PaverFinish;
  dimensions?: string;
  pcsPerSqm?: number;
  color?: string;
  isCustomColor?: boolean;
  isColoredSurcharge?: boolean; // true if color surcharge applies
  colorSurchargePerSqm?: number; // Surcharge per sqm in PHP (defaults to 300, customizable)

  // Custom Dimensions & Custom Sizing
  isCustomDimensions?: boolean;
  customLengthMm?: number;
  customWidthMm?: number;
  customThicknessMm?: number;
  customPaverName?: string;
  suggestedPriceVatInc?: number;
  isCustomPriceOverridden?: boolean;

  // Quantity
  sqm?: number;
  pieces?: number;

  // Custom / Delivery
  description: string;
  details?: string; // Sub-bullet notes like '• 50 pcs/sqm\n544.88 SQM\n• Color: Greenfield Green'

  // Pricing
  unitPriceVatInc?: number;
  unitPriceNonVat: number;
  totalNonVat: number;
}

export interface QuotationDiscount {
  enabled: boolean;
  type: 'percentage' | 'fixed';
  value: number; // e.g. 10 for 10%
  amount: number; // calculated negative PHP
  label?: string; // e.g. "PAVER DISCOUNT: 10.00%"
}

export interface QuotationDelivery {
  enabled: boolean;
  description: string; // e.g. "• For Delivery - Loading courtesy of Kuma - Pallet Packaging Included (suggested x4 25Ton & 3x 20Ton)"
  deliveriesCount?: string; // e.g. "2 Deliveries" or blank
  amount: number;
}

export interface QuotationSummary {
  paversSubtotal: number;
  customSubtotal: number;
  discountAmount: number; // negative or 0
  deliveryAmount: number;
  totalBeforeVat: number; // "Total Amount"
  vatAmount: number; // "Plus: 12% Vat"
  grandTotal: number; // "GRAND TOTAL CONTRACT PRICE"
}

export const COLOR_SURCHARGE_PER_SQM = 300.00; // PHP 300.00/sqm added to non-vat price

/**
 * Calculates unit price per piece (non-VAT).
 * Unit Price = (VAT_INC_PRICE / 1.12) + (isColored ? 300 / pcsPerSqm : 0)
 * Rounded to 2 decimal places as seen in Kuma quotes.
 */
export function calculatePaverUnitPrice(
  basePriceVatInc: number,
  pcsPerSqm: number,
  isColored: boolean,
  colorSurchargePerSqm: number = COLOR_SURCHARGE_PER_SQM
): number {
  if (!basePriceVatInc || pcsPerSqm <= 0) return 0;
  const baseNonVat = basePriceVatInc / 1.12;
  const surchargePerPc = isColored ? ((colorSurchargePerSqm ?? COLOR_SURCHARGE_PER_SQM) / pcsPerSqm) : 0;
  const finalUnitPrice = baseNonVat + surchargePerPc;
  return Math.round((finalUnitPrice + Number.EPSILON) * 100) / 100;
}

/**
 * Baseline volumetric rates in PHP/m3 (VAT Included) based on Kuma Concrete standard price list:
 * - Classic: ~16,666.67 PHP/m3 (e.g. 20.00 PHP for 100x200x60mm = 0.0012 m3)
 * - G1 (Fine Pervious): ~22,500.00 PHP/m3 (e.g. 27.00 PHP for 100x200x60mm)
 * - G2 (Semi Pervious): ~20,500.00 PHP/m3 (e.g. 24.50 PHP for 100x200x60mm)
 * - G3 (Coarse Pervious): ~17,600.00 PHP/m3 (e.g. 21.00 PHP for 100x200x60mm)
 */
export const VOLUMETRIC_RATES_PER_M3_VAT_INC: Record<PaverFinish, number> = {
  classic: 16666.67,
  g1: 22500.00,
  g2: 20500.00,
  g3: 17600.00,
};

/**
 * Calculates pieces per square meter (pcs/sqm) from length and width in millimeters:
 * pcsPerSqm = 1,000,000 / (L * W)
 */
export function calculatePcsPerSqm(lengthMm: number, widthMm: number): number {
  if (!lengthMm || !widthMm || lengthMm <= 0 || widthMm <= 0) return 0;
  const pcs = 1000000 / (lengthMm * widthMm);
  return Math.round((pcs + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates volume of a single paver in cubic meters (m3):
 * volumeM3 = (L * W * T) / 1,000,000,000
 */
export function calculatePaverVolumeM3(lengthMm: number, widthMm: number, thicknessMm: number): number {
  if (!lengthMm || !widthMm || !thicknessMm || lengthMm <= 0 || widthMm <= 0 || thicknessMm <= 0) return 0;
  return (lengthMm * widthMm * thicknessMm) / 1e9;
}

/**
 * Calculates suggested price (VAT Included) for a custom paver based on its cubic meter volume
 * and the rate per m3 matching the chosen finish.
 * Returns suggested price per pc rounded to nearest 0.50 PHP.
 */
export function calculateSuggestedCustomPrice(
  lengthMm: number,
  widthMm: number,
  thicknessMm: number,
  finish: PaverFinish = 'classic',
  catalog?: PaverItem[]
): number {
  const volM3 = calculatePaverVolumeM3(lengthMm, widthMm, thicknessMm);
  if (volM3 <= 0) return 0;

  let ratePerM3 = VOLUMETRIC_RATES_PER_M3_VAT_INC[finish] || VOLUMETRIC_RATES_PER_M3_VAT_INC.classic;

  if (catalog && catalog.length > 0) {
    const rates: number[] = [];
    for (const item of catalog) {
      const match = item.dimensions.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
      const price = item.pricesVatInc[finish];
      if (match && price && price > 0) {
        const itemVol = (Number(match[1]) * Number(match[2]) * Number(match[3])) / 1e9;
        if (itemVol > 0) {
          rates.push(price / itemVol);
        }
      }
    }
    if (rates.length > 0) {
      ratePerM3 = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
  }

  const rawSuggested = volM3 * ratePerM3;
  return Math.round(rawSuggested * 2) / 2;
}

/**
 * Converts SQM to whole pieces based on pcsPerSqm.
 */
export function sqmToPieces(sqm: number, pcsPerSqm: number): number {
  if (!sqm || pcsPerSqm <= 0) return 0;
  return Math.ceil(sqm * pcsPerSqm);
}

/**
 * Converts pieces to SQM based on pcsPerSqm.
 */
export function piecesToSqm(pieces: number, pcsPerSqm: number): number {
  if (!pieces || pcsPerSqm <= 0) return 0;
  return Math.round((pieces / pcsPerSqm) * 100) / 100;
}

/**
 * Calculates complete quotation financial breakdown
 */
export function calculateQuotationSummary(
  items: QuotationLineItem[],
  discount: QuotationDiscount,
  delivery: QuotationDelivery
): QuotationSummary {
  let paversSubtotal = 0;
  let customSubtotal = 0;

  for (const item of items) {
    if (item.type === 'paver') {
      paversSubtotal += item.totalNonVat || 0;
    } else if (item.type === 'custom') {
      customSubtotal += item.totalNonVat || 0;
    }
  }

  // Calculate discount (discount applies to pavers subtotal in Kuma's quotations)
  let discountAmount = 0;
  if (discount.enabled) {
    if (discount.type === 'percentage') {
      discountAmount = Math.round(paversSubtotal * (discount.value / 100) * 100) / 100;
    } else {
      discountAmount = discount.value || 0;
    }
  }

  const deliveryAmount = delivery.enabled ? (delivery.amount || 0) : 0;

  // Subtotal before VAT (Total Amount)
  const totalBeforeVat = Math.round((paversSubtotal - discountAmount + customSubtotal + deliveryAmount) * 100) / 100;
  
  // 12% VAT
  const vatAmount = Math.round(totalBeforeVat * 0.12 * 100) / 100;

  // Grand Total Contract Price
  const grandTotal = Math.round((totalBeforeVat + vatAmount) * 100) / 100;

  return {
    paversSubtotal: Math.round(paversSubtotal * 100) / 100,
    customSubtotal: Math.round(customSubtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    deliveryAmount: Math.round(deliveryAmount * 100) / 100,
    totalBeforeVat,
    vatAmount,
    grandTotal
  };
}

/**
 * Formats a number as Philippine Peso string e.g. "PHP 813,505.84"
 */
export function formatPHP(amount: number, prefix: string = 'PHP '): string {
  if (isNaN(amount)) return `${prefix}0.00`;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${prefix}${formatted}`;
}
