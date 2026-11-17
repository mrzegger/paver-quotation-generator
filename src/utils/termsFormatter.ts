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
  'subject to the prevailing production queue',
  'mandatory curing period of at least fourteen (14) calendar days',
  'thirty (30) calendar days',
  'KUMA CONCRETE',
];

export function isHtmlTerms(text: string): boolean {
  if (!text) return false;
  return /<\/?(b|strong|i|em|u|span|div|p|br|font|ul|ol|li|h[1-6])\b/i.test(text);
}

export function upgradeLegacySectionIII(rawText: string): string {
  if (!rawText) return rawText;
  const legacyRegex =
    /If requested concrete pavers or products are not currently in stock,\s*a mandatory curing period of\s*(?:<\/?(?:b|strong)[^>]*>\s*)*at least fourteen \(14\) calendar days(?:\s*<\/(?:b|strong)>)*\s*is required prior to dispatch\.\s*Final project completion dates shall be established upon downpayment confirmation\./gi;

  if (!legacyRegex.test(rawText)) return rawText;
  legacyRegex.lastIndex = 0;

  if (isHtmlTerms(rawText)) {
    return rawText.replace(
      legacyRegex,
      'If requested concrete pavers or products are not currently in stock, production schedules are <b>subject to the prevailing production queue</b>, followed by a <b>mandatory curing period of at least fourteen (14) calendar days</b> prior to dispatch. Final delivery or project completion dates shall be confirmed in writing upon downpayment confirmation.'
    );
  }

  return rawText.replace(
    legacyRegex,
    'If requested concrete pavers or products are not currently in stock, production schedules are subject to the prevailing production queue, followed by a mandatory curing period of at least fourteen (14) calendar days prior to dispatch. Final delivery or project completion dates shall be confirmed in writing upon downpayment confirmation.'
  );
}

/**
 * Splits a text segment by known bold key phrases while preserving inherited styling
 */
function applyInlineBoldPhrases(
  text: string,
  baseStyle?: Omit<RichTextRun, 'text'>
): RichTextRun[] {
  let runs: RichTextRun[] = [{ ...baseStyle, text, bold: baseStyle?.bold ?? false }];

  for (const phrase of INLINE_BOLD_PHRASES) {
    const nextRuns: RichTextRun[] = [];
    for (const run of runs) {
      if (run.bold || !run.text.includes(phrase)) {
        nextRuns.push(run);
        continue;
      }
      const parts = run.text.split(phrase);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) nextRuns.push({ ...run, text: parts[i], bold: false });
        if (i < parts.length - 1) {
          nextRuns.push({ ...run, text: phrase, bold: true });
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
 * Converts FormattedTermsLine[] back into clean rich-text HTML preserving bold, italic, underline, and custom font sizes.
 */
export function formattedLinesToHtml(
  lines: FormattedTermsLine[],
  includeBlockDivs: boolean = true
): string {
  const renderRun = (r: RichTextRun) => {
    let out = escapeHtml(r.text);
    if (!out) return '';
    if (r.fontSizePt) {
      out = `<span style="font-size: ${r.fontSizePt}pt" data-font-size="${r.fontSizePt}pt">${out}</span>`;
    }
    if (r.underline) out = `<u>${out}</u>`;
    if (r.italic) out = `<i>${out}</i>`;
    if (r.bold) out = `<b>${out}</b>`;
    return out;
  };

  if (!includeBlockDivs && lines.length <= 1) {
    return lines[0] ? lines[0].runs.map(renderRun).join('') : '';
  }

  return lines
    .map((line) => {
      const inner = line.runs.map(renderRun).join('');
      return `<div>${inner || '<br>'}</div>`;
    })
    .join('');
}

/**
 * Converts plain terms text (or unbolded/legacy HTML terms) into clean HTML
 * with bold headers/clauses preserved for loading into the RichTextTermsEditor.
 */
export function termsTextToHtml(rawText: string, normalizeHtml: boolean = false): string {
  if (!rawText) return '';
  const upgraded = upgradeLegacySectionIII(rawText);
  if (isHtmlTerms(upgraded)) {
    if (!normalizeHtml) return upgraded;
    return formattedLinesToHtml(parseHtmlTermsText(upgraded));
  }

  return formattedLinesToHtml(parsePlainTermsText(upgraded));
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
 * Applies bold to the first `prefixLen` characters across runs (e.g. for "1. Clause Title:")
 */
function boldPrefixInRuns(runs: RichTextRun[], prefixLen: number): RichTextRun[] {
  const result: RichTextRun[] = [];
  let offset = 0;

  for (const run of runs) {
    const end = offset + run.text.length;
    if (offset >= prefixLen) {
      result.push(run);
    } else if (end <= prefixLen) {
      result.push({ ...run, bold: true });
    } else {
      const splitIdx = prefixLen - offset;
      const head = run.text.slice(0, splitIdx);
      const tail = run.text.slice(splitIdx);
      if (head) result.push({ ...run, text: head, bold: true });
      if (tail) result.push({ ...run, text: tail });
    }
    offset = end;
  }

  return result;
}

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
    // Apply inline bold phrases to any unbolded text runs
    let enhancedRuns: RichTextRun[] = [];
    for (const run of runs) {
      if (run.bold) {
        enhancedRuns.push(run);
      } else {
        enhancedRuns.push(
          ...applyInlineBoldPhrases(run.text, {
            italic: run.italic,
            underline: run.underline,
            fontSizePt: run.fontSizePt,
          })
        );
      }
    }

    const plainLine = enhancedRuns.map((r) => r.text).join('').trim();
    if (/^(I|II|III|IV|V|VI)\.\s+/.test(plainLine)) {
      return {
        type: 'roman-header',
        runs: enhancedRuns.map((r) => ({ ...r, bold: r.bold !== false })),
        fontSizePt: baseFontSizePt ? baseFontSizePt + 1.3 : undefined,
      };
    }
    if (/^[A-Z]\.\s+/.test(plainLine)) {
      return {
        type: 'letter-header',
        runs: enhancedRuns.map((r) => ({ ...r, bold: r.bold !== false })),
        fontSizePt: baseFontSizePt ? baseFontSizePt + 0.3 : undefined,
      };
    }

    // Apply colon-prefix bolding for numbered clauses or bullet labels (e.g. "1. Title:" or "• Delivered Orders:")
    const rawJoined = enhancedRuns.map((r) => r.text).join('');
    const colonMatch = rawJoined.match(/^(\s*(?:\d+\.|•)\s+[^:]+:)/);
    if (colonMatch) {
      enhancedRuns = boldPrefixInRuns(enhancedRuns, colonMatch[1].length);
    }

    return {
      type: 'paragraph',
      runs: enhancedRuns,
      fontSizePt: baseFontSizePt,
    };
  });
}

/**
 * Parses a multi-line or rich-text HTML terms string into structured lines for both preview and PDF export.
 */
export function parseTermsText(rawText: string, baseFontSizePt?: number): FormattedTermsLine[] {
  if (!rawText) return [];
  const upgraded = upgradeLegacySectionIII(rawText);
  if (isHtmlTerms(upgraded)) {
    return parseHtmlTermsText(upgraded, baseFontSizePt);
  }
  return parsePlainTermsText(upgraded, baseFontSizePt);
}
