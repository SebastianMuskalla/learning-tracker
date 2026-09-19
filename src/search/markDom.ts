import { findHits } from './match';

const HIT_CLASS = 'search-hit';
const HIT_SELECTOR = `mark.${HIT_CLASS}`;

export interface MarkResult {
  readonly markCount: number;
}

/**
 * Highlights every hit of `term` inside `root`'s text, wrapping it in `<mark class="search-hit">`.
 * Safe to call again on every keystroke: it first removes marks left by an earlier call. Only ever
 * adds elements around existing text, so it keeps whatever sanitization produced `root`'s content.
 */
export function markHits(root: Element, term: string): MarkResult {
  unmark(root);

  const entries = collectTextNodes(root);
  const combinedText = entries.map((entry) => entry.node.data).join('');
  const hits = findHits(combinedText, term);
  if (hits.length === 0) return { markCount: 0 };

  let markCount = 0;
  for (const entry of entries) {
    markCount += markNode(entry, hits);
  }
  return { markCount };
}

function unmark(root: Element): void {
  for (const mark of root.querySelectorAll(HIT_SELECTOR)) {
    const parent = mark.parentNode;
    if (parent === null) continue;
    while (mark.firstChild !== null) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
  root.normalize();
}

interface TextNodeEntry {
  readonly node: Text;
  /** Index in the combined text where this (pre-split) node's text starts. */
  readonly start: number;
}

function collectTextNodes(root: Element): TextNodeEntry[] {
  const entries: TextNodeEntry[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current !== null) {
    if (current instanceof Text) {
      entries.push({ node: current, start: offset });
      offset += current.data.length;
    }
    current = walker.nextNode();
  }
  return entries;
}

/**
 * Wraps the parts of `hits` that fall inside `entry`'s original range. A hit can touch several
 * text nodes (e.g. `some **text**`), and a node can contain several hits; both are handled by
 * splitting the node's remaining, not-yet-wrapped tail as we walk hits left to right.
 */
function markNode(entry: TextNodeEntry, hits: (readonly [number, number])[]): number {
  const nodeEnd = entry.start + entry.node.data.length;
  let markCount = 0;
  let cursorNode = entry.node;
  let cursorOffset = entry.start;

  for (const [hitStart, hitEnd] of hits) {
    const overlapStart = Math.max(hitStart, entry.start);
    const overlapEnd = Math.min(hitEnd, nodeEnd);
    if (overlapStart >= overlapEnd) continue;

    const localStart = overlapStart - cursorOffset;
    if (localStart > 0) {
      cursorNode = cursorNode.splitText(localStart);
      cursorOffset += localStart;
    }

    const parent = cursorNode.parentNode;
    if (parent === null) continue;

    const localEnd = overlapEnd - cursorOffset;
    // `hitNode` captures the node before splitting off its tail: `splitText` mutates the node it is
    // called on in place to hold only the part before the split point, and returns a new node for
    // the rest — so `hitNode` still refers to exactly the hit text after this call.
    const hitNode = cursorNode;
    if (localEnd < cursorNode.data.length) {
      cursorNode = cursorNode.splitText(localEnd);
    }
    cursorOffset += localEnd;

    const mark = document.createElement('mark');
    mark.className = HIT_CLASS;
    parent.insertBefore(mark, hitNode);
    mark.appendChild(hitNode);
    markCount += 1;
  }
  return markCount;
}
