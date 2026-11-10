import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Sparkles,
  Percent,
  Truck,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Building2,
  Calendar,
  Hash,
  MapPin,
  User,
  RotateCcw,
  Tag,
  Briefcase,
} from 'lucide-react';
import {
  QuotationData,
  getNextQuotationNumber,
  DEFAULT_TERMS_PAGE_1,
  DEFAULT_TERMS_PAGE_2,
} from '../utils/storage';
import { PaverItem, PaverFinish, STANDARD_COLORS } from '../data/paverCatalog';
import {
  QuotationLineItem,
  calculatePaverUnitPrice,
  sqmToPieces,
  piecesToSqm,
  calculateQuotationSummary,
  formatPHP,
} from '../utils/pricingCalculator';

interface QuotationEditorProps {
  quote: QuotationData;
  catalog: PaverItem[];
  onChange: (updated: QuotationData) => void;
  onOpenImporter: () => void;
  onOpenPriceList: () => void;
}

const HEADER_TITLE_PRESETS = [
  'Paver (Delivered)',
  'Paver (Pick-up)',
  'Paver (Supply & Install)',
  'Paver (Ex-Works)',
];

export const QuotationEditor: React.FC<QuotationEditorProps> = ({
  quote,
  catalog,
  onChange,
  onOpenImporter,
  onOpenPriceList,
}) => {
  const [showTermsAccordion, setShowTermsAccordion] = useState(false);
  const summary = calculateQuotationSummary(quote.items, quote.discount, quote.delivery);

  // Field change handlers
  const updateField = <K extends keyof QuotationData>(key: K, value: QuotationData[K]) => {
    onChange({ ...quote, [key]: value });
  };

  // Toggle delivery and automatically sync "Paver (Delivered)" <-> "Paver (Pick-up)" if using standard headers
  const handleToggleDelivery = (enabled: boolean) => {
    const currentHeader = quote.tableHeaderTitle || 'Paver (Delivered)';
    let nextHeader = currentHeader;
    if (
      enabled &&
      (currentHeader.toLowerCase().includes('pick') || currentHeader.trim() === '')
    ) {
      nextHeader = 'Paver (Delivered)';
    } else if (
      !enabled &&
      (currentHeader.toLowerCase().includes('delivered') || currentHeader.trim() === '')
    ) {
      nextHeader = 'Paver (Pick-up)';
    }

    onChange({
      ...quote,
      tableHeaderTitle: nextHeader,
      delivery: {
        ...quote.delivery,
        enabled,
      },
    });
  };

  // Add a new paver item
  const handleAddPaverItem = () => {
    const defaultPaver = catalog[0]; // brick
    const finish: PaverFinish = 'classic';
    const color = 'Cement Gray';
    const isColored = false;
    const pcsPerSqm = defaultPaver.pcsPerSqm;
    const defaultSqm = 50;
    const pieces = sqmToPieces(defaultSqm, pcsPerSqm);
    const baseVatInc = defaultPaver.pricesVatInc.classic || 20;
    const unitPriceNonVat = calculatePaverUnitPrice(baseVatInc, pcsPerSqm, isColored, 0);
    const totalNonVat = Math.round((pieces * unitPriceNonVat + Number.EPSILON) * 100) / 100;

    const newItem: QuotationLineItem = {
      id: `item-${Date.now()}`,
      type: 'paver',
      paverId: defaultPaver.id,
      category: defaultPaver.category,
      name: defaultPaver.name,
      finish,
      dimensions: defaultPaver.dimensions,
      pcsPerSqm,
      color,
      isCustomColor: false,
      isColoredSurcharge: isColored,
      colorSurchargePerSqm: 0,
      sqm: defaultSqm,
      pieces,
      description: `Classic ${defaultPaver.defaultDisplayName || defaultPaver.name} - ${defaultPaver.dimensions}`,
      details: `• ${pcsPerSqm} pcs/sqm\n${defaultSqm.toFixed(2)} SQM\n• Color:${color}`,
      unitPriceVatInc: baseVatInc,
      unitPriceNonVat,
      totalNonVat,
    };

    updateField('items', [...quote.items, newItem]);
  };

  // Add custom fee item
  const handleAddCustomItem = () => {
    const newItem: QuotationLineItem = {
      id: `custom-${Date.now()}`,
      type: 'custom',
      description: 'MOLD CUSTOMIZATION FEE:',
      details: 'Size: 400x600x100mm\nLeadtime: 3-4 months',
      pieces: 1,
      unitPriceNonVat: 250000,
      totalNonVat: 250000,
    };
    updateField('items', [...quote.items, newItem]);
  };

  // Update existing line item
  const updateLineItem = (index: number, updates: Partial<QuotationLineItem>) => {
    const newItems = [...quote.items];
    const current = newItems[index];
    const updated = { ...current, ...updates };

    // If paver properties changed, recalculate prices
    if (updated.type === 'paver') {
      const paver = catalog.find((p) => p.id === updated.paverId) || catalog[0];
      const finish = updated.finish || 'classic';
      const isColored = updated.isColoredSurcharge ?? false;
      const surchargePerSqm = updated.colorSurchargePerSqm !== undefined
        ? updated.colorSurchargePerSqm
        : (isColored ? 300 : 0);
      const baseVatInc = paver.pricesVatInc[finish] || paver.pricesVatInc.classic || 0;
      const pcsPerSqm = paver.pcsPerSqm;

      // Handle SQM / Pieces sync
      let pieces = updated.pieces ?? 0;
      let sqm = updated.sqm ?? 0;

      if ('sqm' in updates && updates.sqm !== undefined) {
        pieces = sqmToPieces(updates.sqm, pcsPerSqm);
        updated.pieces = pieces;
      } else if ('pieces' in updates && updates.pieces !== undefined) {
        sqm = piecesToSqm(updates.pieces, pcsPerSqm);
        updated.sqm = sqm;
      }

      const unitPriceNonVat = calculatePaverUnitPrice(baseVatInc, pcsPerSqm, isColored, surchargePerSqm);
      const totalNonVat = Math.round((pieces * unitPriceNonVat + Number.EPSILON) * 100) / 100;

      const finishPrefix = finish === 'classic' ? 'Classic' : finish.toUpperCase() + ' Pervious';
      updated.description = `${finishPrefix} ${paver.defaultDisplayName || paver.name} - ${paver.dimensions}`;
      updated.details = `• ${pcsPerSqm} pcs/sqm\n${sqm.toFixed(2)} SQM\n• Color:${updated.color || 'Cement Gray'}`;
      updated.dimensions = paver.dimensions;
      updated.pcsPerSqm = pcsPerSqm;
      updated.unitPriceVatInc = baseVatInc;
      updated.unitPriceNonVat = unitPriceNonVat;
      updated.totalNonVat = totalNonVat;
      updated.colorSurchargePerSqm = surchargePerSqm;
    } else if (updated.type === 'custom') {
      updated.totalNonVat = updated.unitPriceNonVat || 0;
    }

    newItems[index] = updated;
    updateField('items', newItems);
  };

  const deleteLineItem = (index: number) => {
    const newItems = quote.items.filter((_, i) => i !== index);
    updateField('items', newItems);
  };

  const duplicateLineItem = (index: number) => {
    const item = quote.items[index];
    const duplicated = {
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    const newItems = [...quote.items];
    newItems.splice(index + 1, 0, duplicated);
    updateField('items', newItems);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-900 text-white rounded-lg">
            <Building2 className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Quotation Details</h2>
            <p className="text-xs text-gray-500">Configure client specs, line items, and pricing</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenImporter}
            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Import from Request
          </button>
          <button
            type="button"
            onClick={onOpenPriceList}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            Price List
          </button>
        </div>
      </div>

      {/* Quotation Header Metadata Form */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quotation Number */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                Quotation Number
              </span>
              <button
                type="button"
                onClick={() => updateField('quotationNumber', getNextQuotationNumber())}
                className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 font-medium"
              >
                <RefreshCw className="w-3 h-3" /> Auto-Next
              </button>
            </label>
            <input
              type="text"
              value={quote.quotationNumber}
              onChange={(e) => updateField('quotationNumber', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="2026-KPS-Q-193"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              Quotation Date
            </label>
            <input
              type="text"
              value={quote.date}
              onChange={(e) => updateField('date', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="10-Nov-26"
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
              value={quote.clientName}
              onChange={(e) => updateField('clientName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Raf Lyndon Ferrer / Mr. Jay A. Marcia"
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
              value={quote.companyName || ''}
              onChange={(e) => updateField('companyName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. JOC Fabrication and Construction Corporation"
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
              value={quote.projectName}
              onChange={(e) => updateField('projectName', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Parañaque Bridge / Marcelo residence"
            />
          </div>

          {/* Project Location */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              Project Location / Delivery Address
            </label>
            <input
              type="text"
              value={quote.projectLocation}
              onChange={(e) => updateField('projectLocation', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="e.g. Brgy. Tambo, Parañaque City"
            />
          </div>

          {/* Table Heading / Fulfillment Label */}
          <div className="md:col-span-2 pt-1 border-t border-gray-100">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-red-700" />
                Table Heading Label (Red Header Above Table)
              </span>
              <span className="text-[10px] font-normal text-gray-400">
                Auto-updates when toggling Delivery, or type custom text
              </span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={quote.tableHeaderTitle ?? 'Paver (Delivered)'}
                onChange={(e) => updateField('tableHeaderTitle', e.target.value)}
                className="flex-1 p-2 border border-gray-300 rounded-lg text-xs font-bold text-red-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                placeholder="e.g. Paver (Delivered) or Paver (Pick-up)"
              />
              <div className="flex flex-wrap gap-1.5">
                {HEADER_TITLE_PRESETS.map((preset) => {
                  const isActive = (quote.tableHeaderTitle || 'Paver (Delivered)') === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const isDeliv = preset.toLowerCase().includes('delivered');
                        const isPick = preset.toLowerCase().includes('pick');
                        onChange({
                          ...quote,
                          tableHeaderTitle: preset,
                          delivery: {
                            ...quote.delivery,
                            enabled: isDeliv ? true : isPick ? false : quote.delivery.enabled,
                          },
                        });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                        isActive
                          ? 'bg-red-50 text-red-800 border-red-300 shadow-xs'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Section */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-gray-900">Line Items ({quote.items.length})</h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddCustomItem}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Fee
            </button>
            <button
              type="button"
              onClick={handleAddPaverItem}
              className="px-3.5 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              Add Paver
            </button>
          </div>
        </div>

        {/* Line Items List */}
        <div className="space-y-4">
          {quote.items.length === 0 && (
            <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center space-y-2 bg-gray-50/50">
              <Layers className="w-7 h-7 text-gray-300 mx-auto" />
              <p className="text-xs font-semibold text-gray-600">No line items added yet</p>
              <p className="text-[11px] text-gray-400">
                Click <span className="font-bold text-gray-600">+ Add Paver</span> above to add an item, or use <span className="font-bold text-amber-600">Import from Request</span> to load a request or existing quotation PDF.
              </p>
            </div>
          )}
          {quote.items.map((item, idx) => {
            if (item.type === 'custom') {
              return (
                <div
                  key={item.id}
                  className="p-4 border border-purple-200 bg-purple-50/30 rounded-xl space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                      Custom Fee Item
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteLineItem(idx)}
                      className="text-gray-400 hover:text-red-600 p-1 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                        placeholder="Description (e.g. MOLD CUSTOMIZATION FEE:)"
                        className="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold"
                      />
                      <textarea
                        value={item.details || ''}
                        onChange={(e) => updateLineItem(idx, { details: e.target.value })}
                        placeholder="Details (e.g. Size: 400x600x100mm\nLeadtime: 3-4 months)"
                        rows={2}
                        className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Amount (PHP Non-VAT)
                      </label>
                      <input
                        type="number"
                        value={item.unitPriceNonVat || ''}
                        onChange={(e) =>
                          updateLineItem(idx, { unitPriceNonVat: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full p-2 border border-gray-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              );
            }

            // Paver item card
            const currentPaver = catalog.find((p) => p.id === item.paverId) || catalog[0];

            return (
              <div
                key={item.id}
                className="p-4 border border-gray-200 hover:border-amber-300 bg-white rounded-xl shadow-xs space-y-4 transition"
              >
                {/* Header row */}
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-xs text-gray-800">{item.description}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => duplicateLineItem(idx)}
                      title="Duplicate Item"
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLineItem(idx)}
                      title="Delete Item"
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Configuration Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Paver Product Dropdown */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Paver Product & Dimensions
                    </label>
                    <select
                      value={item.paverId || currentPaver.id}
                      onChange={(e) => updateLineItem(idx, { paverId: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      {['Rectangular', 'Square', 'Plank', 'Special'].map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {catalog
                            .filter((p) => p.category === cat)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.category}: {p.name} ({p.dimensions}) - {p.pcsPerSqm} pcs/sqm
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Finish Selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Finish</label>
                    <select
                      value={item.finish || 'classic'}
                      onChange={(e) =>
                        updateLineItem(idx, { finish: e.target.value as PaverFinish })
                      }
                      className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      <option value="classic">Classic (Standard)</option>
                      {currentPaver.pricesVatInc.g1 !== undefined && (
                        <option value="g1">G1 Pervious (Super-Fine)</option>
                      )}
                      {currentPaver.pricesVatInc.g2 !== undefined && (
                        <option value="g2">G2 Pervious (Fine)</option>
                      )}
                      {currentPaver.pricesVatInc.g3 !== undefined && (
                        <option value="g3">G3 Pervious (Coarse)</option>
                      )}
                    </select>
                  </div>

                  {/* Color Dropdown & Custom Color Surcharge Editor */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center justify-between">
                      <span>Color</span>
                      {item.isColoredSurcharge && (
                        <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded">
                          +₱{(item.colorSurchargePerSqm ?? 300).toFixed(0)}/sqm
                        </span>
                      )}
                    </label>
                    <select
                      value={
                        item.isCustomColor ||
                        (item.color &&
                          !STANDARD_COLORS.some(
                            (c) => c.name.toLowerCase() === item.color?.toLowerCase()
                          ))
                          ? '__CUSTOM__'
                          : item.color || 'Cement Gray'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          const existingColor =
                            item.color &&
                            !STANDARD_COLORS.some(
                              (c) => c.name.toLowerCase() === item.color?.toLowerCase()
                            )
                              ? item.color
                              : 'Custom Color';
                          updateLineItem(idx, {
                            isCustomColor: true,
                            color: existingColor,
                            isColoredSurcharge: true,
                            colorSurchargePerSqm: item.colorSurchargePerSqm || 300,
                          });
                        } else {
                          const isGray =
                            val.toLowerCase().includes('cement') ||
                            val.toLowerCase() === 'gray';
                          updateLineItem(idx, {
                            isCustomColor: false,
                            color: val,
                            isColoredSurcharge: !isGray,
                            colorSurchargePerSqm: isGray ? 0 : 300,
                          });
                        }
                      }}
                      className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      {STANDARD_COLORS.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} {c.isGray ? '(Base Gray)' : '(+₱300/sqm)'}
                        </option>
                      ))}
                      <option value="__CUSTOM__">✨ Custom Color...</option>
                    </select>

                    {/* Custom Color Name Input */}
                    {(item.isCustomColor ||
                      (item.color &&
                        !STANDARD_COLORS.some(
                          (c) => c.name.toLowerCase() === item.color?.toLowerCase()
                        ))) && (
                      <div className="pt-1">
                        <input
                          type="text"
                          value={item.color || ''}
                          onChange={(e) => updateLineItem(idx, { color: e.target.value })}
                          placeholder="Type custom color name..."
                          className="w-full p-1.5 border border-amber-300 rounded-md text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-amber-50/30"
                        />
                      </div>
                    )}

                    {/* Editable Surcharge Price (for custom color or colored paver) */}
                    {item.isColoredSurcharge && (
                      <div className="flex items-center justify-between gap-1 text-[11px] bg-amber-50/70 p-1.5 rounded-md border border-amber-200">
                        <span className="font-semibold text-amber-900 text-[10px] uppercase">
                          Surcharge:
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs font-bold text-amber-900">₱</span>
                          <input
                            type="number"
                            step="10"
                            min="0"
                            value={item.colorSurchargePerSqm ?? 300}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              updateLineItem(idx, {
                                colorSurchargePerSqm: val,
                                isColoredSurcharge: val > 0,
                              });
                            }}
                            className="w-16 p-0.5 px-1 border border-amber-300 rounded text-xs font-mono font-bold text-center bg-white focus:ring-1 focus:ring-amber-500"
                            title="Editable color surcharge in PHP per sqm (added to non-VAT base price)"
                          />
                          <span className="text-[10px] text-gray-500">/sqm</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bi-directional Quantity and Pricing Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {/* Area SQM */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Area (SQM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.sqm ?? ''}
                      onChange={(e) =>
                        updateLineItem(idx, { sqm: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full p-1.5 border border-gray-300 rounded text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 bg-white"
                      placeholder="e.g. 50"
                    />
                  </div>

                  {/* Pieces (PCS) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Quantity (Pieces)
                    </label>
                    <input
                      type="number"
                      value={item.pieces ?? ''}
                      onChange={(e) =>
                        updateLineItem(idx, { pieces: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full p-1.5 border border-gray-300 rounded text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 bg-white"
                      placeholder="e.g. 1,250"
                    />
                  </div>

                  {/* Unit Price Non-VAT */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Unit Price / Pc
                    </label>
                    <div className="p-1.5 text-xs font-mono font-bold text-gray-800 bg-gray-100 rounded border border-gray-200">
                      {formatPHP(item.unitPriceNonVat || 0)}
                    </div>
                  </div>

                  {/* Line Total Non-VAT */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Line Total
                    </label>
                    <div className="p-1.5 text-xs font-mono font-bold text-amber-900 bg-amber-50/70 rounded border border-amber-200">
                      {formatPHP(item.totalNonVat || 0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Adjustments: Discount & Delivery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Paver Discount */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={quote.discount.enabled}
                onChange={(e) =>
                  updateField('discount', { ...quote.discount, enabled: e.target.checked })
                }
                className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
              />
              <Percent className="w-3.5 h-3.5 text-red-600" />
              Apply Paver Discount
            </label>
            {quote.discount.enabled && (
              <span className="text-xs font-bold text-red-600">
                -{formatPHP(summary.discountAmount)}
              </span>
            )}
          </div>

          {quote.discount.enabled && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Discount Type
                </label>
                <select
                  value={quote.discount.type}
                  onChange={(e) =>
                    updateField('discount', { ...quote.discount, type: e.target.value as any })
                  }
                  className="w-full p-1.5 border border-gray-300 rounded text-xs font-medium bg-white"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (PHP)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Discount Value
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={quote.discount.value || ''}
                  onChange={(e) =>
                    updateField('discount', {
                      ...quote.discount,
                      value: parseFloat(e.target.value) || 0,
                      label:
                        quote.discount.type === 'percentage'
                          ? `PAVER DISCOUNT: ${(parseFloat(e.target.value) || 0).toFixed(2)}%`
                          : quote.discount.label,
                    })
                  }
                  className="w-full p-1.5 border border-gray-300 rounded text-xs font-mono font-bold"
                  placeholder={quote.discount.type === 'percentage' ? 'e.g. 10.00' : 'e.g. 20000'}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Discount Label
                </label>
                <input
                  type="text"
                  value={quote.discount.label || ''}
                  onChange={(e) =>
                    updateField('discount', { ...quote.discount, label: e.target.value })
                  }
                  placeholder={`PAVER DISCOUNT: ${quote.discount.value || 0}%`}
                  className="w-full p-1.5 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Delivery Charge */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={quote.delivery.enabled}
                onChange={(e) => handleToggleDelivery(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
              />
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              Include Delivery Fee
            </label>
            {quote.delivery.enabled && (
              <span className="text-xs font-bold text-blue-600">
                {formatPHP(quote.delivery.amount)}
              </span>
            )}
          </div>

          {quote.delivery.enabled && (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Delivery Description
                  </label>
                  <input
                    type="text"
                    value={quote.delivery.description}
                    onChange={(e) =>
                      updateField('delivery', { ...quote.delivery, description: e.target.value })
                    }
                    className="w-full p-1.5 border border-gray-300 rounded text-xs"
                    placeholder="• Delivered to site (20T Trucks)"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Deliveries Count
                  </label>
                  <input
                    type="text"
                    value={quote.delivery.deliveriesCount || ''}
                    onChange={(e) =>
                      updateField('delivery', {
                        ...quote.delivery,
                        deliveriesCount: e.target.value,
                      })
                    }
                    className="w-full p-1.5 border border-gray-300 rounded text-xs"
                    placeholder="2 Deliveries"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Delivery Fee (PHP Non-VAT)
                </label>
                <input
                  type="number"
                  value={quote.delivery.amount || ''}
                  onChange={(e) =>
                    updateField('delivery', {
                      ...quote.delivery,
                      amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full p-1.5 border border-gray-300 rounded text-xs font-mono font-bold"
                  placeholder="e.g. 60000"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Financial Summary Card */}
      <div className="p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl shadow-lg space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
          Quotation Total Breakdown
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-300">
            <span>Pavers Subtotal:</span>
            <span className="font-mono">{formatPHP(summary.paversSubtotal)}</span>
          </div>

          {summary.discountAmount > 0 && (
            <div className="flex justify-between text-red-400">
              <span>Paver Discount:</span>
              <span className="font-mono">-{formatPHP(summary.discountAmount)}</span>
            </div>
          )}

          {summary.customSubtotal > 0 && (
            <div className="flex justify-between text-purple-300">
              <span>Custom Fees:</span>
              <span className="font-mono">{formatPHP(summary.customSubtotal)}</span>
            </div>
          )}

          {summary.deliveryAmount > 0 && (
            <div className="flex justify-between text-blue-300">
              <span>Delivery Charges:</span>
              <span className="font-mono">{formatPHP(summary.deliveryAmount)}</span>
            </div>
          )}

          <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold text-gray-200">
            <span>Total Amount (Non-VAT):</span>
            <span className="font-mono">{formatPHP(summary.totalBeforeVat)}</span>
          </div>

          <div className="flex justify-between text-amber-300/90 font-semibold">
            <span>Plus: 12% Vat:</span>
            <span className="font-mono">{formatPHP(summary.vatAmount)}</span>
          </div>

          <div className="border-t-2 border-amber-500/60 pt-2.5 flex justify-between text-sm md:text-base font-extrabold text-amber-400">
            <span>GRAND TOTAL CONTRACT PRICE:</span>
            <span className="font-mono text-white bg-amber-600/30 px-2 py-0.5 rounded border border-amber-500/40">
              {formatPHP(summary.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions, Payment Details, and Signatory Accordion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTermsAccordion(!showTermsAccordion)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold text-gray-800">
              Terms & Conditions, Payment Details, and Signatory
            </span>
          </div>
          {showTermsAccordion ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {showTermsAccordion && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-5 text-xs">
            {/* Signatory & Bank Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Signatory Name</label>
                <input
                  type="text"
                  value={quote.signatory.name}
                  onChange={(e) =>
                    updateField('signatory', { ...quote.signatory, name: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Signatory Title</label>
                <input
                  type="text"
                  value={quote.signatory.title}
                  onChange={(e) =>
                    updateField('signatory', { ...quote.signatory, title: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Checks Payable To</label>
                <input
                  type="text"
                  value={quote.paymentDetails.payableTo}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...quote.paymentDetails,
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
                  value={quote.paymentDetails.bankName}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...quote.paymentDetails,
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
                  value={quote.paymentDetails.accountNumber}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...quote.paymentDetails,
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
                  value={quote.paymentDetails.accountName}
                  onChange={(e) =>
                    updateField('paymentDetails', {
                      ...quote.paymentDetails,
                      accountName: e.target.value,
                    })
                  }
                  className="w-full p-2 border border-gray-300 rounded bg-white text-xs"
                />
              </div>
            </div>

            {/* Editable Terms & Conditions Page 1 */}
            <div className="space-y-1.5 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-700">
                  Terms & Conditions — Page 1 (Sections I & II)
                </label>
                <button
                  type="button"
                  onClick={() => updateField('termsPage1', DEFAULT_TERMS_PAGE_1)}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Default
                </button>
              </div>
              <textarea
                rows={12}
                value={quote.termsPage1 ?? DEFAULT_TERMS_PAGE_1}
                onChange={(e) => updateField('termsPage1', e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-xs font-sans leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Editable Terms & Conditions Page 2 */}
            <div className="space-y-1.5 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-700">
                  Terms & Conditions — Page 2 (Sections C, D, III & IV)
                </label>
                <button
                  type="button"
                  onClick={() => updateField('termsPage2', DEFAULT_TERMS_PAGE_2)}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Default
                </button>
              </div>
              <textarea
                rows={12}
                value={quote.termsPage2 ?? DEFAULT_TERMS_PAGE_2}
                onChange={(e) => updateField('termsPage2', e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-xs font-sans leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
