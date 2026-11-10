import React, { useState } from 'react';
import { PaverItem, INITIAL_PAVER_CATALOG } from '../data/paverCatalog';
import { 
  Plus, 
  Trash2, 
  RotateCcw, 
  Check, 
  DollarSign, 
  CloudUpload, 
  CloudDownload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { 
  syncPriceListToCloud, 
  fetchPriceListFromCloud, 
  isSupabaseConfigured 
} from '../utils/supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface PriceListManagerProps {
  catalog: PaverItem[];
  currentUser?: SupabaseUser | null;
  onSaveCatalog: (catalog: PaverItem[]) => void;
  onClose: () => void;
}

export const PriceListManager: React.FC<PriceListManagerProps> = ({
  catalog,
  currentUser,
  onSaveCatalog,
  onClose
}) => {
  const [items, setItems] = useState<PaverItem[]>(catalog);
  const [hasChanges, setHasChanges] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isCloudEnabled = isSupabaseConfigured() && Boolean(currentUser);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handlePriceChange = (
    itemId: string,
    field: 'classic' | 'g1' | 'g2' | 'g3',
    value: string
  ) => {
    const num = parseFloat(value);
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            pricesVatInc: {
              ...item.pricesVatInc,
              [field]: isNaN(num) ? undefined : num
            }
          };
        }
        return item;
      })
    );
    setHasChanges(true);
  };

  const handlePcsSqmChange = (itemId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    setItems(prev =>
      prev.map(item => (item.id === itemId ? { ...item, pcsPerSqm: num } : item))
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    onSaveCatalog(items);
    setHasChanges(false);
    onClose();
  };

  const handleResetToDefault = () => {
    if (window.confirm('Reset all catalog prices and pavers to factory defaults?')) {
      setItems(INITIAL_PAVER_CATALOG);
      setHasChanges(true);
    }
  };

  // Sync current price list to Supabase cloud
  const handleSyncToCloud = async () => {
    setCloudLoading(true);
    try {
      await syncPriceListToCloud(items, currentUser);
      onSaveCatalog(items);
      setHasChanges(false);
      showToast('success', 'Price list successfully synced to Supabase Cloud!');
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to sync price list to cloud.');
    } finally {
      setCloudLoading(false);
    }
  };

  // Fetch shared price list from Supabase cloud
  const handleLoadFromCloud = async () => {
    setCloudLoading(true);
    try {
      const res = await fetchPriceListFromCloud();
      if (!res || !res.catalog) {
        showToast('error', 'No price list found in cloud yet. Sync your current list first.');
      } else {
        setItems(res.catalog);
        onSaveCatalog(res.catalog);
        setHasChanges(false);
        showToast('success', `Loaded shared cloud price list (updated by ${res.updatedBy || 'Team'})`);
      }
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'Failed to fetch price list from cloud.');
    } finally {
      setCloudLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 border border-gray-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">2026 Paver Price List & Catalog</h3>
              <p className="text-xs text-gray-300">
                All prices are in PHP per pc (VAT Included). Adjustments reflect across calculations.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">✕</button>
        </div>

        {/* Cloud Sync Toolbar */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-gray-700">
            {isCloudEnabled ? (
              <span className="font-semibold text-gray-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Connected to Supabase ({currentUser?.email})
              </span>
            ) : (
              <span className="text-gray-500">
                Local pricing mode. Sign in to sync across devices.
              </span>
            )}
          </div>

          {isCloudEnabled && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadFromCloud}
                disabled={cloudLoading}
                className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                <CloudDownload className="w-3.5 h-3.5 text-blue-600" />
                <span>Load from Cloud</span>
              </button>
              <button
                type="button"
                onClick={handleSyncToCloud}
                disabled={cloudLoading}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                {cloudLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="w-3.5 h-3.5" />
                )}
                <span>Sync Price List to Cloud</span>
              </button>
            </div>
          )}
        </div>

        {/* Toast Notification */}
        {toastMsg && (
          <div className={`px-6 py-2 text-xs font-semibold flex items-center gap-2 ${
            toastMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Table Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 font-bold uppercase text-[10px]">
                <th className="p-2.5">Category & Dimensions</th>
                <th className="p-2.5 text-center">Pcs / SQM</th>
                <th className="p-2.5 text-right text-amber-800">Classic (₱)</th>
                <th className="p-2.5 text-right text-blue-800">G1 Fine (₱)</th>
                <th className="p-2.5 text-right text-emerald-800">G2 Semi (₱)</th>
                <th className="p-2.5 text-right text-purple-800">G3 Coarse (₱)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition">
                  <td className="p-2.5">
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{item.dimensions}</p>
                  </td>
                  <td className="p-2.5 text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={item.pcsPerSqm}
                      onChange={(e) => handlePcsSqmChange(item.id, e.target.value)}
                      className="w-16 p-1 text-center font-mono border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-2.5 text-right bg-amber-50/30">
                    <input
                      type="number"
                      step="0.5"
                      value={item.pricesVatInc.classic ?? ''}
                      onChange={(e) => handlePriceChange(item.id, 'classic', e.target.value)}
                      placeholder="-"
                      className="w-20 p-1 text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-2.5 text-right bg-blue-50/30">
                    <input
                      type="number"
                      step="0.5"
                      value={item.pricesVatInc.g1 ?? ''}
                      onChange={(e) => handlePriceChange(item.id, 'g1', e.target.value)}
                      placeholder="-"
                      className="w-20 p-1 text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2.5 text-right bg-emerald-50/30">
                    <input
                      type="number"
                      step="0.5"
                      value={item.pricesVatInc.g2 ?? ''}
                      onChange={(e) => handlePriceChange(item.id, 'g2', e.target.value)}
                      placeholder="-"
                      className="w-20 p-1 text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="p-2.5 text-right bg-purple-50/30">
                    <input
                      type="number"
                      step="0.5"
                      value={item.pricesVatInc.g3 ?? ''}
                      onChange={(e) => handlePriceChange(item.id, 'g3', e.target.value)}
                      placeholder="-"
                      className="w-20 p-1 text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Official Defaults
          </button>
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
