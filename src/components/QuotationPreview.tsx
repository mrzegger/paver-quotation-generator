import React from 'react';
import { QuotationData, DEFAULT_TERMS_PAGE_1, DEFAULT_TERMS_PAGE_2 } from '../utils/storage';
import { calculateQuotationSummary, formatPHP, QuotationLineItem } from '../utils/pricingCalculator';
import { FINISH_LABELS } from '../data/paverCatalog';
import { parseTermsText, FormattedTermsLine } from '../utils/termsFormatter';

interface QuotationPreviewProps {
  quote: QuotationData;
  scale?: number;
}

export const QuotationPreview: React.FC<QuotationPreviewProps> = ({ quote, scale = 1 }) => {
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

  const totalPages = needsTwoTablePages ? 4 : 3;

  const baseTermsPt = quote.termsFontSize ?? 9.2;
  const parsedTermsPage1 = parseTermsText(
    quote.termsPage1 ?? quote.termsAndConditions ?? DEFAULT_TERMS_PAGE_1,
    baseTermsPt
  );
  const parsedTermsPage2 = parseTermsText(quote.termsPage2 ?? DEFAULT_TERMS_PAGE_2, baseTermsPt);

  const renderRunSpan = (r: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; fontSizePt?: number }, i: number, fallbackPt: number) => {
    const pt = r.fontSizePt ?? fallbackPt;
    const px = Math.round(pt * 1.2 * 10) / 10;
    return (
      <span
        key={i}
        style={{ fontSize: `${px}px` }}
        className={`${r.bold ? 'font-bold' : 'font-normal'} ${r.italic ? 'italic' : ''} ${
          r.underline ? 'underline' : ''
        }`}
      >
        {r.text}
      </span>
    );
  };

  const renderFormattedTermsLines = (lines: FormattedTermsLine[]) =>
    lines.map((line, idx) => {
      if (line.runs.every((r) => !r.text.trim())) {
        return <div key={idx} className="h-2.5" />;
      }
      if (line.type === 'roman-header') {
        const headerPt = line.fontSizePt ?? baseTermsPt + 1.3;
        return (
          <h3 key={idx} className="font-bold mt-1.5 mb-0.5 text-gray-900">
            {line.runs.map((r, i) => renderRunSpan(r, i, headerPt))}
          </h3>
        );
      }
      if (line.type === 'letter-header') {
        const subHeaderPt = line.fontSizePt ?? baseTermsPt + 0.3;
        return (
          <p key={idx} className="font-bold mt-1 text-gray-900">
            {line.runs.map((r, i) => renderRunSpan(r, i, subHeaderPt))}
          </p>
        );
      }
      return (
        <p key={idx} className="leading-[1.42] text-gray-900">
          {line.runs.map((r, i) => renderRunSpan(r, i, baseTermsPt))}
        </p>
      );
    });

  const renderItemRow = (item: QuotationLineItem, idx: number) => (
    <tr key={item.id || idx} className="border-b border-black align-middle">
      <td className="border-r border-black p-1.5 text-left align-top" style={{ width: '46%' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <div className="font-bold text-gray-900 leading-tight text-[11px]">
              {item.description}
            </div>
            {item.details ? (
              <div className="text-[11px] text-gray-900 mt-0.5 whitespace-pre-line leading-snug">
                {item.details}
              </div>
            ) : (
              <div className="text-[11px] text-gray-900 mt-0.5 leading-snug">
                {item.pcsPerSqm && <p>• {item.pcsPerSqm} pcs/sqm</p>}
                {item.sqm && <p>{item.sqm.toFixed(2)} SQM</p>}
                {item.color && <p>• Color: {item.color}</p>}
              </div>
            )}
          </div>
          {item.finish && item.finish !== 'classic' && FINISH_LABELS[item.finish]?.badge && (
            <img
              src={FINISH_LABELS[item.finish].badge}
              alt={item.finish}
              className="w-12 h-10 object-contain flex-shrink-0 mr-1"
            />
          )}
        </div>
      </td>
      <td className="border-r border-black p-1.5 text-center font-normal text-[11.5px]" style={{ width: '19%' }}>
        {item.type === 'custom'
          ? ''
          : item.pieces
          ? `${item.pieces.toLocaleString()} PCS`
          : item.sqm
          ? `${item.sqm} SQM`
          : ''}
      </td>
      <td className="border-r border-black p-1.5 text-center font-normal text-[11.5px]" style={{ width: '16.5%' }}>
        {item.type === 'custom' ? '' : item.unitPriceNonVat ? formatPHP(item.unitPriceNonVat) : ''}
      </td>
      <td className="p-1.5 text-center font-normal text-[11.5px] text-gray-900" style={{ width: '18.5%' }}>
        {formatPHP(item.totalNonVat)}
      </td>
    </tr>
  );

  const renderSummaryRows = () => (
    <>
      {/* Paver Discount */}
      {quote.discount.enabled && summary.discountAmount > 0 && (
        <tr className="border-b border-black">
          <td className="border-r border-black py-3 px-2 text-center font-bold text-[14px] text-[#c00000]">
            {quote.discount.label ||
              (quote.discount.type === 'percentage'
                ? `PAVER DISCOUNT: ${quote.discount.value.toFixed(2)}%`
                : 'PAVER DISCOUNT')}
          </td>
          <td className="border-r border-black"></td>
          <td className="border-r border-black"></td>
          <td className="py-3 px-2 text-center font-normal text-[11.5px] text-[#c00000]">
            -{formatPHP(summary.discountAmount, 'PHP ')}
          </td>
        </tr>
      )}

      {/* Delivery */}
      {quote.delivery.enabled && (
        <tr className="border-b border-black text-[11px]">
          <td className="border-r border-black p-1.5 text-center leading-snug">
            {quote.delivery.description}
          </td>
          <td className="border-r border-black p-1.5 text-center">
            {quote.delivery.deliveriesCount || ''}
          </td>
          <td className="border-r border-black p-1.5"></td>
          <td className="p-1.5 text-center text-[11.5px]">
            {formatPHP(summary.deliveryAmount)}
          </td>
        </tr>
      )}

      {/* Total Amount */}
      <tr className="border-b border-black text-[11.5px] font-bold">
        <td className="border-r border-black py-0.5 px-2 text-center">Total Amount</td>
        <td className="border-r border-black"></td>
        <td className="border-r border-black"></td>
        <td className="py-0.5 px-2 text-center">{formatPHP(summary.totalBeforeVat)}</td>
      </tr>

      {/* Plus VAT / VAT Exempt */}
      {(vatConfig.enabled || vatConfig.showZeroVatRow !== false) && (
        <tr className="border-b border-black text-[11.5px]">
          <td className="border-r border-black py-0.5 px-2 text-center font-normal">
            {vatConfig.label ||
              (vatConfig.enabled ? `Plus: ${vatConfig.rate}% Vat` : 'VAT Exempt')}
          </td>
          <td className="border-r border-black"></td>
          <td className="border-r border-black"></td>
          <td className="py-0.5 px-2 text-center font-normal">{formatPHP(summary.vatAmount)}</td>
        </tr>
      )}

      {/* Grand Total Contract Price */}
      <tr className="border-b border-black text-[11.5px] font-bold">
        <td className="border-r border-black py-0.5 px-2 text-center">
          GRAND TOTAL CONTRACT PRICE
        </td>
        <td className="border-r border-black"></td>
        <td className="border-r border-black"></td>
        <td className="py-0.5 px-2 text-center underline font-bold">
          {formatPHP(summary.grandTotal)}
        </td>
      </tr>
    </>
  );

  return (
    <div
      className="quotation-print-container flex flex-col gap-8 items-center bg-gray-200/80 p-4 md:p-8 overflow-auto"
      style={{ zoom: scale }}
    >
      {/* PAGE 1: Quotation Table (or Part 1) */}
      <div
        className="pdf-page relative bg-white shadow-2xl overflow-hidden flex flex-col justify-between"
        style={{ width: '210mm', minHeight: '297mm', padding: '16mm 7mm 10mm 7mm' }}
      >
        {/* Bear Watermark Background */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src="/background_updated.png"
            alt="Kuma Watermark"
            className="w-full h-full object-cover object-bottom"
          />
        </div>

        {/* Page Content */}
        <div className="relative z-10 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start px-1 mb-1">
            <div className="w-60">
              <img src="/logo_header.jpeg" alt="Kuma Concrete Logo" className="w-56 object-contain" />
            </div>
            <div className="text-right text-[12px] pt-6 pr-2 space-y-1">
              <p className="text-gray-900 min-h-[16px]">{quote.date}</p>
              {quote.companyName && (
                <p className="font-bold text-gray-900 min-h-[16px] pt-1 leading-snug">{quote.companyName}</p>
              )}
              {quote.clientName && (
                <p className={`text-gray-900 min-h-[16px] leading-snug ${!quote.companyName ? 'pt-1' : ''}`}>{quote.clientName}</p>
              )}
            </div>
          </div>

          {/* Project Title */}
          <div className="text-center my-2">
            <p className="text-[12px] text-gray-900">
              Project Name: {quote.projectName}
            </p>
            <p className="text-[11.5px] text-gray-900 min-h-[16px]">
              {quote.projectLocation}
            </p>
          </div>

          {/* Salutation */}
          <div className="text-[11.5px] text-gray-900 mb-2 pl-[19mm] space-y-0.5 leading-snug">
            <p>Good day!</p>
            <p>
              We are thankful with your interest in our products and services, in compliance with your request,
            </p>
            <p>we are pleased to submit our quotation as follows:</p>
          </div>

          {/* Table Header Section */}
          <div className="text-[12px] font-bold text-[#c00000] mb-1 pl-[19mm]">
            {quote.tableHeaderTitle || 'Paver (Delivered)'}
          </div>

          {/* Main Table */}
          <table className="w-full text-[11.5px] border-collapse border border-black mb-1">
            <thead>
              <tr className="border-b border-black text-center font-bold">
                <th className="border-r border-black p-1.5 text-center" style={{ width: '46%' }}>
                  DESCRIPTION
                </th>
                <th className="border-r border-black p-1 leading-tight" style={{ width: '19%' }}>
                  APPROX.
                  <br />
                  AMMOUNT
                </th>
                <th className="border-r border-black p-1 leading-tight" style={{ width: '16.5%' }}>
                  UNIT
                  <br />
                  PRICE/PC
                </th>
                <th className="p-1.5 text-center" style={{ width: '18.5%' }}>
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {page1Items.map((item, idx) => renderItemRow(item, idx))}
              {!needsTwoTablePages && renderSummaryRows()}
            </tbody>
          </table>

          {/* Footnote under table */}
          {!needsTwoTablePages && (
            <div className="text-[11px] text-gray-900 leading-snug mb-4 pl-[19mm]">
              <p>Note : This quote is unit rate only. Any additional area will be charged per sqm. basis.</p>
              <p className="font-bold">Any additional pavers or works shall be charged accordingly.</p>
            </div>
          )}
        </div>

        {/* Page Footer */}
        <div className="relative z-10 flex justify-between items-center text-[11px] text-gray-900 pt-2">
          <div className="w-1/3"></div>
          <div className="w-1/3 text-center italic">1</div>
          <div className="w-1/3 text-right pr-1">{quote.quotationNumber}</div>
        </div>
      </div>

      {/* PAGE 2 (if overflow table needed, like Sample 192) */}
      {needsTwoTablePages && (
        <div
          className="pdf-page relative bg-white shadow-2xl overflow-hidden flex flex-col justify-between"
          style={{ width: '210mm', minHeight: '297mm', padding: '16mm 7mm 10mm 7mm' }}
        >
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <img
              src="/background_updated.png"
              alt="Kuma Watermark"
              className="w-full h-full object-cover object-bottom"
            />
          </div>

          <div className="relative z-10 flex-1 flex flex-col">
            <table className="w-full text-[11.5px] border-collapse border border-black mb-1">
              <tbody>
                {page2Items.map((item, idx) => renderItemRow(item, idx))}
                {renderSummaryRows()}
              </tbody>
            </table>

            <div className="text-[11px] text-gray-900 leading-snug mb-4 pl-[19mm]">
              <p>Note : This quote is unit rate only. Any additional area will be charged per sqm. basis.</p>
              <p className="font-bold">Any additional pavers or works shall be charged accordingly.</p>
            </div>
          </div>

          <div className="relative z-10 flex justify-between items-center text-[11px] text-gray-900 pt-2">
            <div className="w-1/3"></div>
            <div className="w-1/3 text-center italic">2</div>
            <div className="w-1/3 text-right pr-1">{quote.quotationNumber}</div>
          </div>
        </div>
      )}

      {/* TERMS & CONDITIONS: Page (2 or 3) */}
      <div
        className="pdf-page relative bg-white shadow-2xl overflow-hidden flex flex-col justify-between"
        style={{ width: '210mm', minHeight: '297mm', padding: '20mm 18mm 10mm 26mm' }}
      >
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src="/background_updated.png"
            alt="Kuma Watermark"
            className="w-full h-full object-cover object-bottom"
          />
        </div>

        <div className="relative z-10 flex-1 flex flex-col space-y-0.5">
          {renderFormattedTermsLines(parsedTermsPage1)}
        </div>

        <div className="relative z-10 flex justify-between items-center text-[11px] text-gray-900 pt-2">
          <div className="w-1/3"></div>
          <div className="w-1/3 text-center italic">{needsTwoTablePages ? 3 : 2}</div>
          <div className="w-1/3 text-right">{quote.quotationNumber}</div>
        </div>
      </div>

      {/* TERMS & SIGNATURES: Page (3 or 4) */}
      <div
        className="pdf-page relative bg-white shadow-2xl overflow-hidden flex flex-col justify-between"
        style={{ width: '210mm', minHeight: '297mm', padding: '20mm 18mm 10mm 26mm' }}
      >
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src="/background_updated.png"
            alt="Kuma Watermark"
            className="w-full h-full object-cover object-bottom"
          />
        </div>

        <div className="relative z-10 flex-1 flex flex-col space-y-0.5 text-[11px] text-gray-900">
          {renderFormattedTermsLines(parsedTermsPage2)}

          <div className="pt-2">
            <h3 className="font-bold text-[12.5px] mb-0.5">V. Payment Details</h3>
            <p>Please make all checks payable to:</p>
            <p className="font-bold">{quote.paymentDetails?.payableTo || 'Kuma Concrete Inc.'}</p>
            <p className="font-bold pt-0.5">For Bank Deposits/Transfers:</p>
            <p>
              <span className="font-bold">• Bank:</span> {quote.paymentDetails?.bankName || 'BDO (Banco de Oro)'}
            </p>
            <p>
              <span className="font-bold">• Account Number:</span> {quote.paymentDetails?.accountNumber || '008590004762'}
            </p>
            <p>
              <span className="font-bold">• Account Name:</span> {quote.paymentDetails?.accountName || 'Kuma Concrete Inc.'}
            </p>
          </div>

          <p className="pt-3">
            We look forward to serving your requirements. Should you find the above in order, please sign below to indicate your conformity.
          </p>

          {/* Signatures Block */}
          <div className="pt-6 flex justify-between items-start px-12">
            <div className="space-y-1">
              <p>Sincerely,</p>
              <p className="font-bold text-[11.5px]">{quote.signatory?.name || 'Enrico G. Vazquez'}</p>
              <p>{quote.signatory?.title || 'President'}</p>
            </div>

            <div className="text-left">
              <p className="mb-4">Client’s Conforme:</p>
              <div className="w-56 border-b border-black"></div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex justify-between items-center text-[11px] text-gray-900 pt-2">
          <div className="w-1/3"></div>
          <div className="w-1/3 text-center italic">{totalPages}</div>
          <div className="w-1/3 text-right">{quote.quotationNumber}</div>
        </div>
      </div>
    </div>
  );
};
