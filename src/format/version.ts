import { err, ok, type Result } from '../domain/result';

/** The format version that this app writes. See "Format versions" in README.md. */
export const CURRENT_VERSION = 5;

export type VersionError =
  | { readonly type: 'NoVersionMarker' }
  | { readonly type: 'InvalidVersionMarker'; readonly line: number; readonly found: string };

const OLD_MARKER_PREFIX = '<!-- learning-tracker: v';
const VERSION_LINE_RE = /^<!-- version:([1-9]\d*) -->$/;

export function versionLine(version: number): string {
  return `<!-- version:${String(version)} -->`;
}

/**
 * Finds the format version of a file from its text only. It does not use the parser.
 * These rules never change in later versions: they are the fixed contract between all versions.
 *  - only whitespace: version 0;
 *  - `<!-- version:N -->` on line 1: version N (N is at least 2);
 *  - the version-1 header (title, then the old comment): version 1.
 */
export function detectVersion(text: string): Result<number, VersionError> {
  // A byte order mark is not whitespace here, so a file that starts with one has no marker.
  if (/^[^\S﻿]*$/.test(text)) return ok(0);

  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const first = lines[0] ?? '';

  if (/^<!--\s*version:/.test(first)) {
    const match = VERSION_LINE_RE.exec(first);
    const version = match === null ? NaN : Number(match[1]);
    if (!Number.isSafeInteger(version) || version < 2) {
      return err({ type: 'InvalidVersionMarker', line: 1, found: first });
    }
    return ok(version);
  }

  if (first === '# Learning') {
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (line === '') continue;
      if (!line.startsWith(OLD_MARKER_PREFIX)) break;
      if (line.startsWith(`${OLD_MARKER_PREFIX}1 `)) return ok(1);
      return err({ type: 'InvalidVersionMarker', line: index + 1, found: line });
    }
  }

  return err({ type: 'NoVersionMarker' });
}

export function describeVersionError(error: VersionError): string {
  switch (error.type) {
    case 'NoVersionMarker':
      return 'learning.md has no version line. It is not a file that this app wrote.';
    case 'InvalidVersionMarker':
      return `Line ${String(error.line)} of learning.md is not a valid version line: ${error.found}`;
  }
}
