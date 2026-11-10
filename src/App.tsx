import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Printer, 
  Save, 
  Plus, 
  History, 
  DollarSign, 
  Sparkles, 
  Eye, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  CheckCircle,
  FileText,
  Loader2,
  Maximize2,
  User as UserIcon,
  LogOut,
  Cloud,
  CloudOff
} from 'lucide-react';
import { 
  QuotationData, 
  getSavedCatalog, 
  saveCatalog, 
  saveQuotation, 
  getNextQuotationNumber, 
  formatQuotationDate,
  DEFAULT_TERMS_PAGE_1,
  DEFAULT_TERMS_PAGE_2
} from './utils/storage';
import { PaverItem, INITIAL_PAVER_CATALOG } from './data/paverCatalog';
import { QuotationEditor } from './components/QuotationEditor';
import { QuotationPreview } from './components/QuotationPreview';
import { RequestImporter } from './components/RequestImporter';
import { PriceListManager } from './components/PriceListManager';
import { QuotationHistory } from './components/QuotationHistory';
import { ReferenceDock } from './components/ReferenceDock';
import { AuthModal } from './components/AuthModal';
import { printQuotation, downloadQuotationPdf, getQuotationPdfFilename } from './utils/pdfExport';
import { convertParsedItemToLineItem } from './utils/requestParser';
import { 
  supabase, 
  isSupabaseConfigured, 
  signOutUser, 
  saveCloudQuotation 
} from './utils/supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

export function App() {
  const [catalog, setCatalog] = useState<PaverItem[]>(() => getSavedCatalog());

  // Supabase Auth State
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    // Check initial user session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });

    // Listen to login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Default blank quotation state
  const createBlankQuotation = (): QuotationData => {
    return {
      id: `quote-${Date.now()}`,
      quotationNumber: getNextQuotationNumber(),
      date: formatQuotationDate(new Date()),
      clientName: '',
      companyName: '',
      projectName: '',
      projectLocation: '',
      tableHeaderTitle: 'Paver (Delivered)',
      items: [],
      discount: {
        enabled: false,
        type: 'percentage',
        value: 10,
        amount: 0,
        label: 'PAVER DISCOUNT: 10.00%'
      },
      delivery: {
        enabled: false,
        description: '• For Delivery - Loading courtesy of Kuma - Pallet Packaging Included (suggested 20T Trucks)',
        deliveriesCount: '1 Delivery',
        amount: 0
      },
      termsAndConditions: DEFAULT_TERMS_PAGE_1,
      termsPage1: DEFAULT_TERMS_PAGE_1,
      termsPage2: DEFAULT_TERMS_PAGE_2,
      paymentDetails: {
        payableTo: 'Kuma Concrete Inc.',
        bankName: 'BDO (Banco de Oro)',
        accountNumber: '008590004762',
        accountName: 'Kuma Concrete Inc.'
      },
      signatory: {
        name: 'Enrico G. Vazquez',
        title: 'President'
      },
      createdByUserId: currentUser?.id,
      createdByEmail: currentUser?.email,
      createdByName: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  };

  const [currentQuote, setCurrentQuote] = useState<QuotationData>(() => createBlankQuotation());
  const [previewScale, setPreviewScale] = useState(0.75);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [saveToast, setSaveToast] = useState<{ text: string } | null>(null);

  // Modals state
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [isPriceListOpen, setIsPriceListOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isDockOpen, setIsDockOpen] = useState(true);

  // Save changes to catalog
  const handleSaveCatalog = (newCat: PaverItem[]) => {
    setCatalog(newCat);
    saveCatalog(newCat);
  };

  // Save current quote (with author tracking + cloud sync)
  const handleSaveDraft = async () => {
    const quoteWithAuthor: QuotationData = {
      ...currentQuote,
      createdByUserId: currentUser?.id || currentQuote.createdByUserId,
      createdByEmail: currentUser?.email || currentQuote.createdByEmail,
      createdByName: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || currentQuote.createdByName,
      updatedAt: Date.now(),
    };

    saveQuotation(quoteWithAuthor);
    setCurrentQuote(quoteWithAuthor);

    if (isSupabaseConfigured() && currentUser) {
      try {
        await saveCloudQuotation(quoteWithAuthor, currentUser);
        setSaveToast({ text: 'Quotation saved & synced to Supabase Cloud!' });
      } catch (e) {
        console.error(e);
        setSaveToast({ text: 'Saved locally (Cloud sync failed)' });
      }
    } else {
      setSaveToast({ text: 'Quotation saved to local storage!' });
    }

    setTimeout(() => setSaveToast(null), 2500);
  };

  // Create new blank quote
  const handleNewQuotation = () => {
    if (window.confirm('Create a new blank quotation? Any unsaved edits will be cleared.')) {
      const newQ = createBlankQuotation();
      setCurrentQuote(newQ);
      setReferenceImageUrl(null);
    }
  };

  // PDF Export
  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await handleSaveDraft();
      const filename = getQuotationPdfFilename(currentQuote);
      await downloadQuotationPdf(currentQuote, filename, (progress) => {
        setExportProgress(progress);
      });
    } catch (e: any) {
      console.error(e);
      alert('Failed to generate PDF. You can also use the "Print" button to save as PDF via system dialog.');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setIsUserMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      
      {/* Top Main Navigation Bar */}
      <header className="bg-gray-900 text-white sticky top-0 z-30 shadow-md border-b border-gray-800">
        <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-white rounded p-1 shadow-sm flex items-center justify-center">
              <img src="/logo_header.jpeg" alt="Kuma Concrete" className="h-7 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-wide">Paver Quotation Generator</h1>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 font-mono px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                  {currentQuote.quotationNumber}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {currentQuote.companyName || currentQuote.clientName || 'New Quotation'}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            
            {/* New Quote */}
            <button
              type="button"
              onClick={handleNewQuotation}
              className="p-1.5 md:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-gray-700"
              title="Create New Quotation"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">New Quote</span>
            </button>

            {/* Save Draft */}
            <button
              type="button"
              onClick={handleSaveDraft}
              className="p-1.5 md:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-gray-700"
              title="Save & Sync to Cloud"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Save Draft</span>
            </button>

            {/* History */}
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="p-1.5 md:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-gray-700"
              title="Browse Saved Quotations"
            >
              <History className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">History</span>
            </button>

            {/* Price List */}
            <button
              type="button"
              onClick={() => setIsPriceListOpen(true)}
              className="p-1.5 md:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-gray-700"
              title="Edit 2026 Price List"
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Price List</span>
            </button>

            {/* Reference Dock Toggle */}
            {referenceImageUrl && (
              <button
                type="button"
                onClick={() => setIsDockOpen(!isDockOpen)}
                className={`p-1.5 md:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  isDockOpen 
                    ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' 
                    : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
                title="Toggle Reference Dock"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Reference</span>
              </button>
            )}

            <div className="h-5 w-px bg-gray-700 mx-1 hidden sm:block"></div>

            {/* Print / System PDF */}
            <button
              type="button"
              onClick={printQuotation}
              className="p-1.5 md:px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-gray-700"
              title="Print / Save via Browser Dialog"
            >
              <Printer className="w-3.5 h-3.5 text-gray-300" />
              <span className="hidden md:inline">Print</span>
            </button>

            {/* Download PDF Primary Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-gray-950 rounded-lg text-xs font-extrabold flex items-center gap-2 shadow-md hover:shadow-lg transition disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-950" />
                  <span>{exportProgress || 'Generating...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-gray-950" />
                  <span>Download PDF</span>
                </>
              )}
            </button>

            <div className="h-5 w-px bg-gray-700 mx-1 hidden sm:block"></div>

            {/* User Account / Supabase Auth Button */}
            {currentUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="p-1.5 md:px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg flex items-center gap-2 text-xs transition"
                  title="Account Settings"
                >
                  <div className="w-5 h-5 rounded-full bg-amber-500 text-gray-950 font-bold flex items-center justify-center text-[10px]">
                    {(currentUser.user_metadata?.full_name || currentUser.email || 'U')[0].toUpperCase()}
                  </div>
                  <span className="hidden lg:inline text-gray-200 max-w-[120px] truncate">
                    {currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0]}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected to Supabase"></span>
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white text-gray-900 rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-xs animate-in fade-in duration-100">
                    <div className="px-3.5 py-2 border-b border-gray-100">
                      <p className="font-bold text-gray-900 truncate">
                        {currentUser.user_metadata?.full_name || 'Kuma Team'}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate font-mono">
                        {currentUser.email}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold mt-1">
                        <Cloud className="w-3 h-3 text-emerald-600" />
                        <span>Supabase Sync Active</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full px-3.5 py-2 text-left text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="p-1.5 md:px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                title="Sign in with Supabase"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign In</span>
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Save Toast Notification */}
      {saveToast && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4" />
          {saveToast.text}
        </div>
      )}

      {/* Main Workspace: Split-Pane Grid */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Quotation Editor Panel (5 cols) */}
        <div className="lg:col-span-6 xl:col-span-5 space-y-6">
          <QuotationEditor
            quote={currentQuote}
            catalog={catalog}
            onChange={setCurrentQuote}
            onOpenImporter={() => setIsImporterOpen(true)}
            onOpenPriceList={() => setIsPriceListOpen(true)}
          />
        </div>

        {/* Right Column: Live PDF Preview Panel (7 cols) */}
        <div className="lg:col-span-6 xl:col-span-7 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-20 flex flex-col">
          
          {/* Preview Toolbar */}
          <div className="p-3 bg-gray-900 text-white flex items-center justify-between border-b border-gray-800 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Live Quotation PDF Preview</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 mr-1">Zoom:</span>
              <button
                type="button"
                onClick={() => setPreviewScale(prev => Math.max(prev - 0.1, 0.4))}
                className="p-1 hover:bg-gray-800 rounded text-gray-300"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] w-10 text-center text-gray-300">
                {Math.round(previewScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewScale(prev => Math.min(prev + 0.1, 1.2))}
                className="p-1 hover:bg-gray-800 rounded text-gray-300"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewScale(0.75)}
                className="p-1 hover:bg-gray-800 rounded text-gray-300 ml-1"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Interactive Document Viewport */}
          <div className="bg-gray-300/80 p-4 max-h-[calc(100vh-140px)] overflow-y-auto">
            <QuotationPreview quote={currentQuote} scale={previewScale} />
          </div>

        </div>

      </main>

      {/* Floating Modals */}
      {isImporterOpen && (
        <RequestImporter
          catalog={catalog}
          onApplyData={(data) => {
            setCurrentQuote(prev => ({
              ...prev,
              quotationNumber: data.quotationNumber || prev.quotationNumber,
              date: data.date || prev.date,
              clientName: data.clientName !== undefined ? data.clientName : prev.clientName,
              companyName: data.companyName !== undefined ? data.companyName : prev.companyName,
              projectName: data.projectName || prev.projectName,
              projectLocation: data.projectLocation || prev.projectLocation,
              tableHeaderTitle: data.tableHeaderTitle || prev.tableHeaderTitle,
              items: data.items.length > 0 ? data.items : prev.items,
              discount: data.discount ? data.discount : prev.discount,
              delivery: data.delivery ? data.delivery : prev.delivery
            }));
          }}
          onSetReferenceImage={(url) => {
            setReferenceImageUrl(url);
            setIsDockOpen(true);
          }}
          onClose={() => setIsImporterOpen(false)}
        />
      )}

      {isPriceListOpen && (
        <PriceListManager
          catalog={catalog}
          currentUser={currentUser}
          onSaveCatalog={handleSaveCatalog}
          onClose={() => setIsPriceListOpen(false)}
        />
      )}

      {isHistoryOpen && (
        <QuotationHistory
          currentUser={currentUser}
          onSelectQuote={(quote) => setCurrentQuote(quote)}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Reference Dock Pin */}
      {isDockOpen && referenceImageUrl && (
        <ReferenceDock
          imageUrl={referenceImageUrl}
          onClose={() => setIsDockOpen(false)}
        />
      )}

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <AuthModal
          onSuccess={() => {
            setIsAuthModalOpen(false);
          }}
          onClose={() => setIsAuthModalOpen(false)}
        />
      )}

    </div>
  );
}

export default App;
