import { err, ok } from '../../domain/result';
import type { Migration } from './types';

const OPENING_FENCE_RE = /^(`{3,})markdown$/;
const TAG_DEF_RE = /^<!-- tag:(\S+) color:\S+ -->$/;
const META_RE = /^<!-- id:\S+ .*-->$/;
const TAG_LINE_RE = /^- (\S+)$/;
const RESERVED = 'uncategorized';

const isReserved = (name: string | undefined): boolean => (name ?? '').toLowerCase() === RESERVED;

export const migrateV4: Migration = {
  from: 4,
  description: 'remove the tag "Uncategorized", which is now a reserved name',
  migrate: (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '<!-- version:4 -->') {
      return err({ line: 1, reason: 'Expected "<!-- version:4 -->" on line 1.' });
    }

    const output: string[] = ['<!-- version:5 -->'];
    let inSections = false;
    // True directly after an item's metadata line and its tag lines: only there a `- NAME` line is a tag.
    let inTagLines = false;
    let index = 1;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      if (line.startsWith('## ')) inSections = true;

      const opening = OPENING_FENCE_RE.exec(line);
      if (inSections && opening?.[1] !== undefined) {
        // Copy the description exactly. A fence ends at its exact closing line.
        const end = lines.indexOf(opening[1], index + 1);
        if (end === -1) {
          return err({ line: index + 1, reason: `The description has no closing fence "${opening[1]}".` });
        }
        output.push(...lines.slice(index, end + 1));
        index = end + 1;
        inTagLines = false;
        continue;
      }

      if (!inSections) {
        const definition = TAG_DEF_RE.exec(line);
        if (!isReserved(definition?.[1])) output.push(line);
      } else if (META_RE.test(line)) {
        inTagLines = true;
        output.push(line);
      } else if (inTagLines && TAG_LINE_RE.test(line)) {
        if (!isReserved(TAG_LINE_RE.exec(line)?.[1])) output.push(line);
      } else {
        inTagLines = false;
        output.push(line);
      }
      index += 1;
    }
    return ok(output.join('\n'));
  },
};
