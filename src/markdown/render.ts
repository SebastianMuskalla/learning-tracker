import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import type { RendererRule as RenderRule } from 'markdown-it';

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

/** Display names for common language tags. Tags not listed here are shown as written. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  bash: 'Bash',
  c: 'C',
  'c++': 'C++',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  golang: 'Go',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  html: 'HTML',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  make: 'Makefile',
  makefile: 'Makefile',
  markdown: 'Markdown',
  md: 'Markdown',
  objc: 'Objective-C',
  objectivec: 'Objective-C',
  patch: 'Diff',
  perl: 'Perl',
  php: 'PHP',
  plaintext: 'Text',
  py: 'Python',
  python: 'Python',
  r: 'R',
  rb: 'Ruby',
  rs: 'Rust',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  sh: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  text: 'Text',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TSX',
  txt: 'Text',
  typescript: 'TypeScript',
  vb: 'VB.NET',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  zsh: 'Shell',
};

/** The label shown above a code block for a fence's language tag, e.g. `ts` → `TypeScript`. */
export function displayLanguageName(lang: string): string {
  return LANGUAGE_NAMES[lang.toLowerCase()] ?? lang;
}

/**
 * Wraps a code block's `<pre>` in `<div class="code-block">`. The language label is only a
 * `data-lang` attribute, drawn by CSS (`::before` in src/styles/base.css), so it is not part of
 * the text: search does not mark it, and it is not copied together with the code.
 */
function wrapCodeBlock(defaultRule: RenderRule): RenderRule {
  return (tokens, idx, options, env, self) => {
    const info = tokens[idx]?.info ?? '';
    // Same rule markdown-it uses for the `language-…` class: the first word of the info string.
    const lang = md.utils.unescapeAll(info).trim().split(/\s+/)[0] ?? '';
    const label = lang === '' ? '' : ` data-lang="${md.utils.escapeHtml(displayLanguageName(lang))}"`;
    return `<div class="code-block"${label}>${defaultRule(tokens, idx, options, env, self)}</div>\n`;
  };
}

const defaultFence = md.renderer.rules['fence'];
const defaultCodeBlock = md.renderer.rules['code_block'];
if (defaultFence) md.renderer.rules['fence'] = wrapCodeBlock(defaultFence);
if (defaultCodeBlock) md.renderer.rules['code_block'] = wrapCodeBlock(defaultCodeBlock);

export function renderMarkdown(text: string): string {
  const rawHtml = md.render(text);
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
}

/**
 * Lazily loads highlight.js's common-language bundle and highlights the code blocks already in the
 * DOM. Only blocks with a language that highlight.js knows are highlighted; there is no automatic
 * language detection. Blocks that were already highlighted are skipped, so calling this again on
 * the same DOM (e.g. when only the search term changed) does nothing and logs nothing.
 */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  if (container.querySelector('pre code[class*="language-"]') === null) return;
  const hljs = (await import('highlight.js/lib/common')).default;
  // Queried after the import, since the DOM may have changed while it was loading.
  const blocks = container.querySelectorAll<HTMLElement>(
    'pre code[class*="language-"]:not([data-highlighted])',
  );
  for (const block of blocks) {
    const lang = /(?:^|\s)language-(\S+)/.exec(block.className)?.[1];
    if (lang !== undefined && hljs.getLanguage(lang) !== undefined) {
      hljs.highlightElement(block);
    }
  }
}
