import { err, ok } from '../../domain/result';
import type { Migration } from './types';

const OPENING_FENCE_RE = /^(`{3,})markdown$/;

export const migrateV5: Migration = {
  from: 5,
  description: 'merge the WIP section into the New section',
  migrate: (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '<!-- version:5 -->') {
      return err({ line: 1, reason: 'Expected "<!-- version:5 -->" on line 1.' });
    }

    // Removing the `## WIP` line puts the WIP items at the end of the New section, after the New items.
    const output: string[] = ['<!-- version:6 -->'];
    let inSections = false;
    let foundWip = false;
    let index = 1;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      if (line.startsWith('## ')) inSections = true;

      const opening = OPENING_FENCE_RE.exec(line);
      if (inSections && opening?.[1] !== undefined) {
        // Copy the description exactly, so that a `## WIP` line inside it stays.
        const end = lines.indexOf(opening[1], index + 1);
        if (end === -1) {
          return err({ line: index + 1, reason: `The description has no closing fence "${opening[1]}".` });
        }
        output.push(...lines.slice(index, end + 1));
        index = end + 1;
        continue;
      }

      if (line === '## WIP' && !foundWip) {
        // Also skip the blank lines below the heading, so that a canonical file stays canonical.
        foundWip = true;
        index += 1;
        while (lines[index] === '' && index < lines.length - 1) index += 1;
        continue;
      }
      output.push(line);
      index += 1;
    }
    if (!foundWip) {
      return err({ line: lines.length, reason: 'Expected section heading "## WIP".' });
    }
    return ok(output.join('\n'));
  },
};
