import { err, ok, type Result } from '../../domain/result';
import type { Migration, MigrationError } from './types';

const SECTIONS: readonly string[] = ['## New', '## WIP', '## Complete', '## Discarded'];
const OPENING_FENCE_RE = /^(`{3,})markdown$/;
const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TAG_DEF_RE = /^(<!-- tag:\S+ color:)(#[0-9A-Fa-f]{6})( -->)$/;
const META_RE = /^<!-- id:\S+ .*-->$/;

interface Block {
  readonly lines: string[];
  readonly hasDescription: boolean;
}

/** `\r\n` is already converted. Fence lines are copied exactly; a fence ends at its exact closing line. */
function readItem(
  lines: readonly string[],
  start: number,
): Result<{ block: Block; next: number }, MigrationError> {
  const output: string[] = [lines[start] ?? ''];
  let index = start + 1;

  const meta = lines[index] ?? '';
  if (META_RE.test(meta)) {
    output.push(...migrateMeta(meta));
    index += 1;
  }

  let hasDescription = false;
  const opening = OPENING_FENCE_RE.exec(lines[index] ?? '');
  if (opening?.[1] !== undefined) {
    const fence = opening[1];
    const end = lines.indexOf(fence, index + 1);
    if (end === -1) {
      return err({ line: index + 1, reason: `The description has no closing fence "${fence}".` });
    }
    const content = lines.slice(index + 1, end);
    // The same rule as the version 3 app: a fence with only blank lines is no description.
    if (content.some((line) => line.trim() !== '')) {
      output.push(...lines.slice(index, end + 1));
      hasDescription = true;
    }
    index = end + 1;
  }
  while (lines[index] === '' && index < lines.length - 1) {
    output.push('');
    index += 1;
  }
  return ok({ block: { lines: output, hasDescription }, next: index });
}

/** A tag definition line gets a lower-case color. Any other line stays as it is. */
function lowerCaseColor(line: string): string {
  const match = TAG_DEF_RE.exec(line);
  return match === null ? line : `${match[1] ?? ''}${(match[2] ?? '').toLowerCase()}${match[3] ?? ''}`;
}

function migrateMeta(meta: string): string[] {
  let tags: string[] = [];
  const parts = meta
    .slice('<!-- '.length, -' -->'.length)
    .split(' ')
    .filter((part) => {
      if (part.startsWith('tags:')) {
        tags = part.slice('tags:'.length).split(',');
        return false;
      }
      return true;
    })
    .map((part) => {
      const colon = part.indexOf(':');
      const key = part.slice(0, colon);
      const value = part.slice(colon + 1);
      const isTimestampKey = key === 'created' || key === 'completed' || key === 'discarded';
      return isTimestampKey && PLAIN_DATE_RE.test(value) ? `${key}:${value}T00:00:00Z` : part;
    });
  return [`<!-- ${parts.join(' ')} -->`, ...tags.map((tag) => `- ${tag}`)];
}

export const migrateV3: Migration = {
  from: 3,
  description:
    'move tags to a list, use full timestamps and lower-case colors, remove empty descriptions, fix New/WIP placement',
  migrate: (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '<!-- version:3 -->') {
      return err({ line: 1, reason: 'Expected "<!-- version:3 -->" on line 1.' });
    }

    const output: string[] = ['<!-- version:4 -->'];
    const sections: Block[][] = [[], [], [], []];
    // The blank lines after an item are kept in its block, so they move with it.
    let sectionIndex = -1;
    let index = 1;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      const heading = SECTIONS.indexOf(line);
      if (heading !== -1 && sectionIndex < heading) {
        sectionIndex = heading;
        const head: string[] = [line];
        index += 1;
        while (lines[index] === '' && index < lines.length - 1) {
          head.push('');
          index += 1;
        }
        sections[heading]?.push({ lines: head, hasDescription: false });
        continue;
      }
      if (sectionIndex === -1) {
        output.push(lowerCaseColor(line));
        index += 1;
        continue;
      }
      if (line.startsWith('### ')) {
        const item = readItem(lines, index);
        if (!item.ok) return item;
        sections[sectionIndex]?.push(item.value.block);
        index = item.value.next;
        continue;
      }
      sections[sectionIndex]?.push({ lines: [line], hasDescription: false });
      index += 1;
    }
    return ok(assemble(output, sections));
  },
};

/** Moves items between New and WIP in the order that the version 3 app writes. */
function assemble(prefix: string[], sections: Block[][]): string {
  const [newBlocks = [], wipBlocks = [], ...rest] = sections;
  const isItem = (block: Block): boolean => (block.lines[0] ?? '').startsWith('### ');
  const split = (blocks: Block[]): { head: Block[]; items: Block[]; other: Block[] } => ({
    head: blocks.slice(0, 1),
    items: blocks.slice(1).filter(isItem),
    other: blocks.slice(1).filter((block) => !isItem(block)),
  });
  const n = split(newBlocks);
  const w = split(wipBlocks);
  const plain = [...n.items, ...w.items].filter((block) => !block.hasDescription);
  const described = [...n.items, ...w.items].filter((block) => block.hasDescription);
  const flat = (blocks: Block[]): string[] =>
    blocks.flatMap((block) =>
      isItem(block) && block.lines.at(-1) !== '' ? [...block.lines, ''] : block.lines,
    );
  return [
    ...prefix,
    ...flat(n.head),
    ...flat(plain),
    ...flat(n.other),
    ...flat(w.head),
    ...flat(described),
    ...flat(w.other),
    ...flat(rest.flat()),
  ].join('\n');
}
