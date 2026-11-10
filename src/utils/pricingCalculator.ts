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
