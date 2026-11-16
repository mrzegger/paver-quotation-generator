import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, List, RotateCcw, Type, RemoveFormatting } from 'lucide-react';
import { termsTextToHtml } from '../utils/termsFormatter';

interface RichTextTermsEditorProps {
  label: string;
  value: string;
  baseFontSizePt?: number;
  onChange: (newHtml: string) => void;
  onReset: () => void;
}

const SELECTION_FONT_SIZES = [
  { label: '8 pt', pt: 8 },
  { label: '8.5 pt', pt: 8.5 },
  { label: '9.2 pt (Std)', pt: 9.2 },
  { label: '10 pt', pt: 10 },
  { label: '11 pt', pt: 11 },
  { label: '12 pt', pt: 12 },
  { label: '14 pt', pt: 14 },
];

export const RichTextTermsEditor: React.FC<RichTextTermsEditorProps> = ({
  label,
  value,
  baseFontSizePt = 9.2,
  onChange,
  onReset,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedHtmlRef = useRef<string>('');
  const savedRangeRef = useRef<Range | null>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  // Sync external value changes (initial load, loading draft, Reset to Default) without breaking cursor
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const normalizedHtml = termsTextToHtml(value || '');
    if (normalizedHtml !== lastEmittedHtmlRef.current && el.innerHTML !== normalizedHtml) {
      el.innerHTML = normalizedHtml;
      lastEmittedHtmlRef.current = el.innerHTML;
    }
  }, [value]);

  const updateActiveFormats = () => {
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      // ignore if unsupported in current selection context
    }
  };

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastEmittedHtmlRef.current = html;
    onChange(html);
    updateActiveFormats();
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const execFormat = (command: string, valueArg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, valueArg);
    emitChange();
  };

  const handleSelectionFontSize = (ptStr: string) => {
    if (!ptStr) return;
    const pt = parseFloat(ptStr);
    if (isNaN(pt)) return;

    restoreSelection();
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    if (sel.isCollapsed) {
      // Wrap an empty placeholder or insert styled span for typing
      document.execCommand('fontSize', false, '7');
      const fontEls = el.querySelectorAll('font[size="7"]');
      fontEls.forEach((fontEl) => {
        const span = document.createElement('span');
        span.style.fontSize = `${pt}pt`;
        span.setAttribute('data-font-size', `${pt}pt`);
        while (fontEl.firstChild) {
          span.appendChild(fontEl.firstChild);
        }
        fontEl.parentNode?.replaceChild(span, fontEl);
      });
    } else {
      document.execCommand('fontSize', false, '7');
      const fontEls = el.querySelectorAll('font[size="7"]');
      fontEls.forEach((fontEl) => {
        const span = document.createElement('span');
        span.style.fontSize = `${pt}pt`;
        span.setAttribute('data-font-size', `${pt}pt`);
        while (fontEl.firstChild) {
          span.appendChild(fontEl.firstChild);
        }
        fontEl.parentNode?.replaceChild(span, fontEl);
      });
    }

    emitChange();
  };

  const handleInsertBullet = () => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, '• ');
    emitChange();
  };

  const handleClearFormatting = () => {
    editorRef.current?.focus();
    document.execCommand('removeFormat', false);
    emitChange();
  };

  return (
    <div className="space-y-1.5 pt-2 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <label className="font-bold text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => {
            lastEmittedHtmlRef.current = '';
            onReset();
          }}
          className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset to Default
        </button>
      </div>

      {/* Rich Text Formatting Toolbar */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-500">
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-gray-100 border-b border-gray-200">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('bold');
            }}
            title="Bold (Ctrl/Cmd + B)"
            className={`p-1.5 rounded text-xs transition ${
              activeFormats.bold
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('italic');
            }}
            title="Italic (Ctrl/Cmd + I)"
            className={`p-1.5 rounded text-xs transition ${
              activeFormats.italic
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('underline');
            }}
            title="Underline (Ctrl/Cmd + U)"
            className={`p-1.5 rounded text-xs transition ${
              activeFormats.underline
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-gray-300 mx-1" />

          {/* Selection Font Size Picker */}
          <div className="flex items-center gap-1" onMouseDown={saveSelection}>
            <Type className="w-3.5 h-3.5 text-gray-500 ml-0.5" />
            <select
              value=""
              onChange={(e) => {
                handleSelectionFontSize(e.target.value);
              }}
              title="Set font size for selected text"
              className="text-[11px] font-semibold bg-white border border-gray-300 rounded px-1.5 py-1 text-gray-700 hover:border-gray-400 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                Text Size...
              </option>
              {SELECTION_FONT_SIZES.map((s) => (
                <option key={s.pt} value={s.pt}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-gray-300 mx-1" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleInsertBullet();
            }}
            title="Insert Bullet (•)"
            className="px-2 py-1 rounded text-[11px] font-semibold text-gray-700 hover:bg-gray-200 flex items-center gap-1 transition"
          >
            <List className="w-3.5 h-3.5" />
            <span>• Bullet</span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleClearFormatting();
            }}
            title="Clear formatting on selected text"
            className="p-1.5 rounded text-xs text-gray-600 hover:bg-gray-200 transition ml-auto"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rich Text Editable Surface */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyUp={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          onBlur={emitChange}
          style={{ fontSize: `${Math.max(11, Math.round(baseFontSizePt * 1.25))}px` }}
          className="w-full min-h-[220px] max-h-[360px] overflow-y-auto p-3 bg-white font-sans leading-relaxed text-gray-900 focus:outline-none [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline"
        />
      </div>
      <p className="text-[10.5px] text-gray-500">
        Highlight any text to apply <strong>Bold</strong>, <em>Italic</em>, <u>Underline</u>, or custom <strong>Text Size</strong>. Changes reflect directly in both Live Preview and PDF export.
      </p>
    </div>
  );
};
