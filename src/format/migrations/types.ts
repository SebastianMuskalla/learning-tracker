import type { Result } from '../../domain/result';

export interface MigrationError {
  /** The line in the input text, if known. */
  readonly line: number | null;
  readonly reason: string;
}

/**
 * A pure text-to-text step from format version `from` to `from + 1`.
 * A released migration never changes. It must not import the parser, the serializer, or the
 * version module: those change with later versions. See "To add a format version" in README.md.
 */
export interface Migration {
  readonly from: number;
  /** One line. Used in the commit message and in the documentation. */
  readonly description: string;
  readonly migrate: (text: string) => Result<string, MigrationError>;
}
