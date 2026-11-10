import React, { useState, useEffect } from 'react';
import { QuotationData, getSavedQuotations, deleteQuotation, saveQuotation } from '../utils/storage';
import { 
  fetchCloudQuotations, 
  deleteCloudQuotation, 
  saveCloudQuotation,
  isSupabaseConfigured 
} from '../utils/supabaseClient';
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
  CheckCircle2
} from 'lucide-react';

interface QuotationHistoryProps {
  currentUser?: SupabaseUser | null;
  onSelectQuote: (quote: QuotationData) => void;
  onClose: () => void;
}

export const QuotationHistory: React.FC<QuotationHistoryProps> = ({
  currentUser,
  onSelectQuote,
  onClose
}) => {
  const [quotes, setQuotes] = useState<QuotationData[]>(() => getSavedQuotations());
  const [search, setSearch] = useState('');
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const isCloudEnabled = isSupabaseConfigured() && Boolean(currentUser);

  // Fetch from Supabase on mount if authenticated
  const loadCloudQuotes = async () => {
    if (!isCloudEnabled) return;
    setIsLoadingCloud(true);
    setSyncStatus('Syncing with Supabase...');
    try {
      const cloudQuotes = await fetchCloudQuotations();
      if (cloudQuotes && cloudQuotes.length > 0) {
        setQuotes(cloudQuotes);
        // Cache to local storage as offline backup
        cloudQuotes.forEach(q => saveQuotation(q));
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
    loadCloudQuotes();
  }, [currentUser]);

  const filteredQuotes = quotes.filter(q => {
    const qStr = `${q.quotationNumber} ${q.clientName || ''} ${q.companyName || ''} ${q.projectName || ''} ${q.projectLocation || ''} ${q.createdByEmail || ''} ${q.createdByName || ''}`.toLowerCase();
    return qStr.includes(search.toLowerCase());
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
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
      setQuotes(prev => prev.filter(q => q.id !== id));
    }
  };

  const handleDuplicate = async (quote: QuotationData, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup: QuotationData = {
      ...quote,
      id: `quote-${Date.now()}`,
      quotationNumber: `${quote.quotationNumber}-COPY`,
      createdByUserId: currentUser?.id,
      createdByEmail: currentUser?.email || quote.createdByEmail,
      createdByName: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || quote.createdByName,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveQuotation(dup);
    if (isCloudEnabled) {
      try {
        await saveCloudQuotation(dup, currentUser);
      } catch (err) {
        console.error('Failed to duplicate to cloud:', err);
      }
    }
    setQuotes(prev => [dup, ...prev]);
  };

  const handleExportBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(quotes, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `kuma_quotations_backup_${Date.now()}.json`);
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
          imported.forEach(q => saveQuotation(q));
          setQuotes(getSavedQuotations());
          alert(`Successfully imported ${imported.length} quotations!`);
        }
      } catch (err) {
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
              <h3 className="font-bold text-base">Quotation History</h3>
              <p className="text-[10px] text-gray-400">
                {isCloudEnabled ? 'Synced with Supabase Cloud' : 'Local Storage Mode'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCloudEnabled && (
              <button
                type="button"
                onClick={loadCloudQuotes}
                disabled={isLoadingCloud}
                title="Refresh cloud quotes"
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingCloud ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">✕</button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {syncStatus && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-[11px] text-amber-400 bg-gray-900 flex items-center justify-between">
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
              placeholder="Search by client, project, quote #, or author..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500 font-medium">
              {filteredQuotes.length} saved {filteredQuotes.length === 1 ? 'quote' : 'quotes'}
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

        {/* List of Quotes */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2 space-y-1">
          {isLoadingCloud && quotes.length === 0 ? (
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
            filteredQuotes.map(quote => (
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => handleDuplicate(quote, e)}
                      title="Duplicate"
                      className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(quote.id, e)}
                      title="Delete"
                      className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <p className="font-bold text-xs text-gray-900 truncate">
                    {quote.companyName
                      ? `${quote.companyName}${quote.clientName ? ` (${quote.clientName})` : ''}`
                      : (quote.clientName || 'Untitled Client')}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    Project: {quote.projectName || 'Pavers'} • {quote.projectLocation}
                  </p>
                </div>

                {/* Author Metadata Badge */}
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
          )}
        </div>

      </div>
    </div>
  );
};
