// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../src/domain/types';
import { extractKeywords } from '../../src/links/keywords';
import { closestKeywordLink, linkKeywords } from '../../src/links/linkDom';
import type { LinkKeyword } from '../../src/links/match';
import { markHits } from '../../src/search/markDom';

function targets(...headlines: string[]): LinkKeyword[] {
  return headlines.flatMap((headline) =>
    extractKeywords(headline).map((keyword) => ({
      keyword,
      targetId: `id-${headline}` as ItemId,
      targetHeadline: headline,
    })),
  );
}

function elementWithHtml(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

function linkTexts(root: Element): string[] {
  return [...root.querySelectorAll('span.keyword-link')].map((link) => link.textContent);
}

describe('linkKeywords', () => {
  it('wraps each hit in a focusable link with the target id and headline', () => {
    const root = elementWithHtml('<p>Use OWASP and the OWASP list.</p>');
    linkKeywords(root, targets('OWASP (Open Worldwide Application Security Project)'));
    const links = root.querySelectorAll('span.keyword-link');
    expect(links).toHaveLength(2);
    const link = links[0];
    expect(link?.textContent).toBe('OWASP');
    expect(link?.getAttribute('role')).toBe('link');
    expect(link?.getAttribute('tabindex')).toBe('0');
    expect(link?.getAttribute('data-target-id')).toBe(
      'id-OWASP (Open Worldwide Application Security Project)',
    );
    expect(link?.getAttribute('aria-description')).toBe(
      'OWASP (Open Worldwide Application Security Project)',
    );
    expect(root.textContent).toBe('Use OWASP and the OWASP list.');
  });

  it('does not link in pre, code, and a', () => {
    const root = elementWithHtml(
      '<pre><code>OWASP</code></pre><p><code>OWASP</code> <a href="https://x">OWASP</a> <em>OWASP</em></p>',
    );
    linkKeywords(root, targets('OWASP'));
    expect(linkTexts(root)).toEqual(['OWASP']);
    expect(root.querySelector('em span.keyword-link')).not.toBeNull();
  });

  it('gives the same DOM when it is called again', () => {
    const root = elementWithHtml('<p>OWASP and XSS</p>');
    linkKeywords(root, targets('OWASP', 'XSS'));
    const once = root.innerHTML;
    linkKeywords(root, targets('OWASP', 'XSS'));
    expect(root.innerHTML).toBe(once);
  });

  it('removes old links when the keywords change', () => {
    const root = elementWithHtml('<p>OWASP and XSS</p>');
    linkKeywords(root, targets('OWASP', 'XSS'));
    linkKeywords(root, targets('XSS'));
    expect(linkTexts(root)).toEqual(['XSS']);
    linkKeywords(root, []);
    expect(root.innerHTML).toBe('<p>OWASP and XSS</p>');
  });

  it('works together with search marks, also a hit inside a link', () => {
    const root = elementWithHtml('<p>The OWASP list</p>');
    markHits(root, 'was');
    markHits(root, '');
    linkKeywords(root, targets('OWASP'));
    markHits(root, 'was');
    expect(root.querySelector('span.keyword-link mark.search-hit')?.textContent).toBe('WAS');
    expect(linkTexts(root)).toEqual(['OWASP']);
  });
});

describe('closestKeywordLink', () => {
  it('finds the link from a child, and nothing for other targets', () => {
    const root = elementWithHtml('<p>The OWASP list</p>');
    linkKeywords(root, targets('OWASP'));
    markHits(root, 'WAS');
    const mark = root.querySelector('mark');
    expect(closestKeywordLink(mark)?.textContent).toBe('OWASP');
    expect(closestKeywordLink(root)).toBeNull();
    expect(closestKeywordLink(null)).toBeNull();
  });
});
