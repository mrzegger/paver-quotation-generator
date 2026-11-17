import { QuotationLineItem, QuotationDiscount, QuotationDelivery, QuotationVatConfig } from './pricingCalculator';
import { PaverItem, INITIAL_PAVER_CATALOG } from '../data/paverCatalog';

export interface QuotationData {
  id: string;
  quotationNumber: string;
  date: string; // e.g. "10-Nov-26"
  clientName: string;
  companyName?: string;
  projectName: string;
  projectLocation: string;
  tableHeaderTitle: string; // e.g. "Paver (Delivered)", "Paver (Pick-up)", etc.
  items: QuotationLineItem[];
  discount: QuotationDiscount;
  delivery: QuotationDelivery;
  vatConfig?: QuotationVatConfig;
  termsFontSize?: number; // base font size in pt for Terms & Conditions (default 9.2)
  termsAndConditions: string; // legacy fallback
  termsPage1: string;
  termsPage2: string;
  paymentDetails: {
    payableTo: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  signatory: {
    name: string;
    title: string;
  };
  createdByUserId?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_TERMS_PAGE_1 = `I. Terms and Conditions
1. Payment Schedule:
• 50% Downpayment upon signing of conformity.
• 40% Progress Payment prior to final delivery or pick-up of products.
• 10% Remaining Balance payable within fourteen (14) calendar days after final delivery, pick-up, or turnover.
2. Late Payments: KUMA CONCRETE reserves the right to charge a compound interest fee of 2% per month on all overdue accounts and unpaid balances.
3. Suspension of Work/Deliveries: KUMA CONCRETE reserves the right to suspend pending deliveries, site works, or manufacturing if previous billings or milestone payments remain unpaid beyond the agreed terms.
4. Post-Turnover Liability: KUMA CONCRETE shall not be liable for any damage, staining, cracking, or surface defects caused by other trades, site vehicles, chemicals, or poor site maintenance once the finished floor or products have been delivered or turned over to the Client.
II. Conditions Of Proposal
A. Standard Local Delivery & Packaging Conditions
1. Palletization & Packaging Fees:
• Delivered Orders: The quoted delivery fee covers standard pallets and protective packaging required for transit.
• Client Pickups: For products picked up directly from KUMA CONCRETE plant/warehouse locations, packaging materials and pallets are not included in the base product price and will incur additional per-pallet charges.
2. Pickup Notification Requirement: For Client pickups, a minimum of forty-eight (48) hours prior written notice is required to schedule site preparation and loading. Unannounced pickups will not be processed or dispatched.
3. Manpower & Unloading: The Client is strictly responsible for providing sufficient manpower/equipment for offloading products at the destination site.
• Additional charges will apply if KUMA CONCRETE personnel are requested or forced to assist in unloading due to site unreadiness.
4. Permits & Access: The Client must secure and shoulder all necessary site entry passes, barangay clearance fees, homeowner association permits, and local traffic authority clearances required for delivery.
5. Route Restrictions: The Client must notify KUMA CONCRETE in writing of any vehicle weight, height, length, or bridge limits along the delivery route prior to dispatch.
6. Unloading Window: Offloading must commence within two (2) hours of the delivery vehicle's arrival on site.
B. Container Shipping & Inter-Island Demurrage Conditions
1. Door-to-Port Deliveries (Client Self-Collection):
• The Client assumes full responsibility for customs clearance, port retrieval, and returning empty containers to the designated port terminal.
• Free Storage: The Client is granted two (2) calendar days of free port storage/demurrage starting from the vessel arrival date.
• Demurrage Penalties: If containers are not pulled out, emptied, and returned within this 2-day window, standard demurrage penalties (ranging from PHP 1,500.00 to PHP 2,000.00 per container/day, based on shipping line tariffs) will accrue on the third (3rd) day and will be billed directly to the Client.
2. Door-to-Door Deliveries (Site Mobilization & Trucking):
• Turnaround Window: A maximum window of eight (8) to nine (9) hours is allocated for total loading and unloading of cargo per truck arrival.
• Trucking Delay Penalties: If loading/unloading exceeds the 8-9 hour window due to site unreadiness, poor access, adverse weather, or missing Client personnel, a Full Trucking Rate Penalty (variable based on distance and location) will be assessed for every day or instance of delay.`;

export const DEFAULT_TERMS_PAGE_2 = `C. Product Quality, Testing & Compliance
1. Third-Party Product Testing: All products supplied conform to KUMA CONCRETE's internal quality control standards. Should the Client require independent laboratory or third-party testing (including, but not limited to, compressive strength, flexural strength, water absorption, or abrasion tests):
• All testing fees, laboratory charges, specimen sampling, and transportation costs shall be strictly at the Client's sole expense.
• Sampling and testing must be performed by a mutually agreed-upon accredited testing facility.
• The initiation of third-party testing shall not delay or alter the agreed payment schedules or holding of retention fees.
2. Execution System: Work shall be executed using only the specific material specifications and installation systems detailed in this proposal.
3. Site Supervision Control: Full control over the application, batching, and installation process remains at the sole discretion of KUMA CONCRETE. On-site instructions or variation requests must be coordinated directly through the designated KUMA CONCRETE Site Supervisor.
D. Limitations Of Proposal & Scope Adjustments
1. Scope Adjustments: Reductions to the project area or scope initiated by the Client shall not exceed 25% of the original agreed contract area. (The final revised area must remain at least 75% of the initial proposal volume).
2. Changed Site Conditions: This proposal excludes pre-identified areas exhibiting significant structural, subgrade, or environmental changes from the time of the initial site survey.
3. Exclusions: Any item, scope, surface preparation, or trade coordination not explicitly listed in this written proposal is strictly excluded.
III. Start-Up / Manufacturing Lead Time
KUMA CONCRETE requires standard lead time to initiate production and dispatch following contract execution and receipt of the 50% downpayment. If requested concrete pavers or products are not currently in stock, production schedules are subject to the prevailing production queue, followed by a mandatory curing period of at least fourteen (14) calendar days prior to dispatch. Final delivery or project completion dates shall be confirmed in writing upon downpayment confirmation.
IV. Offer Validity
This quotation is valid for thirty (30) calendar days from the date of issue. Conformity to this proposal does not obligate KUMA CONCRETE to performance bonds, retention terms, or liquidating damages unless explicitly negotiated and executed in a separate written agreement.`;

const STORAGE_KEYS = {
  QUOTATIONS: 'kuma_quotations_v1',
  CURRENT_DRAFT: 'kuma_current_draft_v1',
  CATALOG: 'kuma_paver_catalog_v1',
  LAST_QUOTE_NUM: 'kuma_last_quote_number'
};

export function getSavedCatalog(): PaverItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATALOG);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load saved catalog', e);
  }
  return INITIAL_PAVER_CATALOG;
}

export function saveCatalog(catalog: PaverItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(catalog));
  } catch (e) {
    console.error('Failed to save catalog', e);
  }
}

export function getSavedQuotations(): QuotationData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUOTATIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load saved quotations', e);
  }
  return [];
}

export function saveQuotation(quote: QuotationData): void {
  const existing = getSavedQuotations();
  const idx = existing.findIndex(q => q.id === quote.id);
  if (idx >= 0) {
    existing[idx] = { ...quote, updatedAt: Date.now() };
  } else {
    existing.unshift({ ...quote, updatedAt: Date.now() });
  }
  localStorage.setItem(STORAGE_KEYS.QUOTATIONS, JSON.stringify(existing));
  localStorage.setItem(STORAGE_KEYS.LAST_QUOTE_NUM, quote.quotationNumber);
}

export function deleteQuotation(id: string): void {
  const existing = getSavedQuotations().filter(q => q.id !== id);
  localStorage.setItem(STORAGE_KEYS.QUOTATIONS, JSON.stringify(existing));
}

/**
 * Increments quote number e.g. "2026-KPS-Q-192" -> "2026-KPS-Q-193"
 */
export function getNextQuotationNumber(): string {
  const last = localStorage.getItem(STORAGE_KEYS.LAST_QUOTE_NUM) || '2026-KPS-Q-192';
  const match = last.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10) + 1;
    return `${prefix}${num}`;
  }
  const year = new Date().getFullYear();
  return `${year}-KPS-Q-193`;
}

/**
 * Returns formatted date like "10-Nov-26"
 */
export function formatQuotationDate(d: Date = new Date()): string {
  const day = d.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}
