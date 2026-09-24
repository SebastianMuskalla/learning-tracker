// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { displayLanguageName, highlightCodeBlocks, renderMarkdown } from '../../src/markdown/render';
import { markHits } from '../../src/search/markDom';

function rendered(markdown: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = renderMarkdown(markdown);
  return el;
}

describe('renderMarkdown code blocks', () => {
  it('wraps a fenced block with a language in a labeled code-block', () => {
    const root = rendered('```ts\nconst x = 1;\n```');
    const wrapper = root.querySelector('div.code-block');
    expect(wrapper?.getAttribute('data-lang')).toBe('TypeScript');
    expect(wrapper?.querySelector('pre > code.language-ts')?.textContent).toBe('const x = 1;\n');
  });

  it('uses only the first word of the info string', () => {
    const root = rendered('```python title="x.py"\npass\n```');
    expect(root.querySelector('div.code-block')?.getAttribute('data-lang')).toBe('Python');
  });

  it('shows unknown language tags as written', () => {
    const root = rendered('```haskell\nmain = pure ()\n```');
    expect(root.querySelector('div.code-block')?.getAttribute('data-lang')).toBe('haskell');
  });

  it('wraps a fenced block without a language in an unlabeled code-block', () => {
    const root = rendered('```\nplain\n```');
    const wrapper = root.querySelector('div.code-block');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.hasAttribute('data-lang')).toBe(false);
  });

  it('wraps an indented code block in an unlabeled code-block', () => {
    const root = rendered('text\n\n    indented code\n');
    const wrapper = root.querySelector('div.code-block');
    expect(wrapper?.hasAttribute('data-lang')).toBe(false);
    expect(wrapper?.querySelector('pre > code')?.textContent).toBe('indented code\n');
  });

  it('keeps a malicious language tag as inert attribute text', () => {
    const root = rendered('```"><img/src=x/onerror=alert(1)>\ncode\n```');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[onerror]')).toBeNull();
    expect(root.querySelector('div.code-block')?.getAttribute('data-lang')).toBe(
      '"><img/src=x/onerror=alert(1)>',
    );
  });
});

describe('displayLanguageName', () => {
  it('maps common tags and aliases, ignoring case', () => {
    expect(displayLanguageName('js')).toBe('JavaScript');
    expect(displayLanguageName('CPP')).toBe('C++');
    expect(displayLanguageName('yml')).toBe('YAML');
  });

  it('returns unknown tags unchanged', () => {
    expect(displayLanguageName('Elixir')).toBe('Elixir');
  });
});

describe('highlightCodeBlocks', () => {
  let consoleSpies: MockInstance[] = [];

  beforeEach(() => {
    consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('highlights a block with a known language', async () => {
    const root = rendered('```ts\nconst x = "a";\n```');
    await highlightCodeBlocks(root);
    const code = root.querySelector('code');
    expect(code?.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(code?.querySelector('.hljs-string')?.textContent).toBe('"a"');
    expect(code?.textContent).toBe('const x = "a";\n');
  });

  it('does not auto-detect a language for a block without one', async () => {
    const root = rendered('```\nconst x = "a";\n```');
    await highlightCodeBlocks(root);
    expect(root.querySelector('code')?.innerHTML).toBe('const x = "a";\n');
  });

  it('leaves a block with an unknown language unhighlighted, without a warning', async () => {
    const root = rendered('```haskell\nmain = pure ()\n```');
    await highlightCodeBlocks(root);
    const code = root.querySelector('code');
    expect(code?.children).toHaveLength(0);
    expect(code?.hasAttribute('data-highlighted')).toBe(false);
  });

  it('does nothing when called again on the same DOM', async () => {
    const root = rendered('```js\nlet a = 1;\n```');
    await highlightCodeBlocks(root);
    const html = root.innerHTML;
    await highlightCodeBlocks(root);
    expect(root.innerHTML).toBe(html);
  });

  it('keeps search marks when called again after markHits', async () => {
    const root = rendered('```js\nlet total = 1;\n```');
    await highlightCodeBlocks(root);
    markHits(root, 'total');
    await highlightCodeBlocks(root);
    expect(root.querySelector('mark.search-hit')?.textContent).toBe('total');
  });

  it('lets markHits mark text across highlighted spans', async () => {
    const root = rendered('```js\nconst x = 1;\n```');
    await highlightCodeBlocks(root);
    const { markCount } = markHits(root, 'const x');
    expect(markCount).toBeGreaterThan(0);
    expect(root.querySelector('code')?.textContent).toBe('const x = 1;\n');
  });
});
