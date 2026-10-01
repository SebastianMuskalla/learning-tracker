import { err, ok } from '../../domain/result';
import type { Migration } from './types';

const TITLE = '# Learning';
const OLD_COMMENT =
  '<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->';

export const migrateV1: Migration = {
  from: 1,
  description: 'replace the learning-tracker comment with a version line',
  migrate: (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== TITLE) {
      return err({ line: 1, reason: `Expected "${TITLE}" on line 1.` });
    }
    let index = 1;
    while (lines[index] === '') index += 1;
    if (lines[index] !== OLD_COMMENT) {
      return err({ line: index + 1, reason: 'Expected the learning-tracker version 1 comment.' });
    }
    index += 1;
    while (lines[index] === '') index += 1;
    return ok(['<!-- version:2 -->', '', TITLE, '', ...lines.slice(index)].join('\n'));
  },
};
