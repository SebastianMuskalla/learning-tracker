import { err, ok } from '../../domain/result';
import type { Migration } from './types';

const EMPTY_V1_FILE = [
  '# Learning',
  '',
  '<!-- learning-tracker: v1 — edit by hand at your own risk; the app validates strictly -->',
  '',
  '## New',
  '',
  '## WIP',
  '',
  '## Complete',
  '',
  '## Discarded',
  '',
].join('\n');

export const migrateV0: Migration = {
  from: 0,
  description: 'create the empty board in an empty file',
  migrate: (text) =>
    /^[^\S﻿]*$/.test(text) ? ok(EMPTY_V1_FILE) : err({ line: null, reason: 'The file is not empty.' }),
};
