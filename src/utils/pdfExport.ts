import jsPDF from 'jspdf';
import { QuotationData, DEFAULT_TERMS_PAGE_1, DEFAULT_TERMS_PAGE_2 } from './storage';
import { calculateQuotationSummary, formatPHP, QuotationLineItem } from './pricingCalculator';
import { parseTermsText, FormattedTermsLine, RichTextRun } from './termsFormatter';

/**
 * Triggers browser native print dialog with pre-configured print styling
 */
export function printQuotation(): void {
  window.print();
}

/**
 * Loads an image URL and returns a base64 data URL along with its natural dimensions
 */
async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Normalizes Unicode punctuation to WinAnsi-safe equivalents for built-in PDF fonts
 */
function sanitizePdfText(str: string = ''): string {
  return str
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u20B1/g, 'PHP ');
}

/**
 * Renders a paragraph with mixed bold/italic/underline/size runs and automatic line wrapping
 */
function renderMixedParagraph(
  doc: jsPDF,
  runs: RichTextRun[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  defaultFontSize: number = 9.2
): number {
  if (runs.length === 0 || runs.every((r) => !r.text.trim())) {
    return y + lineHeight * 0.65;
  }

  // Tokenize runs into words preserving bold/italic/underline/size state and spaces
  const tokens: {
    word: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    fontSize: number;
  }[] = [];

  for (const run of runs) {
    const sanitized = sanitizePdfText(run.text);
    const parts = sanitized.split(/(\s+)/);
    const runSize = run.fontSizePt ?? defaultFontSize;
    for (const part of parts) {
      if (part.length > 0) {
        tokens.push({
          word: part,
          bold: !!run.bold,
          italic: !!run.italic,
          underline: !!run.underline,
          fontSize: runSize,
        });
      }
    }
  }

  let cursorX = x;
  let cursorY = y;
  let currentLineMaxSize = defaultFontSize;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isWhitespace = /^\s+$/.test(token.word);

    // Skip leading whitespace at the beginning of a wrapped line
    if (cursorX === x && isWhitespace) {
      continue;
    }

    const fontStyle =
      token.bold && token.italic
        ? 'bolditalic'
        : token.bold
        ? 'bold'
        : token.italic
        ? 'italic'
        : 'normal';

    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(token.fontSize);
    const tokenWidth = doc.getTextWidth(token.word);

    if (!isWhitespace && cursorX + tokenWidth > x + maxWidth && cursorX > x) {
      cursorX = x;
      cursorY += Math.max(lineHeight, currentLineMaxSize * 0.48);
      currentLineMaxSize = token.fontSize;
    } else {
      currentLineMaxSize = Math.max(currentLineMaxSize, token.fontSize);
    }

    doc.text(token.word, cursorX, cursorY);

    if (token.underline) {
      const nextToken = tokens[i + 1];
      const skipTrailingSpaceUnderline = isWhitespace && (!nextToken || !nextToken.underline);
      if (!skipTrailingSpaceUnderline) {
        doc.setDrawColor(20, 20, 20);
        doc.setLineWidth(Math.max(0.2, token.fontSize * 0.025));
        const underlineY = cursorY + Math.max(0.5, token.fontSize * 0.07);
        doc.line(cursorX, underlineY, cursorX + tokenWidth, underlineY);
      }
    }

    cursorX += tokenWidth;
  }

  doc.setFontSize(defaultFontSize);
  return cursorY + Math.max(lineHeight, currentLineMaxSize * 0.48);
}

/**
 * Renders structured FormattedTermsLine array onto a jsPDF page
 */
function renderFormattedTermsToPdf(
  pdf: jsPDF,
  lines: FormattedTermsLine[],
  startX: number,
  startY: number,
  maxWidth: number,
  baseFontSizePt: number = 9.2
): number {
  let ty = startY;
  const lineHeight = Math.max(4.0, baseFontSizePt * 0.5);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.type === 'roman-header') {
      if (i > 0) ty += 1.4;
      const headerSize = line.fontSizePt ?? baseFontSizePt + 1.3;
      const headerRuns = line.runs.map((r) => ({ ...r, bold: r.bold !== false }));
      ty = renderMixedParagraph(pdf, headerRuns, startX, ty, maxWidth, 5.0, headerSize);
    } else if (line.type === 'letter-header') {
      if (i > 0) ty += 1.0;
      const subSize = line.fontSizePt ?? baseFontSizePt + 0.3;
      const subRuns = line.runs.map((r) => ({ ...r, bold: r.bold !== false }));
      ty = renderMixedParagraph(pdf, subRuns, startX, ty, maxWidth, lineHeight, subSize);
    } else {
      const firstText = line.runs[0]?.text || '';
      if (/^\d+\.\s+/.test(firstText) && i > 0) {
        ty += 0.4;
      }
      ty = renderMixedParagraph(pdf, line.runs, startX, ty, maxWidth, lineHeight, baseFontSizePt);
    }
  }

  return ty;
}

/**
 * Generates the standardized PDF filename requested by Kuma Concrete:
 * Format: [Quotation Number] - [Company Name] - [Project Name].pdf
 * e.g. "2026-KPS-Q-196 - JOC Fabrication and Construction Corporation - Parañaque Bridge.pdf"
 * Falls back gracefully to Client Name if Company Name is not specified.
 */
export function getQuotationPdfFilename(quote: QuotationData): string {
  const parts: string[] = [];

  const quoteNum = (quote.quotationNumber || '').trim();
  if (quoteNum) {
    parts.push(quoteNum);
  }

  // Company Name is preferred; fallback to Client Name if empty
  const entityName = (quote.companyName || quote.clientName || '').trim();
  if (entityName) {
    parts.push(entityName);
  }

  const projName = (quote.projectName || '').trim();
  if (projName) {
    parts.push(projName);
  }

  if (parts.length === 0) {
    return 'Kuma Concrete Quotation.pdf';
  }

  // Join with ' - ' and remove invalid filesystem characters
  const rawBase = parts.join(' - ');
  const safeBase = rawBase
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safeBase}.pdf`;
}

/**
 * Generates and downloads a true vector multi-page PDF matching Kuma Concrete's reference quotations
 */
export async function downloadQuotationPdf(
  quote: QuotationData,
  filename?: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const finalFilename = filename || getQuotationPdfFilename(quote);
  onProgress?.('Loading high-resolution branding assets...');

  const [bgImg, logoImg, badgeG1, badgeG2, badgeG3] = await Promise.all([
    loadImageDataUrl('/background_updated.png'),
    loadImageDataUrl('/logo_header.jpeg'),
    loadImageDataUrl('/badge_g1.png').catch(() => null),
    loadImageDataUrl('/badge_g2.png').catch(() => null),
    loadImageDataUrl('/badge_g3.png').catch(() => null),
  ]);

  const badges: Record<string, { dataUrl: string; width: number; height: number } | null> = {
    g1: badgeG1,
    g2: badgeG2,
    g3: badgeG3,
  };

  onProgress?.('Building vector PDF document...');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const vatConfig = quote.vatConfig || {
    enabled: true,
    rate: 12,
    label: 'Plus: 12% Vat',
    showZeroVatRow: true,
  };
  const summary = calculateQuotationSummary(
    quote.items,
    quote.discount,
    quote.delivery,
    vatConfig
  );

  // Split items across pages if more than 5 items
  const needsTwoTablePages = quote.items.length > 5;
  const page1Items = needsTwoTablePages ? quote.items.slice(0, 5) : quote.items;
  const page2Items = needsTwoTablePages ? quote.items.slice(5) : [];

  // Helper to draw background & footer on the current page
  const drawPageTemplate = (pageNumber: number) => {
    // Full-page background watermark (210mm x 297mm)
    pdf.addImage(bgImg.dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');

    // Page number (bottom center, italic)
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(pageNumber), 105, 288, { align: 'center' });

    // Quotation Number (bottom right)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 30, 30);
    pdf.text(sanitizePdfText(quote.quotationNumber || ''), 203, 288, { align: 'right' });
  };

  // =========================================================================
  // PAGE 1: Header + Quotation Table
  // =========================================================================
  let currentPage = 1;
  drawPageTemplate(currentPage);

  // Header Logo (Top Left)
  pdf.addImage(logoImg.dataUrl, 'JPEG', 7, 17, 68, 46, undefined, 'FAST');

  // Date & Client / Company Name (Top Right)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text(sanitizePdfText(quote.date || ''), 202, 41, { align: 'right' });

  let headerY = 51;
  const company = (quote.companyName || '').trim();
  const client = (quote.clientName || '').trim();

  if (company && client) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(sanitizePdfText(company), 202, headerY, { align: 'right' });
    headerY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(sanitizePdfText(client), 202, headerY, { align: 'right' });
  } else if (company) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(sanitizePdfText(company), 202, 55, { align: 'right' });
  } else if (client) {
    pdf.setFont('helvetica', 'normal');
    pdf.text(sanitizePdfText(client), 202, 55, { align: 'right' });
  }

  // Project Name & Location (Centered)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Project Name: ${sanitizePdfText(quote.projectName || '')}`, 108, 69, {
    align: 'center',
  });
  pdf.setFontSize(9.5);
  pdf.text(sanitizePdfText(quote.projectLocation || ''), 108, 74, { align: 'center' });

  // Greeting
  const greetX = 26;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Good day!', greetX, 79);
  pdf.text(
    'We are thankful with your interest in our products and services, in compliance with your request,',
    greetX,
    84
  );
  pdf.text('we are pleased to submit our quotation as follows:', greetX, 89);

  // Section Title: Paver (Delivered) / Paver (Pick-up) / Custom
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(192, 0, 0);
  pdf.text(sanitizePdfText(quote.tableHeaderTitle || 'Paver (Delivered)'), greetX, 97.5);
  pdf.setTextColor(20, 20, 20);

  // Table Geometry
  const tableX = 6.5;
  const col1W = 90.5; // Description: 6.5 -> 97.0
  const col2W = 37.5; // Approx Amount: 97.0 -> 134.5
  const col3W = 32.5; // Unit Price/PC: 134.5 -> 167.0
  const col4W = 36.5; // Total: 167.0 -> 203.5
  const tableW = col1W + col2W + col3W + col4W; // 197mm

  const col1X = tableX;
  const col2X = col1X + col1W;
  const col3X = col2X + col2W;
  const col4X = col3X + col3W;

  const drawTableHeader = (startY: number): number => {
    const headerH = 10;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.rect(tableX, startY, tableW, headerH);
    pdf.line(col2X, startY, col2X, startY + headerH);
    pdf.line(col3X, startY, col3X, startY + headerH);
    pdf.line(col4X, startY, col4X, startY + headerH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(20, 20, 20);

    pdf.text('DESCRIPTION', col1X + col1W / 2, startY + 6.2, { align: 'center' });
    pdf.text('APPROX.', col2X + col2W / 2, startY + 4.3, { align: 'center' });
    pdf.text('AMMOUNT', col2X + col2W / 2, startY + 8.3, { align: 'center' });
    pdf.text('UNIT', col3X + col3W / 2, startY + 4.3, { align: 'center' });
    pdf.text('PRICE/PC', col3X + col3W / 2, startY + 8.3, { align: 'center' });
    pdf.text('TOTAL', col4X + col4W / 2, startY + 6.2, { align: 'center' });

    return startY + headerH;
  };

  const drawItemRow = (item: QuotationLineItem, startY: number): number => {
    const hasBadge = item.finish && item.finish !== 'classic' && badges[item.finish];
    const descMaxW = hasBadge ? col1W - 22 : col1W - 3;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const titleLines: string[] = pdf.splitTextToSize(sanitizePdfText(item.description || ''), descMaxW);

    const detailLines: string[] = [];
    if (item.details) {
      const rawLines = sanitizePdfText(item.details).split('\n');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      for (const rl of rawLines) {
        const wrapped: string[] = pdf.splitTextToSize(rl, descMaxW);
        detailLines.push(...wrapped);
      }
    } else if (item.type === 'paver') {
      if (item.pcsPerSqm) detailLines.push(`• ${item.pcsPerSqm} pcs/sqm`);
      if (item.sqm !== undefined) detailLines.push(`${item.sqm} SQM`);
      if (item.color) detailLines.push(`• Color: ${sanitizePdfText(item.color)}`);
    }

    const totalLines = titleLines.length + detailLines.length;
    const rowH = Math.max(18.5, totalLines * 4.3 + 3);

    // Draw row borders
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.rect(tableX, startY, tableW, rowH);
    pdf.line(col2X, startY, col2X, startY + rowH);
    pdf.line(col3X, startY, col3X, startY + rowH);
    pdf.line(col4X, startY, col4X, startY + rowH);

    // Draw description title
    let textY = startY + 4.2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(20, 20, 20);
    for (const tl of titleLines) {
      pdf.text(tl, col1X + 1.2, textY);
      textY += 4.3;
    }

    // Draw details
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    for (const dl of detailLines) {
      pdf.text(dl, col1X + 1.2, textY);
      textY += 4.3;
    }

    // Draw pervious badge if applicable
    if (hasBadge && item.finish) {
      const b = badges[item.finish]!;
      const badgeW = 14.5;
      const badgeH = 12.5;
      const badgeX = col2X - badgeW - 3;
      const badgeY = startY + (rowH - badgeH) / 2;
      pdf.addImage(b.dataUrl, 'PNG', badgeX, badgeY, badgeW, badgeH, undefined, 'FAST');
    }

    const midY = startY + rowH / 2 + 1.2;

    // Approx Amount
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    const qtyText =
      item.type === 'custom'
        ? ''
        : item.pieces
        ? `${item.pieces.toLocaleString()} PCS`
        : item.sqm
        ? `${item.sqm} SQM`
        : '';
    if (qtyText) {
      pdf.text(qtyText, col2X + col2W / 2, midY, { align: 'center' });
    }

    // Unit Price/PC
    const unitPriceText =
      item.type === 'custom'
        ? ''
        : item.unitPriceNonVat
        ? formatPHP(item.unitPriceNonVat)
        : '';
    if (unitPriceText) {
      pdf.text(unitPriceText, col3X + col3W / 2, midY, { align: 'center' });
    }

    // Total
    pdf.text(formatPHP(item.totalNonVat), col4X + col4W / 2, midY, { align: 'center' });

    return startY + rowH;
  };

  const drawTotalsAndNotes = (startY: number): number => {
    let curY = startY;

    // 1. Paver Discount Row (if enabled)
    if (quote.discount.enabled && summary.discountAmount > 0) {
      const discH = 16;
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(tableX, curY, tableW, discH);
      pdf.line(col2X, curY, col2X, curY + discH);
      pdf.line(col3X, curY, col3X, curY + discH);
      pdf.line(col4X, curY, col4X, curY + discH);

      const discLabel = sanitizePdfText(
        quote.discount.label ||
          (quote.discount.type === 'percentage'
            ? `PAVER DISCOUNT: ${quote.discount.value.toFixed(2)}%`
            : 'PAVER DISCOUNT')
      );

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(192, 0, 0);
      pdf.text(discLabel, col1X + col1W / 2, curY + discH / 2 + 1.5, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.text(`-${formatPHP(summary.discountAmount)}`, col4X + col4W / 2, curY + discH / 2 + 1.2, {
        align: 'center',
      });
      pdf.setTextColor(20, 20, 20);
      curY += discH;
    }

    // 2. Delivery Row (if enabled)
    if (quote.delivery.enabled) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.8);
      const delivLines: string[] = pdf.splitTextToSize(
        sanitizePdfText(quote.delivery.description || ''),
        col1W - 4
      );
      const delivH = Math.max(9.5, delivLines.length * 4.2 + 2);

      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(tableX, curY, tableW, delivH);
      pdf.line(col2X, curY, col2X, curY + delivH);
      pdf.line(col3X, curY, col3X, curY + delivH);
      pdf.line(col4X, curY, col4X, curY + delivH);

      let dTextY = curY + 4.0;
      for (const dl of delivLines) {
        pdf.text(dl, col1X + col1W / 2, dTextY, { align: 'center' });
        dTextY += 4.2;
      }

      if (quote.delivery.deliveriesCount) {
        pdf.setFontSize(9.5);
        pdf.text(
          sanitizePdfText(quote.delivery.deliveriesCount),
          col2X + col2W / 2,
          curY + delivH / 2 + 1.2,
          { align: 'center' }
        );
      }

      pdf.setFontSize(9.5);
      pdf.text(formatPHP(summary.deliveryAmount), col4X + col4W / 2, curY + delivH / 2 + 1.2, {
        align: 'center',
      });

      curY += delivH;
    }

    // 3. Total Amount Row
    const sumRowH = 4.6;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.rect(tableX, curY, tableW, sumRowH);
    pdf.line(col2X, curY, col2X, curY + sumRowH);
    pdf.line(col3X, curY, col3X, curY + sumRowH);
    pdf.line(col4X, curY, col4X, curY + sumRowH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.text('Total Amount', col1X + col1W / 2, curY + 3.4, { align: 'center' });
    pdf.text(formatPHP(summary.totalBeforeVat), col4X + col4W / 2, curY + 3.4, { align: 'center' });
    curY += sumRowH;

    // 4. Plus: VAT / VAT Exempt Row
    if (vatConfig.enabled || vatConfig.showZeroVatRow !== false) {
      pdf.rect(tableX, curY, tableW, sumRowH);
      pdf.line(col2X, curY, col2X, curY + sumRowH);
      pdf.line(col3X, curY, col3X, curY + sumRowH);
      pdf.line(col4X, curY, col4X, curY + sumRowH);

      const vatLabel = sanitizePdfText(
        vatConfig.label ||
          (vatConfig.enabled ? `Plus: ${vatConfig.rate}% Vat` : 'VAT Exempt')
      );

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.text(vatLabel, col1X + col1W / 2, curY + 3.4, { align: 'center' });
      pdf.text(formatPHP(summary.vatAmount), col4X + col4W / 2, curY + 3.4, { align: 'center' });
      curY += sumRowH;
    }

    // 5. GRAND TOTAL CONTRACT PRICE Row
    const grandRowH = 5.0;
    pdf.rect(tableX, curY, tableW, grandRowH);
    pdf.line(col2X, curY, col2X, curY + grandRowH);
    pdf.line(col3X, curY, col3X, curY + grandRowH);
    pdf.line(col4X, curY, col4X, curY + grandRowH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.text('GRAND TOTAL CONTRACT PRICE', col1X + col1W / 2, curY + 3.6, { align: 'center' });

    const grandStr = formatPHP(summary.grandTotal);
    pdf.text(grandStr, col4X + col4W / 2, curY + 3.6, { align: 'center' });
    const grandW = pdf.getTextWidth(grandStr);
    pdf.setLineWidth(0.35);
    pdf.line(
      col4X + col4W / 2 - grandW / 2,
      curY + 4.2,
      col4X + col4W / 2 + grandW / 2,
      curY + 4.2
    );

    curY += grandRowH;

    // Footnote below table
    curY += 3.8;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.2);
    pdf.text(
      'Note : This quote is unit rate only. Any additional area will be charged per sqm. basis.',
      greetX,
      curY
    );
    curY += 4.5;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Any additional pavers or works shall be charged accordingly.', greetX, curY);

    return curY;
  };

  let curY = drawTableHeader(99.5);
  for (const item of page1Items) {
    curY = drawItemRow(item, curY);
  }

  if (!needsTwoTablePages) {
    drawTotalsAndNotes(curY);
  }

  // =========================================================================
  // OPTIONAL PAGE 2: Overflow Table Items + Totals
  // =========================================================================
  if (needsTwoTablePages) {
    pdf.addPage('a4', 'portrait');
    currentPage++;
    drawPageTemplate(currentPage);

    let p2Y = 19;
    for (const item of page2Items) {
      p2Y = drawItemRow(item, p2Y);
    }
    drawTotalsAndNotes(p2Y);
  }

  // =========================================================================
  // TERMS & CONDITIONS: Page 1 of Terms
  // =========================================================================
  onProgress?.('Rendering Terms & Conditions...');
  pdf.addPage('a4', 'portrait');
  currentPage++;
  drawPageTemplate(currentPage);

  const termsX = 26;
  const termsMaxW = 166;
  const baseTermsPt = quote.termsFontSize ?? 9.2;
  const lh = Math.max(4.0, baseTermsPt * 0.5);

  const parsedPage1 = parseTermsText(
    quote.termsPage1 ?? quote.termsAndConditions ?? DEFAULT_TERMS_PAGE_1,
    baseTermsPt
  );
  renderFormattedTermsToPdf(pdf, parsedPage1, termsX, 23, termsMaxW, baseTermsPt);

  // =========================================================================
  // TERMS & SIGNATURES: Page 2 of Terms + Payment Details + Signatures
  // =========================================================================
  pdf.addPage('a4', 'portrait');
  currentPage++;
  drawPageTemplate(currentPage);

  const parsedPage2 = parseTermsText(quote.termsPage2 ?? DEFAULT_TERMS_PAGE_2, baseTermsPt);
  let ty = renderFormattedTermsToPdf(pdf, parsedPage2, termsX, 23, termsMaxW, baseTermsPt);

  // V. Payment Details
  ty += 1.5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.text('V. Payment Details', termsX, ty);
  ty += 5.0;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.2);
  pdf.text('Please make all checks payable to:', termsX, ty);
  ty += lh;

  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(quote.paymentDetails?.payableTo || 'Kuma Concrete Inc.'), termsX, ty);
  ty += lh + 0.5;

  pdf.setFont('helvetica', 'bold');
  pdf.text('For Bank Deposits/Transfers:', termsX, ty);
  ty += lh;

  ty = renderMixedParagraph(
    pdf,
    [
      { text: '• Bank: ', bold: true },
      { text: quote.paymentDetails?.bankName || 'BDO (Banco de Oro)' },
    ],
    termsX,
    ty,
    termsMaxW,
    lh,
    9.2
  );
  ty = renderMixedParagraph(
    pdf,
    [
      { text: '• Account Number: ', bold: true },
      { text: quote.paymentDetails?.accountNumber || '008590004762' },
    ],
    termsX,
    ty,
    termsMaxW,
    lh,
    9.2
  );
  ty = renderMixedParagraph(
    pdf,
    [
      { text: '• Account Name: ', bold: true },
      { text: quote.paymentDetails?.accountName || 'Kuma Concrete Inc.' },
    ],
    termsX,
    ty,
    termsMaxW,
    lh,
    9.2
  );

  // Closing Line
  ty += 3.5;
  ty = renderMixedParagraph(
    pdf,
    [
      {
        text: 'We look forward to serving your requirements. Should you find the above in order, please sign below to indicate your conformity.',
      },
    ],
    termsX,
    ty,
    termsMaxW,
    lh,
    9.2
  );

  // Signatures Block
  ty += 9;
  const sigLeftX = 44.5;
  const sigRightX = 138;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Sincerely,', sigLeftX, ty);
  pdf.text("Client's Conforme:", sigRightX, ty);

  ty += 5.2;
  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(quote.signatory?.name || 'Enrico G. Vazquez'), sigLeftX, ty);

  // Signature line for Client's Conforme
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.35);
  pdf.line(sigRightX, ty + 2, sigRightX + 56, ty + 2);

  ty += 4.8;
  pdf.setFont('helvetica', 'normal');
  pdf.text(sanitizePdfText(quote.signatory?.title || 'President'), sigLeftX, ty);

  onProgress?.('Downloading PDF...');
  pdf.save(finalFilename);
}
