export interface FormattedTermsLine {
  type: 'roman-header' | 'letter-header' | 'paragraph';
  runs: { text: string; bold?: boolean }[];
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

/**
 * Splits a text segment by known bold key phrases
 */
function applyInlineBoldPhrases(text: string): { text: string; bold?: boolean }[] {
  let runs: { text: string; bold?: boolean }[] = [{ text, bold: false }];

  for (const phrase of INLINE_BOLD_PHRASES) {
    const nextRuns: { text: string; bold?: boolean }[] = [];
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

/**
 * Parses a multi-line terms string into structured lines with automatic bolding
 * for section headers, numbered clauses ("1. Title:"), bullet labels ("• Label:"), and key phrases.
 */
export function parseTermsText(rawText: string): FormattedTermsLine[] {
  const lines = rawText.split(/\r?\n/);
  const result: FormattedTermsLine[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Roman numeral section header: e.g. "I. Terms and Conditions", "II. Conditions Of Proposal", "III. ...", "IV. ..."
    if (/^(I|II|III|IV|V|VI)\.\s+/.test(line)) {
      result.push({
        type: 'roman-header',
        runs: [{ text: line, bold: true }],
      });
      continue;
    }

    // 2. Lettered sub-header: e.g. "A. Standard Local Delivery...", "B. ...", "C. ...", "D. ..."
    if (/^[A-Z]\.\s+/.test(line)) {
      result.push({
        type: 'letter-header',
        runs: [{ text: line, bold: true }],
      });
      continue;
    }

    // 3. Numbered clause or bullet with a colon prefix: e.g. "1. Late Payments: ...", "• Delivered Orders: ..."
    const colonMatch = line.match(/^((?:\d+\.|•)\s+[^:]+:)(\s*.*)$/);
    if (colonMatch) {
      const prefix = colonMatch[1];
      const rest = colonMatch[2];
      const runs: { text: string; bold?: boolean }[] = [{ text: prefix, bold: true }];
      if (rest) {
        runs.push(...applyInlineBoldPhrases(rest));
      }
      result.push({
        type: 'paragraph',
        runs,
      });
      continue;
    }

    // 4. Regular paragraph or bullet (check for inline bold phrases like "• 50% Downpayment")
    result.push({
      type: 'paragraph',
      runs: applyInlineBoldPhrases(line),
    });
  }

  return result;
}
