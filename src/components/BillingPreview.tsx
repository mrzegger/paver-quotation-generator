import React from 'react';
import { BillingStatementData, calculateBillingTotals } from '../utils/storage';
import { formatPHP } from '../utils/pricingCalculator';

interface BillingPreviewProps {
  billing: BillingStatementData;
  scale?: number;
}

export const BillingPreview: React.FC<BillingPreviewProps> = ({ billing, scale = 1 }) => {
  const {
    totalPaymentsMade,
    amountDueForThisBilling,
    amountDueAfterThisBilling,
    hasBalanceAfterBilling,
  } = calculateBillingTotals(billing);

  const displayPayments = [...(billing.payments || [])];
  if (billing.padFourPaymentSlots) {
    while (displayPayments.length < 4) {
      displayPayments.push({
        id: `pad-${displayPayments.length}`,
        date: '',
        amount: 0,
      });
    }
  }

  return (
    <div
      className="quotation-print-container flex flex-col gap-8 items-center bg-gray-200/80 p-4 md:p-8 overflow-auto"
      style={{ zoom: scale }}
    >
      {/* 1-PAGE BILLING STATEMENT */}
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
              <p className="text-gray-900 min-h-[16px]">{billing.date}</p>
              {billing.companyName && (
                <p className="font-bold text-gray-900 min-h-[16px] pt-2 leading-snug">
                  {billing.companyName}
                </p>
              )}
              {billing.clientName && (
                <p
                  className={`text-gray-900 min-h-[16px] leading-snug ${
                    !billing.companyName ? 'pt-3' : ''
                  }`}
                >
                  {billing.clientName}
                </p>
              )}
            </div>
          </div>

          {/* Project Title */}
          <div className="text-center my-2">
            <p className="text-[12px] text-gray-900">
              Project Name: {billing.projectName}
            </p>
            <p className="text-[11.5px] text-gray-900 min-h-[16px]">
              {billing.projectLocation}
            </p>
          </div>

          {/* Salutation */}
          <div className="text-[11.5px] text-gray-900 mb-3 pl-[19mm] space-y-0.5 leading-snug">
            <p>Good day!</p>
            <p>We are pleased to submit our billing statement as follows:</p>
          </div>

          {/* Table Header Section */}
          <div className="text-[12px] font-bold text-[#c00000] mb-1 pl-[19mm]">
            {billing.tableHeaderTitle || 'Billing'}
          </div>

          {/* 3-Column Billing Table */}
          <table className="w-full text-[11.5px] border-collapse border border-black mb-3">
            <thead>
              <tr className="border-b border-black text-center font-bold">
                <th className="border-r border-black p-2 text-center" style={{ width: '70%' }}>
                  DESCRIPTION
                </th>
                <th className="border-r border-black p-2" style={{ width: '8%' }}></th>
                <th className="p-2 text-center" style={{ width: '22%' }}>
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Referenced Quotation & Scope */}
              <tr className="border-b border-black align-middle">
                <td className="border-r border-black py-6 px-4 text-center">
                  {billing.referenceQuotationNumber && (
                    <p className="font-bold text-gray-900 text-[12px]">
                      {billing.referenceQuotationNumber}
                    </p>
                  )}
                  {billing.itemSummaryText && (
                    <p className="text-gray-900 text-[11.5px] whitespace-pre-line leading-snug mt-0.5">
                      {billing.itemSummaryText}
                    </p>
                  )}
                </td>
                <td className="border-r border-black"></td>
                <td className="p-2 text-center font-bold text-[12px] text-gray-900">
                  {formatPHP(billing.contractAmount || 0)}
                </td>
              </tr>

              {/* Row 2: Payments Made */}
              <tr className="border-b border-black align-middle">
                <td className="border-r border-black py-2 px-6">
                  <p className="font-bold text-gray-900 text-center text-[11.5px] mb-0.5">
                    Payments Made:
                  </p>
                  <div className="space-y-0.5">
                    {displayPayments.map((p, i) => (
                      <div key={p.id || i} className="grid grid-cols-2 text-[11.5px] leading-tight">
                        <span className="text-center text-gray-900">{p.date}</span>
                        <span className="text-center text-[#c00000]">
                          {formatPHP(Number(p.amount) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="border-r border-black"></td>
                <td className="p-2 text-center text-[#c00000] text-[12px]">
                  {formatPHP(totalPaymentsMade)}
                </td>
              </tr>

              {/* Row 3: TOTAL AMOUNT DUE FOR THIS BILLING */}
              <tr className="border-b border-black align-middle">
                <td className="border-r border-black py-1.5 px-3 text-center font-bold text-[13.5px] text-gray-900">
                  TOTAL AMOUNT DUE FOR THIS BILLING
                </td>
                <td className="border-r border-black"></td>
                <td className="py-1.5 px-2 text-center font-bold underline text-[14px] text-gray-900">
                  {formatPHP(amountDueForThisBilling)}
                </td>
              </tr>

              {/* Row 4 (Conditional): TOTAL AMOUNT DUE AFTER THIS BILLING */}
              {hasBalanceAfterBilling && (
                <tr className="border-b border-black align-middle">
                  <td className="border-r border-black py-1.5 px-3 text-center font-bold text-[12px] text-gray-700">
                    TOTAL AMOUNT DUE AFTER THIS BILLING
                  </td>
                  <td className="border-r border-black"></td>
                  <td className="py-1.5 px-2 text-center font-bold text-[12.5px] text-gray-800">
                    {formatPHP(amountDueAfterThisBilling)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* I. Payment Details & Signatures */}
          <div className="pt-2 text-[11px] text-gray-900">
            <h3 className="font-bold text-[12px] pl-1 mb-2.5">I. Payment Details</h3>

            <div className="pl-[19mm] space-y-3 leading-snug">
              <div>
                <p>Please make all checks payable to:</p>
                <p className="font-bold">{billing.paymentDetails?.payableTo || 'Kuma Concrete Inc.'}</p>
              </div>

              <div>
                <p>If bank deposit:</p>
                <p className="font-bold">{billing.paymentDetails?.bankName || 'BDO'}</p>
                <p className="font-bold">{billing.paymentDetails?.accountNumber || '008590004762'}</p>
                <p className="font-bold">{billing.paymentDetails?.accountName || 'Kuma Concrete Inc.'}</p>
              </div>

              {billing.latePaymentNote && (
                <p className="italic pt-1">{billing.latePaymentNote}</p>
              )}

              {/* Signatures Block */}
              <div className="pt-4 flex justify-between items-start pr-10">
                <div className="space-y-0.5">
                  <p>Sincerely,</p>
                  <p className="font-bold text-[11.5px] pt-0.5">
                    {billing.signatory?.name || 'Enrico G. Vazquez'}
                  </p>
                  <p>{billing.signatory?.title || 'President'}</p>
                </div>

                <div className="text-left">
                  <p className="mb-6">Client’s Conforme:</p>
                  <div className="w-52 border-b border-black"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page Footer */}
        <div className="relative z-10 flex justify-between items-center text-[11px] text-gray-900 pt-2">
          <div className="w-1/3"></div>
          <div className="w-1/3 text-center italic">1</div>
          <div className="w-1/3 text-right pr-1">{billing.billingNumber}</div>
        </div>
      </div>
    </div>
  );
};
