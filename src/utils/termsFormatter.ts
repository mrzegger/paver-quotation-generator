export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSizePt?: number;
}

export interface FormattedTermsLine {
  type: 'roman-header' | 'letter-header' | 'paragraph';
  runs: RichTextRun[];
  fontSizePt?: number;
}

const INLINE_BOLD_PHRASES = [
  '• 50% Downpayment',
  '• 40% Progress Payment',
  '• 10% Remaining Balance',
  'Full Trucking Rate Penalty',
  "strictly at the Client's sole expense",
  'strictly at the Client’s sole expense',
  'not delay or alter',
  'at least fourteen (14) calendar days',
  'thirty (30) calendar days',
];

export function isHtmlTerms(text: string): boolean {
  if (!text) return false;
  return /<\/?(b|strong|i|em|u|span|div|p|br|font|ul|ol|li|h[1-6])\b/i.test(text);
}

/**
 * Splits a text segment by known bold key phrases
 */
function applyInlineBoldPhrases(text: string): RichTextRun[] {
  let runs: RichTextRun[] = [{ text, bold: false }];

  for (const phrase of INLINE_BOLD_PHRASES) {
    const nextRuns: RichTextRun[] = [];
    for (const run of runs) {
      if (run.bold || !run.text.includes(phrase)) {
        nextRuns.push(run);
        continue;
      }
      const parts = run.text.split(phrase);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) nextRuns.push({ text: parts[i], bold: false });
        if (i < parts.length - 1) {
          nextRuns.push({ text: phrase, bold: true });
        }
      }
    }
    runs = nextRuns;
  }

  return runs;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts plain terms text into clean HTML (with bold headers/clauses preserved)
 * for loading into the RichTextTermsEditor. If already HTML, returns as-is.
 */
export function termsTextToHtml(rawText: string): string {
  if (!rawText) return '';
  if (isHtmlTerms(rawText)) return rawText;

  const lines = parsePlainTermsText(rawText);
  return lines
    .map((line) => {
      const inner = line.runs
        .map((r) => {
          const escaped = escapeHtml(r.text);
          return r.bold ? `<b>${escaped}</b>` : escaped;
        })
        .join('');
      return `<div>${inner || '<br>'}</div>`;
    })
    .join('');
}

/**
 * Parses plain (non-HTML) multi-line terms string into structured lines with automatic bolding
 */
function parsePlainTermsText(rawText: string, baseFontSizePt?: number): FormattedTermsLine[] {
  const lines = rawText.split(/\r?\n/);
  const result: FormattedTermsLine[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Roman numeral section header: e.g. "I. Terms and Conditions", "II. Conditions Of Proposal", "III. ...", "IV. ..."
    if (/^(I|II|III|IV|V|VI)\.\s+/.test(line)) {
      result.push({
        type: 'roman-header',
        runs: [{ text: line, bold: true, fontSizePt: baseFontSizePt ? baseFontSizePt + 1.3 : undefined }],
        fontSizePt: baseFontSizePt ? baseFontSizePt + 1.3 : undefined,
      });
      continue;
    }

    // 2. Lettered sub-header: e.g. "A. Standard Local Delivery...", "B. ...", "C. ...", "D. ..."
    if (/^[A-Z]\.\s+/.test(line)) {
      result.push({
        type: 'letter-header',
        runs: [{ text: line, bold: true, fontSizePt: baseFontSizePt ? baseFontSizePt + 0.3 : undefined }],
        fontSizePt: baseFontSizePt ? baseFontSizePt + 0.3 : undefined,
      });
      continue;
    }

    // 3. Numbered clause or bullet with a colon prefix: e.g. "1. Late Payments: ...", "• Delivered Orders: ..."
    const colonMatch = line.match(/^((?:\d+\.|•)\s+[^:]+:)(\s*.*)$/);
    if (colonMatch) {
      const prefix = colonMatch[1];
      const rest = colonMatch[2];
      const runs: RichTextRun[] = [{ text: prefix, bold: true, fontSizePt: baseFontSizePt }];
      if (rest) {
        runs.push(
          ...applyInlineBoldPhrases(rest).map((r) => ({ ...r, fontSizePt: baseFontSizePt }))
        );
      }
      result.push({
        type: 'paragraph',
        runs,
        fontSizePt: baseFontSizePt,
      });
      continue;
    }

    // 4. Regular paragraph or bullet (check for inline bold phrases like "• 50% Downpayment")
    result.push({
      type: 'paragraph',
      runs: applyInlineBoldPhrases(line).map((r) => ({ ...r, fontSizePt: baseFontSizePt })),
      fontSizePt: baseFontSizePt,
    });
  }

  return result;
}

interface TextStyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSizePt?: number;
}

const FONT_TAG_SIZE_MAP: Record<string, number> = {
  '1': 7.5,
  '2': 8.5,
  '3': 9.2,
  '4': 10.5,
  '5': 12,
  '6': 14,
  '7': 16,
};

function parseFontSizeToPt(fontSizeStr?: string | null): number | undefined {
  if (!fontSizeStr) return undefined;
  const trimmed = fontSizeStr.trim().toLowerCase();
  if (trimmed.endsWith('pt')) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? undefined : Math.round(val * 10) / 10;
  }
  if (trimmed.endsWith('px')) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? undefined : Math.round(val * 0.75 * 10) / 10;
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? undefined : num;
}

const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
]);

/**
 * Parses HTML produced by RichTextTermsEditor into structured FormattedTermsLine array
 */
function parseHtmlTermsText(html: string, baseFontSizePt?: number): FormattedTermsLine[] {
  if (typeof DOMParser === 'undefined') {
    const stripped = html.replace(/<[^>]+>/g, '\n');
    return parsePlainTermsText(stripped, baseFontSizePt);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rawLines: RichTextRun[][] = [];
  let currentLine: RichTextRun[] = [];

  const pushCurrentLine = (forceEmpty = false) => {
    const hasText = currentLine.some((r) => r.text.trim().length > 0);
    if (hasText || forceEmpty) {
      // Merge adjacent runs with identical styling
      const merged: RichTextRun[] = [];
      for (const run of currentLine) {
        const cleanedText = run.text.replace(/\u00A0/g, ' ');
        if (!cleanedText) continue;
        const prev = merged[merged.length - 1];
        if (
          prev &&
          prev.bold === run.bold &&
          prev.italic === run.italic &&
          prev.underline === run.underline &&
          prev.fontSizePt === run.fontSizePt
        ) {
          prev.text += cleanedText;
        } else {
          merged.push({ ...run, text: cleanedText });
        }
      }
      if (merged.length > 0 || forceEmpty) {
        rawLines.push(merged.length > 0 ? merged : [{ text: '' }]);
      }
    }
    currentLine = [];
  };

  const walk = (node: Node, style: TextStyleState) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return;
      const parts = text.split(/\r?\n/);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          currentLine.push({
            text: parts[i],
            bold: style.bold,
            italic: style.italic,
            underline: style.underline,
            fontSizePt: style.fontSizePt,
          });
        }
        if (i < parts.length - 1) {
          pushCurrentLine();
        }
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR') {
      // If currentLine is empty inside a block element, treat BR as line break
      pushCurrentLine(currentLine.length === 0);
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && currentLine.length > 0) {
      pushCurrentLine();
    }

    const nextStyle: TextStyleState = { ...style };
    if (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag)) {
      nextStyle.bold = true;
    }
    if (tag === 'I' || tag === 'EM') {
      nextStyle.italic = true;
    }
    if (tag === 'U') {
      nextStyle.underline = true;
    }

    const inlineStyle = el.style;
    if (inlineStyle) {
      const fw = inlineStyle.fontWeight;
      if (fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600) {
        nextStyle.bold = true;
      } else if (fw === 'normal' || (parseInt(fw, 10) > 0 && parseInt(fw, 10) < 500)) {
        nextStyle.bold = false;
      }

      if (inlineStyle.fontStyle === 'italic' || inlineStyle.fontStyle === 'oblique') {
        nextStyle.italic = true;
      } else if (inlineStyle.fontStyle === 'normal') {
        nextStyle.italic = false;
      }

      const td = inlineStyle.textDecoration || inlineStyle.textDecorationLine || '';
      if (td.includes('underline')) {
        nextStyle.underline = true;
      } else if (td === 'none') {
        nextStyle.underline = false;
      }

      const parsedPt =
        parseFontSizeToPt(el.getAttribute('data-font-size')) ||
        parseFontSizeToPt(inlineStyle.fontSize);
      if (parsedPt) {
        nextStyle.fontSizePt = parsedPt;
      }
    }

    if (tag === 'FONT') {
      const sizeAttr = el.getAttribute('size');
      if (sizeAttr && FONT_TAG_SIZE_MAP[sizeAttr]) {
        nextStyle.fontSizePt = FONT_TAG_SIZE_MAP[sizeAttr];
      }
    }

    if (tag === 'LI') {
      const firstChildText = (el.textContent || '').trim();
      if (!firstChildText.startsWith('•')) {
        currentLine.push({
          text: '• ',
          bold: nextStyle.bold,
          italic: nextStyle.italic,
          underline: nextStyle.underline,
          fontSizePt: nextStyle.fontSizePt,
        });
      }
    }

    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i], nextStyle);
    }

    if (isBlock) {
      pushCurrentLine();
    }
  };

  walk(doc.body, {
    bold: false,
    italic: false,
    underline: false,
    fontSizePt: baseFontSizePt,
  });
  pushCurrentLine();

  // Drop leading/trailing blank lines
  while (rawLines.length > 0 && rawLines[0].every((r) => !r.text.trim())) {
    rawLines.shift();
  }
  while (rawLines.length > 0 && rawLines[rawLines.length - 1].every((r) => !r.text.trim())) {
    rawLines.pop();
  }

  return rawLines.map((runs) => {
    const plainLine = runs.map((r) => r.text).join('').trim();
    if (/^(I|II|III|IV|V|VI)\.\s+/.test(plainLine)) {
      return {
        type: 'roman-header',
        runs: runs.map((r) => ({ ...r, bold: r.bold !== false })),
        fontSizePt: baseFontSizePt ? baseFontSizePt + 1.3 : undefined,
      };
    }
    if (/^[A-Z]\.\s+/.test(plainLine)) {
      return {
        type: 'letter-header',
        runs: runs.map((r) => ({ ...r, bold: r.bold !== false })),
        fontSizePt: baseFontSizePt ? baseFontSizePt + 0.3 : undefined,
      };
    }
    return {
      type: 'paragraph',
      runs,
      fontSizePt: baseFontSizePt,
    };
  });
}

/**
 * Parses a multi-line or rich-text HTML terms string into structured lines for both preview and PDF export.
 */
export function parseTermsText(rawText: string, baseFontSizePt?: number): FormattedTermsLine[] {
  if (!rawText) return [];
  if (isHtmlTerms(rawText)) {
    return parseHtmlTermsText(rawText, baseFontSizePt);
  }
  return parsePlainTermsText(rawText, baseFontSizePt);
}
