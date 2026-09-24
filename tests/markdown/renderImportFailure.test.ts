// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { highlightCodeBlocks, renderMarkdown } from '../../src/markdown/render';

// Models a tab that was opened before a new deploy: the old highlight.js chunk is gone.
vi.mock('highlight.js/lib/common', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('highlightCodeBlocks when highlight.js cannot be loaded (E7)', () => {
  it('resolves without highlighting instead of rejecting', async () => {
    const root = document.createElement('div');
    root.innerHTML = renderMarkdown('```ts\nconst x = 1;\n```');

    await expect(highlightCodeBlocks(root)).resolves.toBeUndefined();
    expect(root.querySelector('code')?.hasAttribute('data-highlighted')).toBe(false);
  });
});
