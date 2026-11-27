const MONEY_TOKEN_RE = /([+-]?\$[\d,]+(?:\.\d+)?|\$-[\d,]+(?:\.\d+)?)/g;

export type MoneyTextKind = 'cash' | 'asset';

export interface MoneyTextSegment {
  text: string;
  isMoney: boolean;
  isLoss: boolean;
}

/** Splits text into plain spans and `$` cash tokens (`isLoss` when prefixed with `-` or `$-`). */
export function tokenizeMoneyText(text: string): MoneyTextSegment[] {
  if (!text) return [];
  const parts: MoneyTextSegment[] = [];
  let lastIdx = 0;
  MONEY_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONEY_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: text.slice(lastIdx, match.index), isMoney: false, isLoss: false });
    }
    const token = match[0];
    parts.push({ text: token, isMoney: true, isLoss: token.startsWith('-') || token.startsWith('$-') });
    lastIdx = match.index + token.length;
  }
  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), isMoney: false, isLoss: false });
  }
  return parts;
}

/** Builds a DOM-safe DocumentFragment wrapping `$` cash or asset tokens in `.cash-amt` spans (zero innerHTML). */
export function createMoneyFragment(text: string, kind: MoneyTextKind = 'cash'): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const part of tokenizeMoneyText(text)) {
    if (!part.isMoney) {
      frag.appendChild(document.createTextNode(part.text));
      continue;
    }
    const span = document.createElement('span');
    span.className = part.isLoss ? 'cash-amt is-loss' : kind === 'asset' ? 'cash-amt is-asset' : 'cash-amt';
    span.textContent = part.text;
    frag.appendChild(span);
  }
  return frag;
}

/** Replaces an element's text content with highlighted `$` cash or asset amounts cleanly and safely. */
export function setMoneyText(el: Element, text: string, kind: MoneyTextKind = 'cash'): void {
  el.textContent = '';
  if (!text) return;
  el.appendChild(createMoneyFragment(text, kind));
}
