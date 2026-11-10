import { INITIAL_PAVER_CATALOG, PaverItem, PaverFinish } from '../data/paverCatalog';
import { calculatePaverUnitPrice, sqmToPieces, QuotationLineItem } from './pricingCalculator';

export interface ParsedRequest {
  clientName?: string;
  companyName?: string;
  contactNumber?: string;
  email?: string;
  projectName?: string;
  projectLocation?: string;
  items: Array<{
    category?: string;
    productName?: string;
    dimensions?: string;
    finish?: PaverFinish;
    color?: string;
    pieces?: number;
    sqm?: number;
    rawText: string;
  }>;
}

/**
 * Cleans OCR artifacts and fixes known character recognition errors for Philippine locations,
 * company abbreviations, and special characters (such as "ñ" misread as "fi", "ia", or "n").
 */
export function cleanOcrText(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Fix Parañaque in all OCR permutations (Parafiaque, Paraiaque, Paranaque, Para-fiaque, Para iaque, etc.)
  cleaned = cleaned.replace(/\bpara[-\s]*(?:fi|fa|ia|fl|ti|ñ|n|i|f|ii|!|1)?a?que\b/gi, (match) => {
    if (match === match.toUpperCase()) return 'PARAÑAQUE';
    if (match[0] === match[0].toUpperCase()) return 'Parañaque';
    return 'parañaque';
  });

  // 2. Fix Las Piñas permutations (Las Pifias, Las Piias, Las Pinas, etc.)
  cleaned = cleaned.replace(/\blas[-\s]*p(?:fi|fa|ia|fl|ti|ñ|n|i|f)?a?s\b/gi, (match) => {
    if (match === match.toUpperCase()) return 'LAS PIÑAS';
    return 'Las Piñas';
  });

  // 3. Fix Santo Niño / Sto. Niño
  cleaned = cleaned.replace(/\b(sto\.?|santo)[-\s]*n(?:fi|ia|ñ|n|i)o\b/gi, (_, prefix) => {
    return prefix + ' Niño';
  });

  // 4. Fix Biñan
  cleaned = cleaned.replace(/\bbi(?:fi|ia|ñ|n|i)an\b/gi, (match) => {
    if (match === match.toUpperCase()) return 'BIÑAN';
    return 'Biñan';
  });

  // 5. Fix JOC misread as 30C, 3OC, ]0C, J0C
  cleaned = cleaned.replace(/\b(?:30C|3OC|J0C)\b|\](?:0C|OC)\b/g, 'JOC');

  return cleaned;
}

/**
 * Parses quotation request text from email, form submissions, or OCR
 */
export function parseQuotationRequestText(rawText: string): ParsedRequest {
  const cleanedText = cleanOcrText(rawText);
  const result: ParsedRequest = {
    items: []
  };

  // Extract key-value pairs (supports 'key: value' and 'key\tvalue')
  const clientMatch = cleanedText.match(/(?:client_name|client\s*name)\s*[:\t]?\s*([^\n\r]+)/i);
  if (clientMatch) result.clientName = cleanOcrText(clientMatch[1].trim());

  const companyMatch = cleanedText.match(/(?:company_name|company)\s*[:\t]?\s*([^\n\r]+)/i);
  if (companyMatch) result.companyName = cleanOcrText(companyMatch[1].trim());

  const contactMatch = cleanedText.match(/(?:contact_number|phone|mobile)\s*[:\t]?\s*([^\n\r]+)/i);
  if (contactMatch) result.contactNumber = contactMatch[1].trim();

  const emailMatch = cleanedText.match(/(?:email)\s*[:\t]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) result.email = emailMatch[1].trim();

  const projectMatch = cleanedText.match(/(?:project_name|project)\s*[:\t]?\s*([^\n\r]+)/i);
  if (projectMatch) result.projectName = cleanOcrText(projectMatch[1].trim());

  const locationMatch = cleanedText.match(/(?:project_location|location|site\s*address)\s*[:\t]?\s*([^\n\r]+)/i);
  if (locationMatch) result.projectLocation = cleanOcrText(locationMatch[1].trim());

  // Parse items from estimate itemization blocks or numbered items
  // Pattern: "1. Square: Regular (200x200x60mm)... Finish: G2 | Color: Gray... Quantity: 1,250 Pcs (50 m²)"
  const itemBlocks = cleanedText.split(/(?=\b\d+[\.\)]\s+[A-Za-z])/);

  for (const block of itemBlocks) {
    if (!block.trim()) continue;

    // Check if this block describes a line item
    const headerMatch = block.match(/^\s*(\d+)[\.\)]\s*([^\n\r]+)/);
    if (!headerMatch) continue;

    const itemTitle = headerMatch[2].trim(); // e.g. "Square: Regular (200x200x60mm)"
    
    // Extract finish & color
    let finish: PaverFinish = 'classic';
    const finishMatch = block.match(/Finish\s*[:\t]?\s*(Classic|G1|G2|G3)\b/i);
    if (finishMatch) {
      const f = finishMatch[1].toLowerCase();
      if (f === 'g1' || f === 'g2' || f === 'g3') finish = f as PaverFinish;
    }

    let color = 'Cement Gray';
    const colorMatch = block.match(/Color\s*[:\t]?\s*([A-Za-z\s]+?)(?:\||\n|\r|$)/i);
    if (colorMatch) {
      const c = colorMatch[1].trim();
      if (c.toLowerCase().includes('gray') || c.toLowerCase().includes('grey')) {
        color = 'Cement Gray';
      } else {
        color = c;
      }
    }

    // Extract quantity (Pcs and/or m2 / sqm)
    let pieces: number | undefined;
    let sqm: number | undefined;

    const pcsMatch = block.match(/([\d,]+)\s*(?:pcs|pieces)/i);
    if (pcsMatch) {
      pieces = parseInt(pcsMatch[1].replace(/,/g, ''), 10);
    }

    const sqmMatch = block.match(/([\d,.]+)\s*(?:m²|m2|sqm)/i);
    if (sqmMatch) {
      sqm = parseFloat(sqmMatch[1].replace(/,/g, ''));
    }

    result.items.push({
      productName: itemTitle,
      finish,
      color,
      pieces,
      sqm,
      rawText: block.trim()
    });
  }

  return result;
}

/**
 * Matches parsed item text to the catalog paver and creates a QuotationLineItem
 */
export function convertParsedItemToLineItem(
  parsedItem: ParsedRequest['items'][0],
  catalog: PaverItem[] = INITIAL_PAVER_CATALOG
): QuotationLineItem {
  const text = (parsedItem.productName || '') + ' ' + (parsedItem.dimensions || '');
  
  // Try to find matching catalog item by category and name or dimensions
  let matchedPaver: PaverItem | undefined;

  for (const paver of catalog) {
    const dimMatch = text.toLowerCase().includes(paver.dimensions.toLowerCase());
    const nameMatch = text.toLowerCase().includes(paver.name.toLowerCase());
    const catMatch = text.toLowerCase().includes(paver.category.toLowerCase());

    if (dimMatch && (nameMatch || catMatch)) {
      matchedPaver = paver;
      break;
    }
  }

  // Fallback to dimension search only
  if (!matchedPaver) {
    for (const paver of catalog) {
      if (text.toLowerCase().includes(paver.dimensions.toLowerCase())) {
        matchedPaver = paver;
        break;
      }
    }
  }

  // Fallback to name search
  if (!matchedPaver) {
    for (const paver of catalog) {
      if (text.toLowerCase().includes(paver.name.toLowerCase())) {
        matchedPaver = paver;
        break;
      }
    }
  }

  const paver = matchedPaver || catalog[0]; // fallback
  const finish = parsedItem.finish || 'classic';
  const color = parsedItem.color || 'Cement Gray';
  const isColored = !color.toLowerCase().includes('gray') && !color.toLowerCase().includes('cement');
  const surchargePerSqm = isColored ? 300 : 0;

  const baseVatInc = paver.pricesVatInc[finish] || paver.pricesVatInc.classic || 0;
  const unitPriceNonVat = calculatePaverUnitPrice(baseVatInc, paver.pcsPerSqm, isColored, surchargePerSqm);

  let pieces = parsedItem.pieces;
  let sqm = parsedItem.sqm;

  if (sqm && !pieces) {
    pieces = sqmToPieces(sqm, paver.pcsPerSqm);
  } else if (pieces && !sqm) {
    sqm = Math.round((pieces / paver.pcsPerSqm) * 100) / 100;
  } else if (!pieces && !sqm) {
    pieces = 1000;
    sqm = Math.round((pieces / paver.pcsPerSqm) * 100) / 100;
  }

  const totalNonVat = Math.round((pieces! * unitPriceNonVat + Number.EPSILON) * 100) / 100;

  // Format description matching Kuma standard:
  // e.g. "G2 Pervious Mid Square - 300x300x60mm" or "Square paver - 200x200x60mm"
  const finishPrefix = finish === 'classic' ? 'Classic' : finish.toUpperCase() + ' Pervious';
  const displayName = `${finishPrefix} ${paver.defaultDisplayName || paver.name} - ${paver.dimensions}`;

  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    type: 'paver',
    paverId: paver.id,
    category: paver.category,
    name: paver.name,
    finish,
    dimensions: paver.dimensions,
    pcsPerSqm: paver.pcsPerSqm,
    color,
    isColoredSurcharge: isColored,
    colorSurchargePerSqm: surchargePerSqm,
    sqm,
    pieces,
    description: displayName,
    details: `• ${paver.pcsPerSqm} pcs/sqm\n${sqm} SQM\n• Color:${color}`,
    unitPriceVatInc: baseVatInc,
    unitPriceNonVat,
    totalNonVat
  };
}
