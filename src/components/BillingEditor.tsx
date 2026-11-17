import React, { useState, useEffect, useRef } from 'react';
import {
  Receipt,
  FileText,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  Hash,
  Calendar,
  User,
  Building2,
  Briefcase,
  MapPin,
  Tag,
  ChevronDown,
  ChevronUp,
  Link2,
  CreditCard,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  BillingStatementData,
  BillingPaymentEntry,
  QuotationData,
  DEFAULT_TERMS_PAGE_1,
  DEFAULT_TERMS_PAGE_2,
  DEFAULT_LATE_PAYMENT_NOTE,
  getSavedQuotations,
  formatQuotationDate,
  quotationNumberToBillingNumber,
  createBillingFromQuotation,
} from '../utils/storage';
import { PaverItem } from '../data/paverCatalog';
import { calculateQuotationSummary, formatPHP } from '../utils/pricingCalculator';
import { parseExistingQuotationPdf } from '../utils/pdfQuotationParser';
import { fetchCloudQuotations, isSupabaseConfigured } from '../utils/supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface BillingEditorProps {
  billing: BillingStatementData;
  activeQuotation: QuotationData;
  catalog: PaverItem[];
  currentUser?: SupabaseUser | null;
  onChange: (updated: BillingStatementData) => void;
  onSetReferenceImage?: (imageUrl: string | null) => void;
}

export const BillingEditor: React.FC<BillingEditorProps> = ({
  billing,
  activeQuotation,
  catalog,
  currentUser,
  onChange,
  onSetReferenceImage,
}) => {
  const [savedQuotes, setSavedQuotes] = useState<QuotationData[]>(() => getSavedQuotations());
  const [selectedSourceId, setSelectedSourceId] = useState<string>(() => {
    if (billing.referenceQuotationId) {
      return billing.referenceQuotationId === activeQuotation.id
        ? '__ACTIVE__'
        : billing.referenceQuotationId;
    }
    if (
      billing.referenceQuotationNumber &&
      billing.referenceQuotationNumber === activeQuotation.quotationNumber &&
      (billing.clientName || billing.companyName || billing.contractAmount > 0)
    ) {
      return '__ACTIVE__';
    }
    return '';
  });
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [showPaymentAccordion, setShowPaymentAccordion] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (billing.referenceQuotationId) {
      setSelectedSourceId(
        billing.referenceQuotationId === activeQuotation.id
          ? '__ACTIVE__'
          : billing.referenceQuotationId
      );
    }
  }, [billing.referenceQuotationId, activeQuotation.id]);

  useEffect(() => {
    setSavedQuotes(getSavedQuotations());
    if (isSupabaseConfigured() && currentUser) {
      setIsLoadingQuotes(true);
      fetchCloudQuotations()
        .then((cloud) => {
          if (cloud && cloud.length > 0) {
            setSavedQuotes(cloud);
          }
        })
        .catch(() => {
          // fallback cleanly to local quotes
        })
        .finally(() => setIsLoadingQuotes(false));
    }
  }, [currentUser]);

  const totalPaymentsMade = (billing.payments || []).reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const totalAmountDue = Math.round(((billing.contractAmount || 0) - totalPaymentsMade) * 100) / 100;

  const updateField = <K extends keyof BillingStatementData>(
    key: K,
    value: BillingStatementData[K]
  ) => {
    onChange({ ...billing, [key]: value });
  };

  const allCandidateQuotes = [
    activeQuotation,
    ...savedQuotes.filter((q) => q.id !== activeQuotation.id),
  ];

  const findMatchingQuotationByNumber = (inputNum: string): QuotationData | undefined => {
    const clean = (inputNum || '').trim().toLowerCase();
    if (!clean || clean.length < 4) return undefined;
    // 1. Exact quotationNumber match
    const exact = allCandidateQuotes.find(
      (q) => (q.quotationNumber || '').trim().toLowerCase() === clean
    );
    if (exact) return exact;
    // 2. Match ignoring trailing revision suffix (e.g. 2026-KPS-Q-179 matches 2026-KPS-Q-179r3)
    const stripRev = (s: string) => s.replace(/r\d+$/i, '');
    const cleanBase = stripRev(clean);
    if (cleanBase.length >= 6) {
      return allCandidateQuotes.find(
        (q) => stripRev((q.quotationNumber || '').trim().toLowerCase()) === cleanBase
      );
    }
    return undefined;
  };

  const applyQuoteObjectToBilling = (sourceQuote: QuotationData, customContractAmount?: number) => {
    const generated = createBillingFromQuotation(sourceQuote);
    const keepPayments =
      billing.referenceQuotationNumber &&
      billing.referenceQuotationNumber === generated.referenceQuotationNumber &&
      billing.payments.length > 0;

    onChange({
      ...generated,
      id: billing.id,
      contractAmount:
        customContractAmount && customContractAmount > 0
          ? customContractAmount
          : generated.contractAmount,
      payments: keepPayments ? billing.payments : [],
      padFourPaymentSlots: billing.padFourPaymentSlots,
    });

    setImportFeedback(`Linked to ${sourceQuote.quotationNumber}`);
    setTimeout(() => setImportFeedback(null), 2500);
  };

  const handleApplyQuotationSource = (sourceId: string) => {
    if (!sourceId) return;
    setSelectedSourceId(sourceId);
    const sourceQuote =
      sourceId === '__ACTIVE__'
        ? activeQuotation
        : savedQuotes.find((q) => q.id === sourceId);

    if (!sourceQuote) return;
    applyQuoteObjectToBilling(sourceQuote);
  };

  const handleUploadQuotationPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPdf(true);
    try {
      const parsed = await parseExistingQuotationPdf(file, catalog);
      const tempQuote: QuotationData = {
        id: `pdf-ref-${Date.now()}`,
        quotationNumber: parsed.quotationNumber || activeQuotation.quotationNumber,
        date: parsed.date || formatQuotationDate(new Date()),
        clientName: parsed.clientName || '',
        companyName: parsed.companyName || '',
        projectName: parsed.projectName || '',
        projectLocation: parsed.projectLocation || '',
        tableHeaderTitle: parsed.tableHeaderTitle || 'Paver (Delivered)',
        items: parsed.items,
        discount: parsed.discount || {
          enabled: false,
          type: 'percentage',
          value: 0,
          amount: 0,
          label: '',
        },
        delivery: parsed.delivery || {
          enabled: false,
          description: '',
          deliveriesCount: '',
          amount: 0,
        },
        vatConfig: {
          enabled: true,
          rate: 12,
          label: 'Plus: 12% Vat',
          showZeroVatRow: true,
        },
        termsAndConditions: DEFAULT_TERMS_PAGE_1,
        termsPage1: DEFAULT_TERMS_PAGE_1,
        termsPage2: DEFAULT_TERMS_PAGE_2,
        paymentDetails: billing.paymentDetails,
        signatory: billing.signatory,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const generated = createBillingFromQuotation(tempQuote);
      onChange({
        ...generated,
        id: billing.id,
        contractAmount:
          parsed.grandTotal && parsed.grandTotal > 0
            ? parsed.grandTotal
            : generated.contractAmount,
        padFourPaymentSlots: billing.padFourPaymentSlots,
      });
      if (parsed.previewImageUrl) {
        onSetReferenceImage?.(parsed.previewImageUrl);
      }
      setSelectedSourceId('');
      setImportFeedback(`Imported ${generated.referenceQuotationNumber || file.name}`);
      setTimeout(() => setImportFeedback(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Could not read the quotation PDF. Make sure it is a Kuma Concrete quotation PDF.');
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleAddPayment = (defaultAmount: number = 0, note: string = '') => {
    const entry: BillingPaymentEntry = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: formatQuotationDate(new Date()),
      amount: Math.round((defaultAmount + Number.EPSILON) * 100) / 100,
      note,
    };
    updateField('payments', [...(billing.payments || []), entry]);
  };

  const handleUpdatePayment = (index: number, updates: Partial<BillingPaymentEntry>) => {
    const next = [...(billing.payments || [])];
    next[index] = { ...next[index], ...updates };
    updateField('payments', next);
  };

  const handleRemovePayment = (index: number) => {
    updateField(
      'payments',
      (billing.payments || []).filter((_, i) => i !== index)
    );
  };

  const activeSummary = calculateQuotationSummary(
    activeQuotation.items,
    activeQuotation.discount,
    activeQuotation.delivery,
    activeQuotation.vatConfig
  );

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Billing Statement Details</h2>
            <p className="text-xs text-gray-500">
              Link a quotation, record payments made, and generate your PDF billing statement
            </p>
          </div>
        </div>
      </div>

      {/* Link to Quotation Source Card */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Reference Quotation
            </h3>
          </div>
          {importFeedback && (
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {importFeedback}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedSourceId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedSourceId(val);
              if (val) {
                handleApplyQuotationSource(val);
              }
            }}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
          >
            <option value="">-- Select a Quotation to Bill --</option>
            <option value="__ACTIVE__">
              Active Quote: {activeQuotation.quotationNumber} —{' '}
              {activeQuotation.companyName || activeQuotation.clientName || 'Untitled'} (
              {formatPHP(activeSummary.grandTotal)})
            </option>
            {savedQuotes.filter((q) => q.id !== activeQuotation.id).length > 0 && (
              <optgroup label="Saved Quotations History">
                {savedQuotes
                  .filter((q) => q.id !== activeQuotation.id)
                  .map((q) => {
                    const qSum = calculateQuotationSummary(
                      q.items,
                      q.discount,
                      q.delivery,
                      q.vatConfig
                    );
                    return (
                      <option key={q.id} value={q.id}>
                        {q.quotationNumber} — {q.companyName || q.clientName || 'Untitled'} •{' '}
                        {q.projectName || 'Pavers'} ({formatPHP(qSum.grandTotal)})
                      </option>
                    );
                  })}
              </optgroup>
            )}
          </select>

          <button
            type="button"
            onClick={() => handleApplyQuotationSource(selectedSourceId || '__ACTIVE__')}
            className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition whitespace-nowrap"
            title="Re-sync fields from the selected quotation"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoadingQuotes ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={isUploadingPdf}
            className="px-3 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap disabled:opacity-50"
          >
            {isUploadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-amber-700" />
            )}
            Upload Quote PDF
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUploadQuotationPdf}
            className="hidden"
          />
        </div>
      </div>

      {/* Metadata & Billed Scope Card */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Billing Number */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                Billing Statement Number
              </span>
              {billing.referenceQuotationNumber && (
                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      'billingNumber',
                      quotationNumberToBillingNumber(billing.referenceQuotationNumber)
                    )
                  }
                  className="text-[11px] text-amber-600 hover:text-amber-700 font-medium"
                >
                  Match Quote #
                </button>
              )}
            </label>
            <input
              type="text"
              value={billing.billingNumber}
              onChange={(e) => updateField('billingNumber', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="2026-KPS-B-179"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              Billing Date
            </label>
            <input
              type="text"
              value={billing.date}
              onChange={(e) => updateField('date', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="17-Nov-26"
            />
          </div>

          {/* Client Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              Client Name
            </label>
            <input
              type="text"
              value={billing.clientName}
              onChange={(e) => updateField('clientName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Ms. Chona"
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              Company Name
            </label>
            <input
              type="text"
              value={billing.companyName || ''}
              onChange={(e) => updateField('companyName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="Optional company name"
            />
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-gray-400" />
              Project Name
            </label>
            <input
              type="text"
              value={billing.projectName}
              onChange={(e) => updateField('projectName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Pavers"
            />
          </div>

          {/* Project Location */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              Project Location
            </label>
            <input
              type="text"
              value={billing.projectLocation}
              onChange={(e) => updateField('projectLocation', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Tagaytay"
            />
          </div>

          {/* Referenced Quotation Number */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                Referenced Quotation Number
              </span>
              {(() => {
                const matched = findMatchingQuotationByNumber(billing.referenceQuotationNumber);
                if (!matched) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSourceId(
                        matched.id === activeQuotation.id ? '__ACTIVE__' : matched.id
                      );
                      applyQuoteObjectToBilling(matched);
                    }}
                    className="text-[10.5px] text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold"
                  >
                    Autofill from {matched.quotationNumber}
                  </button>
                );
              })()}
            </label>
            <input
              type="text"
              value={billing.referenceQuotationNumber}
              onChange={(e) => {
                const nextNum = e.target.value;
                const matched = findMatchingQuotationByNumber(nextNum);
                const isBillingCoreBlank =
                  !billing.clientName &&
                  !billing.companyName &&
                  !billing.itemSummaryText &&
                  !(billing.contractAmount > 0);

                if (matched && isBillingCoreBlank) {
                  setSelectedSourceId(
                    matched.id === activeQuotation.id ? '__ACTIVE__' : matched.id
                  );
                  applyQuoteObjectToBilling(matched);
                } else {
                  updateField('referenceQuotationNumber', nextNum);
                }
              }}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. 2026-KPS-Q-179r3"
            />
          </div>

          {/* Section Heading Label */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-red-700" />
              Table Heading Label (Red Header)
            </label>
            <input
              type="text"
              value={billing.tableHeaderTitle}
              onChange={(e) => updateField('tableHeaderTitle', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold text-red-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="Billing"
            />
          </div>

          {/* Item Summary Description */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Billed Items Description
              </label>
              <textarea
                rows={3}
                value={billing.itemSummaryText}
                onChange={(e) => updateField('itemSummaryText', e.target.value)}
                placeholder="e.g. 4,152 pcs. Classic Oversized Square paver"
                className="w-full p-2 border border-gray-300 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Total Contract Amount (PHP)
              </label>
              <input
                type="number"
                step="0.01"
                value={billing.contractAmount || ''}
                onChange={(e) =>
                  updateField('contractAmount', parseFloat(e.target.value) || 0)
                }
                placeholder="0.00"
                className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono font-bold text-right focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <p className="text-[10.5px] text-gray-500 mt-1">
                {formatPHP(billing.contractAmount || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payments Made Card */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-bold text-gray-900">
              Payments Made ({(billing.payments || []).length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {billing.contractAmount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleAddPayment(billing.contractAmount * 0.5, '50% Downpayment')}
                  className="px-2 py-1 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded text-[11px] font-semibold transition"
                >
                  + 50% DP
                </button>
                <button
                  type="button"
                  onClick={() => handleAddPayment(billing.contractAmount * 0.4, '40% Progress')}
                  className="px-2 py-1 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded text-[11px] font-semibold transition"
                >
                  + 40% Progress
                </button>
                <button
                  type="button"
                  onClick={() => handleAddPayment(totalAmountDue > 0 ? totalAmountDue : billing.contractAmount * 0.1, 'Remaining Balance')}
                  className="px-2 py-1 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded text-[11px] font-semibold transition"
                >
                  + Balance
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => handleAddPayment(0)}
              className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              Add Payment
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {(billing.payments || []).length === 0 ? (
            <div className="p-5 border-2 border-dashed border-gray-200 rounded-xl text-center text-xs text-gray-500">
              No payments recorded yet. Click <strong>+ Add Payment</strong> or use the quick percentage buttons above.
            </div>
          ) : (
            (billing.payments || []).map((payment, idx) => (
              <div
                key={payment.id}
                className="grid grid-cols-12 gap-2 items-center p-2.5 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="col-span-5">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                    Payment Date
                  </label>
                  <input
                    type="text"
                    value={payment.date}
                    onChange={(e) => handleUpdatePayment(idx, { date: e.target.value })}
                    placeholder="27-Oct-26"
                    className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white"
                  />
                </div>
                <div className="col-span-6">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                    Amount Paid (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={payment.amount || ''}
                    onChange={(e) =>
                      handleUpdatePayment(idx, { amount: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                    className="w-full p-1.5 border border-gray-300 rounded text-xs font-mono font-bold text-red-700 bg-white text-right"
                  />
                </div>
                <div className="col-span-1 flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => handleRemovePayment(idx)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Remove payment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={billing.padFourPaymentSlots}
            onChange={(e) => updateField('padFourPaymentSlots', e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded border-gray-300"
          />
          <span>Show 4 payment rows on table (pad unused rows with PHP 0.00)</span>
        </label>
      </div>

      {/* Billing Financial Summary Card */}
      <div className="p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl shadow-lg space-y-2.5 text-xs">
        <h4 className="font-bold uppercase tracking-wider text-amber-400">
          Billing Statement Summary
        </h4>
        <div className="flex justify-between text-gray-300">
          <span>Quotation Total ({billing.referenceQuotationNumber || 'Contract'}):</span>
          <span className="font-mono">{formatPHP(billing.contractAmount || 0)}</span>
        </div>
        <div className="flex justify-between text-red-400 font-semibold">
          <span>Less: Total Payments Made:</span>
          <span className="font-mono">-{formatPHP(totalPaymentsMade)}</span>
        </div>
        <div className="border-t-2 border-amber-500/60 pt-2.5 flex justify-between text-sm md:text-base font-extrabold text-amber-400">
          <span>TOTAL AMOUNT DUE:</span>
          <span className="font-mono text-white bg-amber-600/30 px-2.5 py-0.5 rounded border border-amber-500/40">
            {formatPHP(totalAmountDue)}
          </span>
        </div>
      </div>

      {/* Payment Details, Late Fee Note & Signatory Accordion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPaymentAccordion(!showPaymentAccordion)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold text-gray-800">
              Payment Details, Late Interest Note &amp; Signatory
            </span>
          </div>
          {showPaymentAccordion ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {showPaymentAccordion && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Checks Payable To</label>
                <input
                  type="text"
                  value={billing.paymentDetails.payableTo}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...billing.paymentDetails,
                      payableTo: e.target.value,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={billing.paymentDetails.bankName}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...billing.paymentDetails,
                      bankName: e.target.value,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Bank Account Number</label>
                <input
                  type="text"
                  value={billing.paymentDetails.accountNumber}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...billing.paymentDetails,
                      accountNumber: e.target.value,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Bank Account Name</label>
                <input
                  type="text"
                  value={billing.paymentDetails.accountName}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...billing.paymentDetails,
                      accountName: e.target.value,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Signatory Name</label>
                <input
                  type="text"
                  value={billing.signatory.name}
                  onChange={(e) =>
                    updateField('signatory', { ...billing.signatory, name: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Signatory Title</label>
                <input
                  type="text"
                  value={billing.signatory.title}
                  onChange={(e) =>
                    updateField('signatory', { ...billing.signatory, title: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-gray-700">
                  Late Payment Interest Note (Italic)
                </label>
                <button
                  type="button"
                  onClick={() => updateField('latePaymentNote', DEFAULT_LATE_PAYMENT_NOTE)}
                  className="text-[11px] text-amber-700 hover:underline font-semibold"
                >
                  Reset Default
                </button>
              </div>
              <input
                type="text"
                value={billing.latePaymentNote}
                onChange={(e) => updateField('latePaymentNote', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded bg-white text-xs italic"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
