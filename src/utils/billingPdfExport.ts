import jsPDF from 'jspdf';
import { BillingStatementData, calculateBillingTotals } from './storage';
import { formatPHP } from './pricingCalculator';

function sanitizePdfText(str: string = ''): string {
  return str
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u20B1/g, 'PHP ');
}

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataUrl };
}

/**
 * Generates standardized Billing PDF filename:
 * Format: [Billing Number] - [Company/Client Name] - [Project Name].pdf
 */
export function getBillingPdfFilename(billing: BillingStatementData): string {
  const parts: string[] = [];

  const billingNum = (billing.billingNumber || '').trim();
  if (billingNum) parts.push(billingNum);

  const entityName = (billing.companyName || billing.clientName || '').trim();
  if (entityName) parts.push(entityName);

  const projName = (billing.projectName || '').trim();
  if (projName) parts.push(projName);

  if (parts.length === 0) return 'Kuma Concrete Billing Statement.pdf';

  const safeBase = parts
    .join(' - ')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safeBase}.pdf`;
}

/**
 * Generates and downloads a crisp vector 1-page Billing Statement PDF matching Kuma Concrete template
 */
export async function downloadBillingPdf(
  billing: BillingStatementData,
  filename?: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const finalFilename = filename || getBillingPdfFilename(billing);
  onProgress?.('Loading branding assets...');

  const [bgImg, logoImg] = await Promise.all([
    loadImageDataUrl('/background_updated.png'),
    loadImageDataUrl('/logo_header.jpeg'),
  ]);

  onProgress?.('Building Billing Statement PDF...');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const {
    totalPaymentsMade,
    amountDueForThisBilling,
    amountDueAfterThisBilling,
    hasBalanceAfterBilling,
  } = calculateBillingTotals(billing);

  const displayPayments = [...(billing.payments || [])];
  if (billing.padFourPaymentSlots) {
    while (displayPayments.length < 4) {
      displayPayments.push({ id: `pad-${displayPayments.length}`, date: '', amount: 0 });
    }
  }

  // Background watermark & footer
  pdf.addImage(bgImg.dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9.5);
  pdf.setTextColor(30, 30, 30);
  pdf.text('1', 105, 288, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text(sanitizePdfText(billing.billingNumber || ''), 203, 288, { align: 'right' });

  // Header Logo (Top Left)
  pdf.addImage(logoImg.dataUrl, 'JPEG', 7, 17, 68, 46, undefined, 'FAST');

  // Date & Client / Company Name (Top Right)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text(sanitizePdfText(billing.date || ''), 202, 41, { align: 'right' });

  let headerY = 51;
  const company = (billing.companyName || '').trim();
  const client = (billing.clientName || '').trim();

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
  pdf.text(`Project Name: ${sanitizePdfText(billing.projectName || '')}`, 108, 69, {
    align: 'center',
  });
  pdf.setFontSize(9.5);
  pdf.text(sanitizePdfText(billing.projectLocation || ''), 108, 74, { align: 'center' });

  // Greeting
  const greetX = 26;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Good day!', greetX, 81);
  pdf.text('We are pleased to submit our billing statement as follows:', greetX, 86);

  // Red Section Title: "Billing"
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(192, 0, 0);
  pdf.text(sanitizePdfText(billing.tableHeaderTitle || 'Billing'), greetX, 95);
  pdf.setTextColor(20, 20, 20);

  // 3-Column Billing Table Geometry
  const tableX = 6.5;
  const col1W = 138;
  const col2W = 15;
  const col3W = 44;
  const tableW = col1W + col2W + col3W; // 197mm

  const col1X = tableX;
  const col2X = col1X + col1W;
  const col3X = col2X + col2W;

  let curY = 97.5;

  // Header Row
  const headerH = 9.5;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.3);
  pdf.rect(tableX, curY, tableW, headerH);
  pdf.line(col2X, curY, col2X, curY + headerH);
  pdf.line(col3X, curY, col3X, curY + headerH);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('DESCRIPTION', col1X + col1W / 2, curY + 6.0, { align: 'center' });
  pdf.text('TOTAL', col3X + col3W / 2, curY + 6.0, { align: 'center' });
  curY += headerH;

  // Row 1: Reference Quotation Number & Item Summary
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  const summaryRawLines = sanitizePdfText(billing.itemSummaryText || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const wrappedSummaryLines: string[] = [];
  for (const line of summaryRawLines) {
    wrappedSummaryLines.push(...pdf.splitTextToSize(line, col1W - 10));
  }

  const hasRefNum = Boolean((billing.referenceQuotationNumber || '').trim());
  const row1LinesCount = (hasRefNum ? 1 : 0) + wrappedSummaryLines.length;
  const row1H = Math.max(24, row1LinesCount * 4.6 + 11);

  pdf.rect(tableX, curY, tableW, row1H);
  pdf.line(col2X, curY, col2X, curY + row1H);
  pdf.line(col3X, curY, col3X, curY + row1H);

  const row1BlockH = row1LinesCount * 4.6;
  let r1TextY = curY + (row1H - row1BlockH) / 2 + 3.4;

  if (hasRefNum) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(sanitizePdfText(billing.referenceQuotationNumber), col1X + col1W / 2, r1TextY, {
      align: 'center',
    });
    r1TextY += 4.8;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  for (const sl of wrappedSummaryLines) {
    pdf.text(sl, col1X + col1W / 2, r1TextY, { align: 'center' });
    r1TextY += 4.5;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(formatPHP(billing.contractAmount || 0), col3X + col3W / 2, curY + row1H / 2 + 1.2, {
    align: 'center',
  });
  curY += row1H;

  // Row 2: Payments Made
  const row2H = Math.max(23, (displayPayments.length + 1) * 4.5 + 5.5);
  pdf.rect(tableX, curY, tableW, row2H);
  pdf.line(col2X, curY, col2X, curY + row2H);
  pdf.line(col3X, curY, col3X, curY + row2H);

  let payY = curY + 5.0;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(20, 20, 20);
  pdf.text('Payments Made:', col1X + col1W / 2, payY, { align: 'center' });
  payY += 4.8;

  const dateColCenter = col1X + col1W * 0.28;
  const amtColCenter = col1X + col1W * 0.72;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  for (const p of displayPayments) {
    if (p.date) {
      pdf.setTextColor(20, 20, 20);
      pdf.text(sanitizePdfText(p.date), dateColCenter, payY, { align: 'center' });
    }
    pdf.setTextColor(192, 0, 0);
    pdf.text(formatPHP(Number(p.amount) || 0), amtColCenter, payY, { align: 'center' });
    payY += 4.4;
  }

  pdf.setFontSize(10);
  pdf.setTextColor(192, 0, 0);
  pdf.text(formatPHP(totalPaymentsMade), col3X + col3W / 2, curY + row2H / 2 + 1.2, {
    align: 'center',
  });
  pdf.setTextColor(20, 20, 20);
  curY += row2H;

  // Row 3: TOTAL AMOUNT DUE FOR THIS BILLING
  const row3H = 8.0;
  pdf.rect(tableX, curY, tableW, row3H);
  pdf.line(col2X, curY, col2X, curY + row3H);
  pdf.line(col3X, curY, col3X, curY + row3H);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.text('TOTAL AMOUNT DUE FOR THIS BILLING', col1X + col1W / 2, curY + 5.5, { align: 'center' });

  const dueStr = formatPHP(amountDueForThisBilling);
  pdf.setFontSize(11);
  pdf.text(dueStr, col3X + col3W / 2, curY + 5.4, { align: 'center' });
  const dueW = pdf.getTextWidth(dueStr);
  pdf.setLineWidth(0.35);
  pdf.line(
    col3X + col3W / 2 - dueW / 2,
    curY + 6.2,
    col3X + col3W / 2 + dueW / 2,
    curY + 6.2
  );
  curY += row3H;

  // Row 4 (Conditional): TOTAL AMOUNT DUE AFTER THIS BILLING
  if (hasBalanceAfterBilling) {
    const row4H = 7.5;
    pdf.setLineWidth(0.3);
    pdf.rect(tableX, curY, tableW, row4H);
    pdf.line(col2X, curY, col2X, curY + row4H);
    pdf.line(col3X, curY, col3X, curY + row4H);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text('TOTAL AMOUNT DUE AFTER THIS BILLING', col1X + col1W / 2, curY + 5.1, {
      align: 'center',
    });

    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(formatPHP(amountDueAfterThisBilling), col3X + col3W / 2, curY + 5.1, {
      align: 'center',
    });
    pdf.setTextColor(20, 20, 20);
    curY += row4H;
  }

  // I. Payment Details & Signatures below table
  curY += 7.0;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('I. Payment Details', 7.5, curY);

  const detailX = 26;
  curY += 6.5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Please make all checks payable to:', detailX, curY);
  curY += 4.6;
  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(billing.paymentDetails?.payableTo || 'Kuma Concrete Inc.'), detailX, curY);

  curY += 7.5;
  pdf.setFont('helvetica', 'normal');
  pdf.text('If bank deposit:', detailX, curY);
  curY += 4.6;
  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(billing.paymentDetails?.bankName || 'BDO'), detailX, curY);
  curY += 4.6;
  pdf.text(sanitizePdfText(billing.paymentDetails?.accountNumber || '008590004762'), detailX, curY);
  curY += 4.6;
  pdf.text(sanitizePdfText(billing.paymentDetails?.accountName || 'Kuma Concrete Inc.'), detailX, curY);

  if (billing.latePaymentNote) {
    curY += 7.5;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9.2);
    const noteLines = pdf.splitTextToSize(sanitizePdfText(billing.latePaymentNote), 166);
    for (const nl of noteLines) {
      pdf.text(nl, detailX, curY);
      curY += 4.4;
    }
  }

  // Signatures Block
  curY += 7.5;
  const sigLeftX = detailX;
  const sigRightX = 120;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Sincerely,', sigLeftX, curY);
  pdf.text("Client's Conforme:", sigRightX, curY);

  curY += 5.0;
  pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(billing.signatory?.name || 'Enrico G. Vazquez'), sigLeftX, curY);

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.35);
  pdf.line(sigRightX, curY + 5.5, sigRightX + 46, curY + 5.5);

  curY += 4.6;
  pdf.setFont('helvetica', 'normal');
  pdf.text(sanitizePdfText(billing.signatory?.title || 'President'), sigLeftX, curY);

  onProgress?.('Downloading Billing PDF...');
  pdf.save(finalFilename);
}
