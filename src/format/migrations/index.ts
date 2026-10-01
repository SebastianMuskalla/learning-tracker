import type { Migration } from './types';
import { migrateV0 } from './v0-empty-file';
import { migrateV1 } from './v1-version-line';
import { migrateV2 } from './v2-desc-fence';
import { migrateV3 } from './v3-tags-and-cleanup';

/** Ordered by `from`. The migration at index `i` goes from version `i` to version `i + 1`. */
export const MIGRATIONS: readonly Migration[] = [migrateV0, migrateV1, migrateV2, migrateV3];
