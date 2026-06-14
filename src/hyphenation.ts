import { fitText } from "./fitText";
import type {
  FitHyphenatedTextOptions,
  HyphenateTextOptions,
  PrepareHyphenationOptions
} from "./types";

export const SOFT_HYPHEN = "\u00AD";

const defaultWordPattern = /[A-Za-zÀ-ÿĀ-žА-я]{8,}/g;
const vowels = "aeiouyäöüAEIOUYÄÖÜáàâãåāăąÁÀÂÃÅĀĂĄéèêëēĕėęěÉÈÊËĒĔĖĘĚíìîïīĭÍÌÎÏĪĬóòôõøōŏőÓÒÔÕØŌŎŐúùûūŭůűÚÙÛŪŬŮŰ";

export function stripSoftHyphens(value: string): string {
  return value.replaceAll(SOFT_HYPHEN, "");
}

function isLetter(value: string): boolean {
  return /\p{L}/u.test(value);
}

function isVowel(value: string): boolean {
  return vowels.includes(value);
}

function findBreakPosition(word: string, from: number, target: number, minSegmentLength: number): number {
  const min = from + minSegmentLength;
  const max = word.length - minSegmentLength;
  const preferred = Math.min(max, Math.max(min, target));

  for (let distance = 0; distance <= Math.max(preferred - min, max - preferred); distance += 1) {
    for (const candidate of [preferred + distance, preferred - distance]) {
      if (candidate <= min || candidate >= max) {
        continue;
      }

      const before = word[candidate - 1] ?? "";
      const after = word[candidate] ?? "";
      if (isLetter(before) && isLetter(after) && isVowel(before) !== isVowel(after)) {
        return candidate;
      }
    }
  }

  return preferred;
}

export function hyphenateWord(word: string, options: HyphenateTextOptions = {}): string {
  const {
    minWordLength = 8,
    minSegmentLength = 3,
    segmentLength = 6
  } = options;
  const clean = stripSoftHyphens(word);

  if (clean.length < minWordLength || clean.length <= minSegmentLength * 2) {
    return clean;
  }

  const parts: string[] = [];
  let from = 0;

  while (clean.length - from > segmentLength + minSegmentLength) {
    const target = from + segmentLength;
    const next = findBreakPosition(clean, from, target, minSegmentLength);
    parts.push(clean.slice(from, next));
    from = next;
  }

  parts.push(clean.slice(from));
  return parts.join(SOFT_HYPHEN);
}

export function hyphenateText(value: string, options: HyphenateTextOptions = {}): string {
  const wordPattern = options.wordPattern ?? defaultWordPattern;
  return stripSoftHyphens(value).replace(wordPattern, (word) => hyphenateWord(word, options));
}

export function addSoftHyphensToTextNodes(root: HTMLElement, options: HyphenateTextOptions = {}): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    if (value.trim()) {
      node.nodeValue = hyphenateText(value, options);
    }
  }
}

export function prepareHyphenation(
  element: HTMLElement,
  options: PrepareHyphenationOptions = {}
): void {
  const { lang, lineBreak = "balance", ...hyphenationOptions } = options;

  if (lang) {
    element.lang = lang;
  }

  element.style.whiteSpace = "normal";
  element.style.overflowWrap = "break-word";
  element.style.hyphens = "manual";

  if (lineBreak === "balance") {
    element.style.textWrap = "balance";
  }

  addSoftHyphensToTextNodes(element, hyphenationOptions);
}

export function fitHyphenatedText(
  element: HTMLElement,
  options: FitHyphenatedTextOptions = {}
): void {
  const {
    lang,
    minWordLength,
    minSegmentLength,
    segmentLength,
    wordPattern,
    lineBreak = "balance",
    ...fitOptions
  } = options;

  prepareHyphenation(element, {
    lang,
    lineBreak,
    minWordLength,
    minSegmentLength,
    segmentLength,
    wordPattern
  });

  fitText(element, {
    ...fitOptions,
    lineBreak: false
  });
}
