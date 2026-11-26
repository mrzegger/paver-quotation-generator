import React, { useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  FileUp,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import {
  parseQuotationRequestText,
  convertParsedItemToLineItem,
  cleanOcrText,
  ParsedRequest,
} from '../utils/requestParser';
import { parseExistingQuotationPdf, ParsedPdfQuotation } from '../utils/pdfQuotationParser';
import {
  QuotationLineItem,
  QuotationDiscount,
  QuotationDelivery,
  formatPHP,
} from '../utils/pricingCalculator';
import { PaverItem } from '../data/paverCatalog';

export interface ImportedQuotationPayload {
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
}

interface RequestImporterProps {
  catalog: PaverItem[];
  onApplyData: (data: ImportedQuotationPayload) => void;
  onSetReferenceImage: (imageUrl: string | null) => void;
  onClose: () => void;
}

/**
 * Upscales small screenshots and enhances grayscale contrast in an offscreen canvas
 * so Tesseract accurately recognizes small table fonts, symbols (m²), and punctuation.
 */
async function preprocessImageForOcr(file: File): Promise<Blob | File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image for OCR preprocessing'));
      image.src = objectUrl;
    });

    const rawScale = img.width < 1200 ? 3 : img.width < 2000 ? 2 : 1;
    const maxDim = Math.max(img.width, img.height);
    const scale = maxDim > 0 ? Math.min(rawScale, 3600 / maxDim) : 1;

    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imageData.data;
    const factor = 1.45;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const contrasted = Math.min(255, Math.max(0, (gray - 128) * factor + 128));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    return blob || file;
  } catch (err) {
    console.warn('OCR image preprocessing skipped, using original image:', err);
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const RequestImporter: React.FC<RequestImporterProps> = ({
  catalog,
  onApplyData,
  onSetReferenceImage,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [parsedRequest, setParsedRequest] = useState<ParsedRequest | null>(null);
  const [parsedPdf, setParsedPdf] = useState<ParsedPdfQuotation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Process an uploaded PDF quotation file
  const processPdfFile = async (file: File) => {
    setErrorMsg(null);
    setParsedRequest(null);
    setParsedPdf(null);
    setIsProcessing(true);
    setProgress(25);
    setStatusMsg('Reading existing quotation PDF...');

    try {
      const extracted = await parseExistingQuotationPdf(file, catalog);
      setProgress(90);
      setStatusMsg('Extracting line items, pricing, and delivery details...');

      setParsedPdf(extracted);
      if (extracted.previewImageUrl) {
        setPreviewImage(extracted.previewImageUrl);
        onSetReferenceImage(extracted.previewImageUrl);
      }

      setProgress(100);
      setIsProcessing(false);
    } catch (err: any) {
      console.error('PDF Parse Error:', err);
      setErrorMsg('Could not parse the uploaded PDF file. Please ensure it is a valid quotation PDF.');
      setIsProcessing(false);
    }
  };

  // Process an uploaded image / screenshot with OCR
  const processImageFile = async (file: File) => {
    setErrorMsg(null);
    setParsedPdf(null);
    const imageUrl = URL.createObjectURL(file);
    setPreviewImage(imageUrl);
    onSetReferenceImage(imageUrl);
    setIsProcessing(true);
    setProgress(10);
    setStatusMsg('Initializing OCR engine...');

    try {
      setStatusMsg('Enhancing image for OCR...');
      const ocrSource = await preprocessImageForOcr(file);
      setProgress(25);

      const worker = await createWorker('eng');
      setProgress(45);
      setStatusMsg('Reading text from request screenshot...');

      const ret = await worker.recognize(ocrSource);
      setProgress(85);
      setStatusMsg('Parsing quotation details...');

      const rawText = ret.data.text;
      const text = cleanOcrText(rawText);
      setTextInput(text);

      const parsed = parseQuotationRequestText(text);
      setParsedRequest(parsed);

      await worker.terminate();
      setProgress(100);
      setIsProcessing(false);
    } catch (err: any) {
      console.error('OCR Error:', err);
      setErrorMsg(
        'Could not read text from image. You can paste the text manually into the Quick-Paste tab.'
      );
      setIsProcessing(false);
    }
  };

  const handleUploadedFile = (file: File) => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      processPdfFile(file);
    } else {
      processImageFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadedFile(e.target.files[0]);
    }
  };

  const handleLoadSampleRequest = async () => {
    setParsedPdf(null);
    const sampleText = `
client_name: VG Gatdula Construction Inc
company_name: VG Gatdula Construction Inc
contact_number: 09175378998
email: vgconst.inc@gmail.com
project_name: Marcelo residence
project_location: 32 tampingco street san lorenzo village makati city

PROJECT ESTIMATE ITEMIZATION
1. Square: Regular (200x200x60mm)
   Finish: G2 | Color: Gray
   Quantity: 1,250 Pcs (50 m²)
   Estimated Item Cost: ₱61,875.00

2. Plank: Regular (100x400x60mm)
   Finish: G3 | Color: Gray
   Quantity: 1,250 Pcs (50 m²)
   Estimated Item Cost: ₱53,125.00
    `;
    setTextInput(sampleText);
    setParsedRequest(parseQuotationRequestText(sampleText));
    setPreviewImage('/sample_request.png');
    onSetReferenceImage('/sample_request.png');
  };

  const handleLoadSamplePdf = async () => {
    try {
      const resp = await fetch('/sample_quotation.pdf');
      const blob = await resp.blob();
      const file = new File([blob], '2026-KPS-Q-188 Pavers.pdf', { type: 'application/pdf' });
      await processPdfFile(file);
    } catch (e) {
      console.error('Could not load sample PDF:', e);
    }
  };

  const handleTextChange = (text: string) => {
    setTextInput(text);
    setParsedPdf(null);
    if (text.trim().length > 10) {
      const parsed = parseQuotationRequestText(text);
      setParsedRequest(parsed);
    } else {
      setParsedRequest(null);
    }
  };

  const handleApply = () => {
    if (parsedPdf) {
      onApplyData({
        quotationNumber: parsedPdf.quotationNumber,
        date: parsedPdf.date,
        clientName: parsedPdf.clientName,
        companyName: parsedPdf.companyName,
        projectName: parsedPdf.projectName,
        projectLocation: parsedPdf.projectLocation,
        tableHeaderTitle: parsedPdf.tableHeaderTitle,
        items: parsedPdf.items,
        discount: parsedPdf.discount,
        delivery: parsedPdf.delivery,
      });
      onClose();
      return;
    }

    if (parsedRequest) {
      const lineItems: QuotationLineItem[] = parsedRequest.items.map((item) =>
        convertParsedItemToLineItem(item, catalog)
      );

      onApplyData({
        clientName: parsedRequest.clientName,
        companyName: parsedRequest.companyName,
        projectName: parsedRequest.projectName,
        projectLocation: parsedRequest.projectLocation,
        items: lineItems,
      });
      onClose();
    }
  };

  const hasValidData =
    (parsedPdf && parsedPdf.items.length > 0) ||
    (parsedRequest && parsedRequest.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Import Request or Existing Quotation PDF</h3>
              <p className="text-xs text-gray-300">
                Upload an existing Quotation PDF to edit, drop a request screenshot, or paste inquiry text
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition ${
              activeTab === 'upload'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileUp className="w-4 h-4" />
            Upload Quotation PDF or Screenshot
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition ${
              activeTab === 'text'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Quick Paste Text
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-300 hover:border-amber-500 rounded-xl p-6 text-center cursor-pointer bg-gray-50/50 hover:bg-amber-50/20 transition flex flex-col items-center justify-center gap-2"
              >
                <div className="p-3 bg-white shadow-sm rounded-full text-amber-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    Drag & drop an existing Quotation PDF or Request Screenshot here
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Supports Quotation PDF (.pdf) as well as Request Images (PNG, JPG, WEBP)
                  </p>
                </div>
                <label className="mt-2 inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm cursor-pointer transition">
                  Browse PDF or Image Files
                  <input
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Sample buttons */}
              <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 px-1">
                <span>Want to test with a sample?</span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleLoadSamplePdf}
                    className="font-semibold text-amber-700 hover:text-amber-800 underline flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Load Sample Quotation PDF (2026-KPS-Q-188)
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSampleRequest}
                    className="font-semibold text-amber-700 hover:text-amber-800 underline flex items-center gap-1"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Load Sample Request Image
                  </button>
                </div>
              </div>

              {/* Processing Progress */}
              {isProcessing && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      {statusMsg}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-600 h-2 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* Image / PDF Page 1 Preview */}
              {previewImage && (
                <div className="border border-gray-200 rounded-lg p-2 bg-gray-100 flex items-center justify-center max-h-48 overflow-hidden">
                  <img
                    src={previewImage}
                    alt="Uploaded Document Preview"
                    className="max-h-44 object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Paste Request Text (Email, Form, or Message)
              </label>
              <textarea
                value={textInput}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="client_name: VG Gatdula Construction Inc&#10;project_name: Marcelo residence&#10;project_location: 32 tampingco street san lorenzo village makati city&#10;1. Square: Regular (200x200x60mm) Finish: G2 Color: Gray Quantity: 1,250 Pcs (50 m²)"
                rows={8}
                className="w-full font-mono text-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none bg-gray-50/50"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLoadSampleRequest}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline"
                >
                  Fill with Sample Text
                </button>
              </div>
            </div>
          )}

          {/* Parsed Existing Quotation PDF Preview Card */}
          {parsedPdf && (
            <div className="border border-green-200 bg-green-50/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-800 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Extracted Existing Quotation PDF
                </div>
                {parsedPdf.quotationNumber && (
                  <span className="font-mono text-xs font-bold bg-green-100 text-green-900 px-2.5 py-0.5 rounded border border-green-300">
                    {parsedPdf.quotationNumber}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Client Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedPdf.clientName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Company Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedPdf.companyName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Date
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedPdf.date || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Project Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedPdf.projectName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Location
                  </span>
                  <span className="font-semibold text-gray-800 truncate block">
                    {parsedPdf.projectLocation || '—'}
                  </span>
                </div>
              </div>

              {/* Extracted PDF Line Items */}
              <div className="bg-white rounded-lg border border-green-200/60 overflow-hidden shadow-sm">
                <div className="bg-green-100/50 px-3 py-1.5 text-[11px] font-bold text-green-900 border-b border-green-200 flex justify-between">
                  <span>Detected Line Items ({parsedPdf.items.length})</span>
                  <span>{parsedPdf.tableHeaderTitle}</span>
                </div>
                <div className="divide-y divide-gray-100 text-xs max-h-48 overflow-y-auto">
                  {parsedPdf.items.map((item, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-800">{item.description}</p>
                        {item.type === 'paver' ? (
                          <p className="text-[11px] text-gray-500">
                            {item.sqm} SQM • Color: {item.color} • {formatPHP(item.unitPriceNonVat)}/pc
                          </p>
                        ) : (
                          <p className="text-[11px] text-gray-500 whitespace-pre-line">
                            {item.details}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {item.type === 'paver' && item.pieces && (
                          <span className="font-bold text-gray-900 block">
                            {item.pieces.toLocaleString()} PCS
                          </span>
                        )}
                        <span className="text-amber-800 font-mono font-bold text-[11px] block">
                          {formatPHP(item.totalNonVat)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount & Delivery badges if present */}
              {(parsedPdf.discount?.enabled || parsedPdf.delivery?.enabled) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {parsedPdf.discount?.enabled && (
                    <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-md font-semibold">
                      {parsedPdf.discount.label}: -{formatPHP(parsedPdf.discount.amount)}
                    </span>
                  )}
                  {parsedPdf.delivery?.enabled && (
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-md font-semibold">
                      Delivery ({parsedPdf.delivery.deliveriesCount || 'Included'}):{' '}
                      {formatPHP(parsedPdf.delivery.amount)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Parsed Request Text / Image Preview Card */}
          {parsedRequest && !parsedPdf && (
            <div className="border border-green-200 bg-green-50/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-800 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Successfully Extracted Request Fields
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Client Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedRequest.clientName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Company Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedRequest.companyName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Project Name
                  </span>
                  <span className="font-semibold text-gray-800">
                    {parsedRequest.projectName || '—'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-green-200/60 shadow-sm">
                  <span className="text-gray-400 uppercase text-[10px] font-bold block">
                    Location
                  </span>
                  <span className="font-semibold text-gray-800 truncate block">
                    {parsedRequest.projectLocation || '—'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-lg border border-green-200/60 overflow-hidden shadow-sm">
                <div className="bg-green-100/50 px-3 py-1.5 text-[11px] font-bold text-green-900 border-b border-green-200">
                  Detected Line Items ({parsedRequest.items.length})
                </div>
                <div className="divide-y divide-gray-100 text-xs">
                  {parsedRequest.items.map((item, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-800">{item.productName}</p>
                        <p className="text-[11px] text-gray-500">
                          Finish:{' '}
                          <span className="font-medium text-gray-700">
                            {item.finish?.toUpperCase() || 'Classic'}
                          </span>{' '}
                          | Color:{' '}
                          <span className="font-medium text-gray-700">{item.color}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        {item.pieces || item.sqm ? (
                          <>
                            <span className="font-bold text-gray-900">
                              {item.pieces ? `${item.pieces.toLocaleString()} PCS` : ''}
                            </span>
                            {item.sqm && (
                              <span className="text-gray-500 text-[11px] block">
                                ({item.sqm} SQM)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                            Qty/Area not detected
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!hasValidData}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Apply to Quotation
          </button>
        </div>
      </div>
    </div>
  );
};
