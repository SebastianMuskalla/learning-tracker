import { err, ok, type Result } from '../../domain/result';
import { CURRENT_VERSION, describeVersionError, detectVersion, type VersionError } from '../version';
import { MIGRATIONS } from './index';
import type { Migration, MigrationError } from './types';

export interface MigrationStep {
  readonly from: number;
  readonly description: string;
}

export type UpgradeOutcome =
  | { readonly kind: 'current' }
  | {
      readonly kind: 'migrated';
      readonly text: string;
      readonly from: number;
      readonly steps: readonly MigrationStep[];
    };

export type UpgradeError =
  | VersionError
  | { readonly type: 'TooNew'; readonly fileVersion: number; readonly appVersion: number }
  | { readonly type: 'MigrationFailed'; readonly from: number; readonly error: MigrationError }
  | { readonly type: 'MigrationBroken'; readonly from: number; readonly reason: string };

/**
 * Brings the text of a file to `current`. The migrations and the current version are
 * parameters, so tests can pass made-up chains.
 */
export function upgrade(
  text: string,
  migrations: readonly Migration[] = MIGRATIONS,
  current: number = CURRENT_VERSION,
): Result<UpgradeOutcome, UpgradeError> {
  const detected = detectVersion(text);
  if (!detected.ok) return detected;
  const fileVersion = detected.value;
  if (fileVersion === current) return ok({ kind: 'current' });
  if (fileVersion > current) return err({ type: 'TooNew', fileVersion, appVersion: current });

  let migrated = text;
  const steps: MigrationStep[] = [];
  for (let version = fileVersion; version < current; version += 1) {
    const migration = migrations.find((candidate) => candidate.from === version);
    if (migration === undefined) {
      return err({ type: 'MigrationBroken', from: version, reason: 'No migration for this version.' });
    }
    const result = migration.migrate(migrated);
    if (!result.ok) return err({ type: 'MigrationFailed', from: version, error: result.error });
    migrated = result.value;
    const after = detectVersion(migrated);
    if (!after.ok || after.value !== version + 1) {
      return err({
        type: 'MigrationBroken',
        from: version,
        reason: `The result is not at version ${String(version + 1)}.`,
      });
    }
    steps.push({ from: version, description: migration.description });
  }
  return ok({ kind: 'migrated', text: migrated, from: fileVersion, steps });
}

/** The message for the setup banner. `line` is 0 when no line is known. */
export function describeUpgradeError(error: UpgradeError): {
  readonly line: number;
  readonly reason: string;
} {
  switch (error.type) {
    case 'NoVersionMarker':
      return { line: 0, reason: describeVersionError(error) };
    case 'InvalidVersionMarker':
      return { line: error.line, reason: describeVersionError(error) };
    case 'TooNew':
      return {
        line: 0,
        reason: `learning.md uses format version ${String(error.fileVersion)}, but this app knows only versions up to ${String(error.appVersion)}. Reload the page to get the newest version of the app.`,
      };
    case 'MigrationFailed':
      return {
        line: error.error.line ?? 0,
        reason: `Could not upgrade learning.md from format v${String(error.from)} to v${String(error.from + 1)}: ${error.error.reason}`,
      };
    case 'MigrationBroken':
      return {
        line: 0,
        reason: `Could not upgrade learning.md from format v${String(error.from)} to v${String(error.from + 1)}: ${error.reason}`,
      };
  }
}
