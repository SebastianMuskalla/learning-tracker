// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { markHits } from '../../src/search/markDom';

function elementWithHtml(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('markHits', () => {
  it('wraps a hit inside a single text node in one <mark>', () => {
    const root = elementWithHtml('<p>hello world</p>');
    const result = markHits(root, 'world');
    expect(result.markCount).toBe(1);
    expect(root.querySelectorAll('mark.search-hit')).toHaveLength(1);
    expect(root.querySelector('mark.search-hit')?.textContent).toBe('world');
    expect(root.textContent).toBe('hello world');
  });

  it('wraps a hit that spans an element boundary in two marks and keeps textContent unchanged', () => {
    const root = elementWithHtml('<p>some <strong>text</strong> here</p>');
    const textContent = root.textContent;
    const result = markHits(root, 'some text');
    expect(result.markCount).toBe(2);
    expect(root.querySelectorAll('mark.search-hit')).toHaveLength(2);
    expect(root.textContent).toBe(textContent);
  });

  it('marks a hit inside <pre><code>', () => {
    const root = elementWithHtml('<pre><code>const x = 1;</code></pre>');
    const result = markHits(root, 'const');
    expect(result.markCount).toBe(1);
    expect(root.querySelector('pre code mark.search-hit')?.textContent).toBe('const');
  });

  it('replaces marks from an earlier call when called again with a different term', () => {
    const root = elementWithHtml('<p>hello world</p>');
    markHits(root, 'hello');
    expect(root.querySelector('mark.search-hit')?.textContent).toBe('hello');

    const result = markHits(root, 'world');
    const marks = root.querySelectorAll('mark.search-hit');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('world');
    expect(result.markCount).toBe(1);
    expect(root.textContent).toBe('hello world');
  });

  it('leaves no marks when called with an empty term, and keeps textContent unchanged', () => {
    const root = elementWithHtml('<p>hello world</p>');
    markHits(root, 'hello');
    const result = markHits(root, '');
    expect(result.markCount).toBe(0);
    expect(root.querySelectorAll('mark.search-hit')).toHaveLength(0);
    expect(root.textContent).toBe('hello world');
  });

  it('reports the correct markCount for several hits', () => {
    const root = elementWithHtml('<p>cat and cat and cat</p>');
    const result = markHits(root, 'cat');
    expect(result.markCount).toBe(3);
    expect(root.querySelectorAll('mark.search-hit')).toHaveLength(3);
  });
});
