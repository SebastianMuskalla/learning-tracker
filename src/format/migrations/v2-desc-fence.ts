import { err, ok } from '../../domain/result';
import type { Migration } from './types';

const DESC_START = '<!-- desc -->';
const DESC_END = '<!-- /desc -->';
const META_START = '<!-- id:';

// The fence is longer than every backtick run at the start of a line (after at most 3 spaces).
function fenceFor(contentLines: readonly string[]): string {
  let longest = 0;
  for (const line of contentLines) {
    const match = /^ {0,3}(`+)/.exec(line);
    if (match?.[1] !== undefined) longest = Math.max(longest, match[1].length);
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

export const migrateV2: Migration = {
  from: 2,
  description: 'wrap each description in a markdown code fence',
  migrate: (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '<!-- version:2 -->') {
      return err({ line: 1, reason: 'Expected "<!-- version:2 -->" on line 1.' });
    }
    const output: string[] = ['<!-- version:3 -->'];
    let index = 1;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      const previous = lines[index - 1] ?? '';
      if (line === DESC_START && previous.startsWith(META_START) && previous.endsWith(' -->')) {
        const end = lines.indexOf(DESC_END, index + 1);
        if (end === -1) {
          return err({ line: index + 1, reason: `The description block has no "${DESC_END}" line.` });
        }
        const content = lines.slice(index + 1, end);
        const fence = fenceFor(content);
        output.push(`${fence}markdown`, ...content, fence);
        index = end + 1;
      } else {
        output.push(line);
        index += 1;
      }
    }
    return ok(output.join('\n'));
  },
};
