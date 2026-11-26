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

const KNOWN_FIELD_PREFIX_REGEX =
  /^(?:client_name|client\s+name|company_name|company\s+name|contact_number|contact\s+number|email(?:\s+address)?|project_name|project\s+name|project_location|project\s+location|additional_message|estimate_summary)\b/i;

/**
 * Cleans OCR artifacts and fixes known character recognition errors for Philippine locations,
 * company abbreviations, dimensions, and special characters (such as "ñ" misread as "fi", "ia", or "n").
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

  // 6. Fix Brgy. misreads (e.g. Bray., Brqy., Broy., Brgv., 8rgy.)
  cleaned = cleaned.replace(/\b(?:Bray|Brqy|Broy|Brgv|8rgy)\.\s*/g, 'Brgy. ');

  // 7. Fix Reqular -> Regular
  cleaned = cleaned.replace(/\bReqular\b/gi, 'Regular');

  // 8. Fix OCR digit/unit misreads in dimension tokens like (200x20@x60mmn) or 200x20Ox60mrn
  cleaned = cleaned.replace(
    /(\d[\d@OoIl]*\s*[x×X]\s*[\d@OoIl]+(?:\s*[x×X]\s*[\d@OoIl]+)?)\s*(?:mmn|mrn|mnm|mm)\b/gi,
    (_, dims: string) => {
      const normalizedDims = dims
        .replace(/[@Oo]/g, '0')
        .replace(/[Il]/g, '1')
        .replace(/\s*[x×X]\s*/g, 'x');
      return `${normalizedDims}mm`;
    }
  );

  return cleaned;
}

/**
 * Extracts a single-line field value without ever crossing newlines into the next row.
 */
function extractFieldValue(
  text: string,
  labelRegex: RegExp
): { found: boolean; value: string } {
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmedLine = rawLine.replace(/^[|│[\]\s]+|[|│[\]\s]+$/g, '').trim();
    if (!trimmedLine) continue;

    const match = trimmedLine.match(labelRegex);
    if (!match) continue;

    const remainder = trimmedLine.slice(match[0].length);
    if (!remainder || /^[ \t:|│]*$/.test(remainder)) {
      return { found: true, value: '' };
    }

    const sepMatch = remainder.match(/^(?:[ \t]*[:|│\t][ \t]*|[ \t]+)(.+)$/);
    if (!sepMatch) continue;

    let value = sepMatch[1].replace(/^[:|│\s]+/, '').trim();
    if (KNOWN_FIELD_PREFIX_REGEX.test(value)) {
      value = '';
    }

    return { found: true, value };
  }

  return { found: false, value: '' };
}

function normalizeOcrDigits(raw: string): string {
  return raw.replace(/[Il]/g, '1').replace(/[Oo]/g, '0').replace(/\s+/g, '');
}

function parseOcrInteger(raw: string): number | undefined {
  let cleaned = normalizeOcrDigits(raw).replace(/,/g, '');
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function parseOcrFloat(raw: string): number | undefined {
  const cleaned = normalizeOcrDigits(raw).replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function normalizeDims(value: string): string {
  return value.toLowerCase().replace(/\s*[×xX]\s*/g, 'x').replace(/\s+/g, '');
}

/**
 * Parses quotation request text from email, form submissions, or OCR
 */
export function parseQuotationRequestText(rawText: string): ParsedRequest {
  const cleanedText = cleanOcrText(rawText);
  const result: ParsedRequest = {
    items: []
  };

  // Extract single-line key-value pairs (never bleeding across newlines)
  const clientField = extractFieldValue(cleanedText, /^(?:client_name|client[ \t]+name)\b/i);
  if (clientField.found && clientField.value) {
    result.clientName = cleanOcrText(clientField.value);
  }

  const companyField = extractFieldValue(cleanedText, /^(?:company_name|company[ \t]+name|company)\b/i);
  if (companyField.found) {
    result.companyName = companyField.value ? cleanOcrText(companyField.value) : '';
  }

  const contactField = extractFieldValue(cleanedText, /^(?:contact_number|contact[ \t]+number|phone|mobile)\b/i);
  if (contactField.found && contactField.value) {
    result.contactNumber = contactField.value;
  }

  const emailField = extractFieldValue(cleanedText, /^(?:email(?:[ \t]+address)?)\b/i);
  if (emailField.found && emailField.value) {
    const compactEmail = emailField.value.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
    const emailMatch = compactEmail.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) result.email = emailMatch[0];
  }

  let projectField = extractFieldValue(cleanedText, /^(?:project_name|project[ \t]+name)\b/i);
  if (!projectField.found) {
    projectField = extractFieldValue(cleanedText, /^project[ \t]*:/i);
  }
  if (projectField.found && projectField.value) {
    result.projectName = cleanOcrText(projectField.value);
  }

  const locationField = extractFieldValue(
    cleanedText,
    /^(?:project_location|project[ \t]+location|location|site[ \t]+address)\b/i
  );
  if (locationField.found && locationField.value) {
    result.projectLocation = cleanOcrText(locationField.value);
  }

  // Parse items from estimate itemization section when present (prevents address numbers from creating false items)
  const itemSectionMatch = cleanedText.match(/PROJECT\s+ESTIMATE\s+ITEMIZATION[\s\S]*/i);
  const itemSourceText = itemSectionMatch ? itemSectionMatch[0] : cleanedText;

  // Split item blocks on line starts: "1. Square: Regular (200x200x60mm)..."
  const itemBlocks = itemSourceText.split(
    /(?:^|\r?\n)[ \t|│]*(?:estimate[_\s]*summar\w*[ \t|│]+)?(?=\d+\s*[\.\)]\s*[A-Za-z])/i
  );

  for (const rawBlock of itemBlocks) {
    if (!rawBlock.trim()) continue;

    // Strip trailing summary footer lines from the block
    const block = rawBlock
      .split(/\r?\n[ \t]*(?:subtotal\b|grand\s+total\b|[-=_]{4,}[ \t]*(?:\r?\n|$))/i)[0]
      .trim();
    if (!block) continue;

    // Check if this block describes a line item
    const headerMatch = block.match(/^\s*(\d+)\s*[\.\)]\s*([^\n\r]+)/);
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

    const qtyLineMatch = block.match(/Quantity\s*[:;.\t]?\s*([^\n\r]+)/i);
    if (qtyLineMatch) {
      const qtyLine = qtyLineMatch[1];

      const pcsInLine =
        qtyLine.match(/([0-9IlOo][0-9IlOo,.\s]*?)\s*(?:pcs|pieces|pes|pos|pc)\b/i) ||
        qtyLine.match(/([0-9IlOo][0-9IlOo,.]*)\s*(?:[A-Za-z]{1,4}\s*)?\(/);
      if (pcsInLine) {
        pieces = parseOcrInteger(pcsInLine[1]);
      }

      const sqmInLine = qtyLine.match(
        /\(\s*([0-9IlOo][0-9IlOo,.]*)\s*(?:m[²2³°?*º^]?|sqm|sq\.?\s*m\.?)?[^\d\n)]*\)/i
      );
      if (sqmInLine) {
        sqm = parseOcrFloat(sqmInLine[1]);
      }
    }

    // Block-wide fallbacks if either is still undefined
    if (pieces === undefined) {
      const pcsMatch = block.match(/([0-9IlOo][0-9IlOo,.]*)\s*(?:pcs|pieces|pes|pos)\b/i);
      if (pcsMatch) {
        pieces = parseOcrInteger(pcsMatch[1]);
      }
    }

    if (sqm === undefined) {
      const sqmMatch =
        block.match(
          /([0-9IlOo][0-9IlOo,.]*)\s*(?:m²|m2|m\^2|sqm|sq\.?\s*m\.?|m[°?º*³](?=[\s\)\.,;]|$))/i
        ) || block.match(/\(\s*([0-9IlOo][0-9IlOo,.]*)\s*m[^\w\n)]*\)/i);
      if (sqmMatch) {
        sqm = parseOcrFloat(sqmMatch[1]);
      }
    }

    result.items.push({
      productName: itemTitle,
      finish,
      color,
      pieces,
      sqm,
      rawText: block
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
  const normalizedText = normalizeDims(text);

  // Try to find matching catalog item by category and name or dimensions
  let matchedPaver: PaverItem | undefined;

  for (const paver of catalog) {
    const dimMatch = normalizedText.includes(normalizeDims(paver.dimensions));
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
      if (normalizedText.includes(normalizeDims(paver.dimensions))) {
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
