import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PaverItem, PaverFinish, INITIAL_PAVER_CATALOG, STANDARD_COLORS } from '../data/paverCatalog';
import {
  QuotationLineItem,
  QuotationDiscount,
  QuotationDelivery,
  calculatePaverUnitPrice,
} from './pricingCalculator';
import { cleanOcrText } from './requestParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface ParsedPdfQuotation {
  quotationNumber?: string;
  date?: string;
  clientName?: string;
  companyName?: string;
  projectName?: string;
  projectLocation?: string;
  tableHeaderTitle?: string;
  items: QuotationLineItem[];
  discount?: QuotationDiscount;
  delivery?: QuotationDelivery;
  previewImageUrl?: string;
}

function parsePhpAmount(str: string = ''): number {
  const cleaned = str.replace(/,/g, '');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? Math.abs(parseFloat(match[0])) : 0;
}

/**
 * Matches a parsed paver row from an existing PDF to the catalog while preserving its exact values
 */
function buildLineItemFromPdfRow(
  lines: string[],
  col2: string,
  col3: string,
  col4: string,
  catalog: PaverItem[]
): QuotationLineItem {
  const titleLine = lines[0] || '';
  const bodyText = lines.join('\n');

  // Check if this is a custom fee row (no PCS in col2 and no pcs/sqm in description)
  const hasPcsSqm = /pcs\/sqm/i.test(bodyText);
  const hasPcsCol = /PCS/i.test(col2);

  if (!hasPcsSqm && !hasPcsCol) {
    const amount = parsePhpAmount(col4) || parsePhpAmount(col3);
    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'custom',
      description: titleLine,
      details: lines.slice(1).join('\n'),
      pieces: 1,
      unitPriceNonVat: amount,
      totalNonVat: amount,
    };
  }

  // Extract pcsPerSqm, sqm, color from description lines
  let pcsPerSqm = 50;
  const pcsSqmMatch = bodyText.match(/([\d.]+)\s*pcs\/sqm/i);
  if (pcsSqmMatch) {
    pcsPerSqm = parseFloat(pcsSqmMatch[1]);
  }

  let sqm = 0;
  const sqmMatch = bodyText.match(/([\d,.]+)\s*SQM/i);
  if (sqmMatch) {
    sqm = parseFloat(sqmMatch[1].replace(/,/g, ''));
  }

  let color = 'Cement Gray';
  const colorMatch = bodyText.match(/Color\s*:\s*([^\n\r]+)/i);
  if (colorMatch) {
    color = colorMatch[1].trim();
  }

  // Extract pieces, unitPriceNonVat, totalNonVat
  let pieces = 0;
  const pcsMatch = col2.replace(/,/g, '').match(/(\d+)\s*PCS/i);
  if (pcsMatch) {
    pieces = parseInt(pcsMatch[1], 10);
  } else if (sqm && pcsPerSqm) {
    pieces = Math.ceil(sqm * pcsPerSqm);
  }

  if (!sqm && pieces && pcsPerSqm) {
    sqm = Math.round((pieces / pcsPerSqm) * 100) / 100;
  }

  const parsedUnitPrice = parsePhpAmount(col3);
  const parsedTotal = parsePhpAmount(col4);

  // Determine finish from titleLine
  let finish: PaverFinish = 'classic';
  if (/\bG1\b/i.test(titleLine)) finish = 'g1';
  else if (/\bG2\b/i.test(titleLine)) finish = 'g2';
  else if (/\bG3\b/i.test(titleLine)) finish = 'g3';

  // Match catalog item by dimensions first, then name
  let matchedPaver: PaverItem | undefined;
  for (const p of catalog) {
    if (titleLine.toLowerCase().includes(p.dimensions.toLowerCase())) {
      matchedPaver = p;
      break;
    }
  }
  if (!matchedPaver) {
    for (const p of catalog) {
      if (
        (p.defaultDisplayName &&
          titleLine.toLowerCase().includes(p.defaultDisplayName.toLowerCase())) ||
        titleLine.toLowerCase().includes(p.name.toLowerCase())
      ) {
        matchedPaver = p;
        break;
      }
    }
  }

  const paver = matchedPaver || catalog[0];
  const baseVatInc = paver.pricesVatInc[finish] || paver.pricesVatInc.classic || 0;

  const isStandardColor = STANDARD_COLORS.some(
    (c) => c.name.toLowerCase() === color.toLowerCase()
  );
  const isGray =
    color.toLowerCase().includes('cement') || color.toLowerCase() === 'gray';
  const isColored = !isGray;

  // Estimate custom surcharge if unit price differs from standard
  const standardNonVat = calculatePaverUnitPrice(baseVatInc, pcsPerSqm, false, 0);
  let colorSurchargePerSqm = isColored ? 300 : 0;
  if (parsedUnitPrice > 0 && isColored && matchedPaver) {
    const diffPerPc = Math.max(0, parsedUnitPrice - standardNonVat);
    const inferredSurcharge = Math.round(diffPerPc * pcsPerSqm);
    if (Math.abs(inferredSurcharge - 300) <= 5) {
      colorSurchargePerSqm = 300;
    } else if (inferredSurcharge > 0) {
      colorSurchargePerSqm = inferredSurcharge;
    }
  }

  const unitPriceNonVat =
    parsedUnitPrice ||
    calculatePaverUnitPrice(baseVatInc, pcsPerSqm, isColored, colorSurchargePerSqm);
  const totalNonVat =
    parsedTotal || Math.round((pieces * unitPriceNonVat + Number.EPSILON) * 100) / 100;

  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'paver',
    paverId: paver.id,
    category: paver.category,
    name: paver.name,
    finish,
    dimensions: matchedPaver ? paver.dimensions : titleLine.match(/\d+x\d+x\d+mm/i)?.[0] || paver.dimensions,
    pcsPerSqm,
    color,
    isCustomColor: !isStandardColor,
    isColoredSurcharge: isColored,
    colorSurchargePerSqm,
    sqm,
    pieces,
    description: titleLine,
    details: `• ${pcsPerSqm} pcs/sqm\n${sqm.toFixed(2)} SQM\n• Color:${color}`,
    unitPriceVatInc: baseVatInc,
    unitPriceNonVat,
    totalNonVat,
  };
}

/**
 * Parses an uploaded existing Kuma Concrete Quotation PDF file
 */
export async function parseExistingQuotationPdf(
  file: File,
  catalog: PaverItem[] = INITIAL_PAVER_CATALOG
): Promise<ParsedPdfQuotation> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let quotationNumber = '';
  let date = '';
  let clientName = '';
  let companyName = '';
  let projectName = '';
  let projectLocation = '';
  let tableHeaderTitle = 'Paver (Delivered)';

  const items: QuotationLineItem[] = [];
  let discount: QuotationDiscount | undefined;
  let delivery: QuotationDelivery | undefined;
  let previewImageUrl: string | undefined;

  // Render Page 1 to canvas for the Reference Dock preview
  try {
    const firstPage = await doc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await firstPage.render({ canvasContext: ctx, viewport }).promise;
      previewImageUrl = canvas.toDataURL('image/png');
    }
  } catch (e) {
    console.warn('Could not render PDF page preview:', e);
  }

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();

    const rawItems = tc.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => ({
        str: it.str.trim() as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
      }));

    // Skip Terms and Conditions pages
    const isTermsPage = rawItems.some(
      (it) =>
        /^I\.\s*Terms and Conditions/i.test(it.str) ||
        /^C\.\s*Product Quality/i.test(it.str)
    );
    if (isTermsPage) continue;

    if (p === 1) {
      const qMatch = rawItems.find((it) => /\d{4}-[A-Z]+-Q-\d+/i.test(it.str));
      if (qMatch) quotationNumber = qMatch.str;

      const dMatch = rawItems.find((it) => it.y > 690 && it.x > 380);
      if (dMatch) date = dMatch.str;

      const cMatches = rawItems
        .filter((it) => it.y > 640 && it.y <= 705 && it.x > 350)
        .sort((a, b) => b.y - a.y);

      if (cMatches.length === 1) {
        const text = cleanOcrText(cMatches[0].str);
        if (/Inc|Corp|LLC|Ltd|Construction|Holdings|Builders|Architects|Development/i.test(text)) {
          companyName = text;
        } else {
          clientName = text;
        }
      } else if (cMatches.length >= 2) {
        const t0 = cleanOcrText(cMatches[0].str);
        const t1 = cleanOcrText(cMatches[1].str);
        if (/Inc|Corp|LLC|Ltd|Construction|Holdings|Builders|Architects|Development/i.test(t0)) {
          companyName = t0;
          clientName = t1;
        } else if (/Inc|Corp|LLC|Ltd|Construction|Holdings|Builders|Architects|Development/i.test(t1)) {
          companyName = t1;
          clientName = t0;
        } else {
          companyName = t0;
          clientName = t1;
        }
      }

      const pMatch = rawItems.find((it) => /Project Name:/i.test(it.str));
      if (pMatch) {
        projectName = cleanOcrText(pMatch.str.replace(/Project Name:\s*/i, '').trim());
        const locMatch = rawItems.filter(
          (it) =>
            it.y < pMatch.y - 4 &&
            it.y > pMatch.y - 25 &&
            it.x > 140 &&
            it.x < 450
        );
        if (locMatch.length) {
          projectLocation = cleanOcrText(locMatch.map((l) => l.str).join(' '));
        }
      }

      const thMatch = rawItems.find(
        (it) => it.y > 550 && it.y < 585 && it.x < 250 && !/Good day|thankful|pleased/i.test(it.str)
      );
      if (thMatch) tableHeaderTitle = thMatch.str;
    }

    // Identify table Y range on this page
    const headerBottomItem = rawItems.find((it) => /PRICE\/PC|AMMOUNT/i.test(it.str));
    const tableTopY = headerBottomItem ? headerBottomItem.y - 5 : 800;
    const totalAmtItem = rawItems.find((it) => /^Total Amount$/i.test(it.str));
    const tableBottomY = totalAmtItem ? totalAmtItem.y + 5 : 100;

    const tableItems = rawItems.filter(
      (it) => it.y <= tableTopY && it.y >= tableBottomY
    );

    // Group column 1 (x < 260) by Y line
    const col1Items = tableItems
      .filter((it) => it.x < 260)
      .sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));

    const col1Lines: { y: number; text: string }[] = [];
    for (const it of col1Items) {
      const last = col1Lines[col1Lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 3) {
        last.text += ' ' + it.str;
      } else {
        col1Lines.push({ y: it.y, text: it.str });
      }
    }

    // Segment col1Lines into logical blocks
    const blocks: { topY: number; bottomY: number; lines: string[] }[] = [];
    for (let i = 0; i < col1Lines.length; i++) {
      const line = col1Lines[i];
      const prevLine = col1Lines[i - 1];
      const nextLine = col1Lines[i + 1];

      const isDiscount = /discount/i.test(line.text);
      const isDelivery = /^•\s*(For Delivery|Delivered to|Delivery|For Paver Packaging)/i.test(line.text);
      const prevWasColor = prevLine && /^•\s*Color\s*:/i.test(prevLine.text);
      const nextIsPcsSqm = nextLine && /pcs\/sqm/i.test(nextLine.text);
      const largeGap = prevLine && prevLine.y - line.y > 20;

      if (
        i === 0 ||
        isDiscount ||
        isDelivery ||
        prevWasColor ||
        nextIsPcsSqm ||
        largeGap
      ) {
        blocks.push({ topY: line.y, bottomY: line.y, lines: [line.text] });
      } else {
        const curBlock = blocks[blocks.length - 1];
        curBlock.bottomY = line.y;
        curBlock.lines.push(line.text);
      }
    }

    // Match col2, col3, col4 for each block
    for (let b = 0; b < blocks.length; b++) {
      const blk = blocks[b];
      const nextBlk = blocks[b + 1];
      const upperY = blk.topY + 6;
      const lowerY = nextBlk ? (blk.bottomY + nextBlk.topY) / 2 : tableBottomY;

      const col2 = tableItems
        .filter((it) => it.x >= 260 && it.x < 375 && it.y <= upperY && it.y > lowerY)
        .map((i) => i.str)
        .join(' ');
      const col3 = tableItems
        .filter((it) => it.x >= 375 && it.x < 465 && it.y <= upperY && it.y > lowerY)
        .map((i) => i.str)
        .join(' ');
      const col4 = tableItems
        .filter((it) => it.x >= 465 && it.y <= upperY && it.y > lowerY)
        .map((i) => i.str)
        .join(' ');

      const fullBlockText = blk.lines.join(' ');

      // 1. Check if Discount Row
      if (/discount/i.test(fullBlockText)) {
        const pctMatch = fullBlockText.match(/([\d.]+)\s*%/);
        const discAmount = parsePhpAmount(col4);
        discount = {
          enabled: true,
          type: pctMatch ? 'percentage' : 'fixed',
          value: pctMatch ? parseFloat(pctMatch[1]) : discAmount,
          amount: discAmount,
          label: fullBlockText.trim(),
        };
        continue;
      }

      // 2. Check if Delivery / Pickup Packaging Row
      if (
        /^•\s*(For Delivery|Delivered to|Delivery|For Paver Packaging)/i.test(fullBlockText) ||
        /Deliver(?:y|ies)/i.test(col2)
      ) {
        const isPickupRow = /packaging|loading fee/i.test(fullBlockText);
        delivery = {
          enabled: true,
          mode: isPickupRow ? 'pickup' : 'delivery',
          description: fullBlockText.trim(),
          deliveriesCount: col2.trim(),
          amount: parsePhpAmount(col4),
        };
        continue;
      }

      // 3. Otherwise Paver Item or Custom Fee Item
      items.push(buildLineItemFromPdfRow(blk.lines, col2, col3, col4, catalog));
    }
  }

  return {
    quotationNumber: quotationNumber || undefined,
    date: date || undefined,
    clientName: clientName || undefined,
    companyName: companyName || undefined,
    projectName: projectName || undefined,
    projectLocation: projectLocation || undefined,
    tableHeaderTitle: tableHeaderTitle || undefined,
    items,
    discount,
    delivery,
    previewImageUrl,
  };
}
