import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

const defaultLinkOpen =
  md.renderer.rules['link_open'] ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token?.attrSet('target', '_blank');
  token?.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(text: string): string {
  const rawHtml = md.render(text);
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
}

/** Lazily loads highlight.js's common-language bundle and highlights fenced code blocks already in the DOM. */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre code');
  if (blocks.length === 0) return;
  const hljs = (await import('highlight.js/lib/common')).default;
  for (const block of blocks) {
    hljs.highlightElement(block);
  }
}
