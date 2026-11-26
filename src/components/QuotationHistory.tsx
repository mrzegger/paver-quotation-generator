import React, { useState, useEffect } from 'react';
import {
  QuotationData,
  BillingStatementData,
  getSavedQuotations,
  deleteQuotation,
  saveQuotation,
  getSavedBillingStatements,
  saveBillingStatement,
  deleteBillingStatement,
  calculateBillingTotals,
} from '../utils/storage';
import {
  fetchCloudQuotations,
  deleteCloudQuotation,
  saveCloudQuotation,
  fetchCloudBillingStatements,
  saveCloudBillingStatement,
  deleteCloudBillingStatement,
  isSupabaseConfigured,
} from '../utils/supabaseClient';
import { formatPHP } from '../utils/pricingCalculator';
import { User as SupabaseUser } from '@supabase/supabase-js';
import {
  History,
  Search,
  Trash2,
  Copy,
  Download,
  Upload,
  ArrowRight,
  FileText,
  User,
  Cloud,
  RefreshCw,
  Loader2,
  Receipt,
} from 'lucide-react';

interface QuotationHistoryProps {
  currentUser?: SupabaseUser | null;
  initialTab?: 'quotations' | 'billings';
  onSelectQuote: (quote: QuotationData) => void;
  onSelectBilling?: (billing: BillingStatementData) => void;
  onCreateBillingFromQuote?: (quote: QuotationData) => void;
  onClose: () => void;
}

export const QuotationHistory: React.FC<QuotationHistoryProps> = ({
  currentUser,
  initialTab = 'quotations',
  onSelectQuote,
  onSelectBilling,
  onCreateBillingFromQuote,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'quotations' | 'billings'>(initialTab);
  const [quotes, setQuotes] = useState<QuotationData[]>(() => getSavedQuotations());
  const [billings, setBillings] = useState<BillingStatementData[]>(() =>
    getSavedBillingStatements()
  );
  const [search, setSearch] = useState('');
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const isCloudEnabled = isSupabaseConfigured() && Boolean(currentUser);

  const loadCloudData = async () => {
    if (!isCloudEnabled) return;
    setIsLoadingCloud(true);
    setSyncStatus('Syncing with Supabase...');
    try {
      const [cloudQuotes, cloudBillings] = await Promise.all([
        fetchCloudQuotations(),
        fetchCloudBillingStatements(),
      ]);

      if (cloudQuotes && cloudQuotes.length > 0) {
        setQuotes(cloudQuotes);
        cloudQuotes.forEach((q) => saveQuotation(q));
      }
      if (cloudBillings && cloudBillings.length > 0) {
        setBillings(cloudBillings);
        cloudBillings.forEach((b) => saveBillingStatement(b));
      }

      setSyncStatus('Synced with cloud');
      setTimeout(() => setSyncStatus(null), 2500);
    } catch (err) {
      console.warn('Could not sync with Supabase, using local cache:', err);
      setSyncStatus('Offline mode (Local storage)');
      setTimeout(() => setSyncStatus(null), 3000);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  useEffect(() => {
    loadCloudData();
  }, [currentUser]);

  const filteredQuotes = quotes.filter((q) => {
    const qStr = `${q.quotationNumber} ${q.clientName || ''} ${q.companyName || ''} ${
      q.projectName || ''
    } ${q.projectLocation || ''} ${q.createdByEmail || ''} ${q.createdByName || ''}`.toLowerCase();
    return qStr.includes(search.toLowerCase());
  });

  const filteredBillings = billings.filter((b) => {
    const bStr = `${b.billingNumber} ${b.referenceQuotationNumber || ''} ${b.clientName || ''} ${
      b.companyName || ''
    } ${b.projectName || ''} ${b.projectLocation || ''} ${b.createdByEmail || ''} ${
      b.createdByName || ''
    }`.toLowerCase();
    return bStr.includes(search.toLowerCase());
  });

  const handleDeleteQuote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this saved quotation?')) {
      deleteQuotation(id);
      if (isCloudEnabled) {
        try {
          await deleteCloudQuotation(id);
        } catch (err) {
          console.error('Failed to delete from cloud:', err);
        }
      }
      setQuotes((prev) => prev.filter((q) => q.id !== id));
    }
  };

  const handleDuplicateQuote = async (quote: QuotationData, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup: QuotationData = {
      ...quote,
      id: `quote-${Date.now()}`,
      quotationNumber: `${quote.quotationNumber}-COPY`,
      createdByUserId: currentUser?.id,
      createdByEmail: currentUser?.email || quote.createdByEmail,
      createdByName:
        currentUser?.user_metadata?.full_name ||
        currentUser?.email?.split('@')[0] ||
        quote.createdByName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveQuotation(dup);
    if (isCloudEnabled) {
      try {
        await saveCloudQuotation(dup, currentUser);
      } catch (err) {
        console.error('Failed to duplicate to cloud:', err);
      }
    }
    setQuotes((prev) => [dup, ...prev]);
  };

  const handleDeleteBilling = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this saved billing statement?')) {
      deleteBillingStatement(id);
      if (isCloudEnabled) {
        try {
          await deleteCloudBillingStatement(id);
        } catch (err) {
          console.error('Failed to delete billing from cloud:', err);
        }
      }
      setBillings((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const handleDuplicateBilling = async (billing: BillingStatementData, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup: BillingStatementData = {
      ...billing,
      id: `billing-${Date.now()}`,
      billingNumber: `${billing.billingNumber}-COPY`,
      createdByUserId: currentUser?.id,
      createdByEmail: currentUser?.email || billing.createdByEmail,
      createdByName:
        currentUser?.user_metadata?.full_name ||
        currentUser?.email?.split('@')[0] ||
        billing.createdByName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveBillingStatement(dup);
    if (isCloudEnabled) {
      try {
        await saveCloudBillingStatement(dup, currentUser);
      } catch (err) {
        console.error('Failed to duplicate billing to cloud:', err);
      }
    }
    setBillings((prev) => [dup, ...prev]);
  };

  const handleExportBackup = () => {
    const payload = activeTab === 'quotations' ? quotes : billings;
    const prefix = activeTab === 'quotations' ? 'kuma_quotations' : 'kuma_billings';
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `${prefix}_backup_${Date.now()}.json`);
    a.click();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          if (activeTab === 'quotations') {
            imported.forEach((q) => saveQuotation(q));
            setQuotes(getSavedQuotations());
          } else {
            imported.forEach((b) => saveBillingStatement(b));
            setBillings(getSavedBillingStatements());
          }
          alert(`Successfully imported ${imported.length} records!`);
        }
      } catch {
        alert('Invalid JSON backup file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-bold text-base">Document History</h3>
              <p className="text-[10px] text-gray-400">
                {isCloudEnabled ? 'Synced with Supabase Cloud' : 'Local Storage Mode'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCloudEnabled && (
              <button
                type="button"
                onClick={loadCloudData}
                disabled={isLoadingCloud}
                title="Refresh cloud records"
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoadingCloud ? 'animate-spin text-amber-400' : ''}`}
                />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-100 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('quotations')}
            className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'quotations'
                ? 'border-amber-600 text-amber-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Quotations ({quotes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('billings')}
            className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'billings'
                ? 'border-amber-600 text-amber-800 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Billing Statements ({billings.length})
          </button>
        </div>

        {/* Sync Status Banner */}
        {syncStatus && (
          <div className="border-b border-amber-500/20 px-4 py-1.5 text-[11px] text-amber-400 bg-gray-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Cloud className="w-3.5 h-3.5 text-amber-400" />
              {syncStatus}
            </span>
          </div>
        )}

        {/* Search & Actions */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, project, doc #, or author..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500 font-medium">
              {activeTab === 'quotations'
                ? `${filteredQuotes.length} saved ${filteredQuotes.length === 1 ? 'quote' : 'quotes'}`
                : `${filteredBillings.length} saved ${
                    filteredBillings.length === 1 ? 'billing' : 'billings'
                  }`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                title="Export JSON Backup"
                className="p-1.5 text-gray-600 hover:text-amber-700 hover:bg-gray-200 rounded flex items-center gap-1 font-semibold text-[11px]"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <label className="p-1.5 text-gray-600 hover:text-amber-700 hover:bg-gray-200 rounded flex items-center gap-1 font-semibold text-[11px] cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Import
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2 space-y-1">
          {activeTab === 'quotations' ? (
            isLoadingCloud && quotes.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600" />
                <p>Loading cloud quotations...</p>
              </div>
            ) : filteredQuotes.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs space-y-2">
                <FileText className="w-8 h-8 mx-auto text-gray-300" />
                <p>No saved quotations found</p>
                <p className="text-[11px]">Quotations you save or download will appear here.</p>
              </div>
            ) : (
              filteredQuotes.map((quote) => (
                <div
                  key={quote.id}
                  onClick={() => {
                    onSelectQuote(quote);
                    onClose();
                  }}
                  className="p-3 rounded-lg border border-transparent hover:border-amber-300 hover:bg-amber-50/40 cursor-pointer transition flex flex-col gap-1.5 group"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-mono font-bold text-xs text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded">
                      {quote.quotationNumber}
                    </span>
                    <div className="flex items-center gap-1">
                      {onCreateBillingFromQuote && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateBillingFromQuote(quote);
                            onClose();
                          }}
                          title="Create Billing Statement from this Quotation"
                          className="px-2 py-0.5 text-[10.5px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded flex items-center gap-1 transition"
                        >
                          <Receipt className="w-3 h-3" />
                          Bill
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDuplicateQuote(quote, e)}
                        title="Duplicate"
                        className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteQuote(quote.id, e)}
                        title="Delete"
                        className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-bold text-xs text-gray-900 truncate">
                      {quote.companyName
                        ? `${quote.companyName}${quote.clientName ? ` (${quote.clientName})` : ''}`
                        : quote.clientName || 'Untitled Client'}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      Project: {quote.projectName || 'Pavers'} • {quote.projectLocation}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-[10.5px] text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded w-fit">
                    <User className="w-3 h-3 text-amber-700" />
                    <span className="font-medium text-gray-700">Created by:</span>
                    <span className="text-gray-600 truncate max-w-[200px]">
                      {quote.createdByName || quote.createdByEmail || 'Local / Admin'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                    <span>{quote.date}</span>
                    <span className="font-bold text-gray-800 flex items-center gap-1">
                      Load Quote <ArrowRight className="w-3 h-3 text-amber-600" />
                    </span>
                  </div>
                </div>
              ))
            )
          ) : isLoadingCloud && billings.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-600" />
              <p>Loading cloud billing statements...</p>
            </div>
          ) : filteredBillings.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs space-y-2">
              <Receipt className="w-8 h-8 mx-auto text-gray-300" />
              <p>No saved billing statements found</p>
              <p className="text-[11px]">
                Billing statements you save or download will appear here.
              </p>
            </div>
          ) : (
            filteredBillings.map((b) => {
              const totals = calculateBillingTotals(b);
              return (
                <div
                  key={b.id}
                  onClick={() => {
                    onSelectBilling?.(b);
                    onClose();
                  }}
                  className="p-3 rounded-lg border border-transparent hover:border-amber-300 hover:bg-amber-50/40 cursor-pointer transition flex flex-col gap-1.5 group"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded">
                        {b.billingNumber}
                      </span>
                      {b.referenceQuotationNumber && (
                        <span className="font-mono text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          Ref: {b.referenceQuotationNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => handleDuplicateBilling(b, e)}
                        title="Duplicate"
                        className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteBilling(b.id, e)}
                        title="Delete"
                        className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-bold text-xs text-gray-900 truncate">
                      {b.companyName
                        ? `${b.companyName}${b.clientName ? ` (${b.clientName})` : ''}`
                        : b.clientName || 'Untitled Client'}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      Project: {b.projectName || 'Pavers'} • {b.projectLocation}
                    </p>
                    <p className="text-[11px] font-semibold text-gray-700">
                      Due: <span className="font-mono text-gray-900">{formatPHP(totals.amountDueForThisBilling)}</span>{' '}
                      <span className="text-gray-400 font-normal">
                        (of {formatPHP(b.contractAmount || 0)})
                      </span>
                      {totals.hasBalanceAfterBilling && (
                        <span className="text-amber-700 font-medium">
                          {' '}
                          • After: {formatPHP(totals.amountDueAfterThisBilling)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-[10.5px] text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded w-fit">
                    <User className="w-3 h-3 text-amber-700" />
                    <span className="font-medium text-gray-700">Created by:</span>
                    <span className="text-gray-600 truncate max-w-[200px]">
                      {b.createdByName || b.createdByEmail || 'Local / Admin'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                    <span>{b.date}</span>
                    <span className="font-bold text-gray-800 flex items-center gap-1">
                      Load Billing <ArrowRight className="w-3 h-3 text-amber-600" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
