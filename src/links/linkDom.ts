import { createKeywordMatcher, type LinkKeyword } from './match';

export const KEYWORD_LINK_CLASS = 'keyword-link';
const LINK_SELECTOR = `span.${KEYWORD_LINK_CLASS}`;
/** Text in these elements gets no keyword links. */
const SKIP_SELECTOR = `pre, code, a, ${LINK_SELECTOR}`;

/**
 * Wraps each keyword hit in `root`'s text in `<span class="keyword-link" role="link">`. Safe to call
 * again: it first removes the links of an earlier call. It only adds elements around existing
 * text, with the DOM API, so it keeps whatever sanitization produced `root`'s content.
 * Remove search marks before you call it, so that a mark does not split a keyword.
 */
export function linkKeywords(root: Element, keywords: readonly LinkKeyword[]): void {
  unlink(root);
  if (keywords.length === 0) return;
  const findHits = createKeywordMatcher(keywords);
  for (const node of collectTextNodes(root)) {
    const hits = findHits(node.data);
    // From the end to the start, so that the earlier offsets stay correct.
    for (const hit of [...hits].reverse()) {
      node.splitText(hit.end);
      const hitNode = node.splitText(hit.start);
      const link = document.createElement('span');
      link.className = KEYWORD_LINK_CLASS;
      link.setAttribute('role', 'link');
      link.setAttribute('tabindex', '0');
      link.setAttribute('aria-description', hit.target.targetHeadline);
      link.dataset['targetId'] = hit.target.targetId;
      hitNode.parentNode?.insertBefore(link, hitNode);
      link.appendChild(hitNode);
    }
  }
}

function unlink(root: Element): void {
  for (const link of root.querySelectorAll(LINK_SELECTOR)) {
    const parent = link.parentNode;
    if (parent === null) continue;
    while (link.firstChild !== null) {
      parent.insertBefore(link.firstChild, link);
    }
    parent.removeChild(link);
  }
  root.normalize();
}

function collectTextNodes(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current !== null) {
    const skip = current.parentElement?.closest(SKIP_SELECTOR);
    if (current instanceof Text && (skip === null || skip === undefined || !root.contains(skip))) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }
  return nodes;
}

/** The keyword link that contains `target`, if there is one. */
export function closestKeywordLink(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest(LINK_SELECTOR);
  return link instanceof HTMLElement ? link : null;
}
