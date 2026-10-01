import type { Migration } from './types';
import { migrateV0 } from './v0-empty-file';
import { migrateV1 } from './v1-version-line';

/** Ordered by `from`. The migration at index `i` goes from version `i` to version `i + 1`. */
export const MIGRATIONS: readonly Migration[] = [migrateV0, migrateV1];
