import {
  describeValidationError,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeItemId,
  makeOptionalDescription,
  makeTagName,
} from '../domain/factories';
import { err, ok, type Result } from '../domain/result';
import { describeBoardValidationError, validateBoard } from '../domain/board';
import type {
  ActiveItem,
  Board,
  CompleteItem,
  Description,
  DiscardedItem,
  IsoTimestamp,
  Item,
  ItemId,
  Section,
  Tag,
  TagName,
} from '../domain/types';
import { FENCE_LANGUAGE, HEADER_TITLE } from './serialize';
import { CURRENT_VERSION, versionLine } from './version';

export interface ParseError {
  readonly line: number;
  readonly reason: string;
}

const SECTION_SEQUENCE: readonly { readonly section: Section; readonly heading: string }[] = [
  { section: 'new', heading: '## New' },
  { section: 'wip', heading: '## WIP' },
  { section: 'complete', heading: '## Complete' },
  { section: 'discarded', heading: '## Discarded' },
];

const TS = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`;
const ID = '([0-9A-Za-z]{26})';
// Each section has exactly one valid metadata form.
const META_RE: Record<Section, RegExp> = {
  new: new RegExp(`^<!-- id:${ID} created:(${TS}) -->$`),
  wip: new RegExp(`^<!-- id:${ID} created:(${TS}) -->$`),
  complete: new RegExp(`^<!-- id:${ID} created:(${TS}) completed:(${TS}) -->$`),
  discarded: new RegExp(`^<!-- id:${ID} created:(${TS}) discarded:(${TS}) -->$`),
};
const SECTION_TITLE: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};
const TAG_DEF_RE = /^<!-- tag:(\S+) color:(\S+) -->$/;
const TAG_LINE_RE = /^- (\S+)$/;

class Cursor {
  private index = 0;
  private readonly lines: readonly string[];

  constructor(lines: readonly string[]) {
    this.lines = lines;
  }

  get lineNumber(): number {
    return this.index + 1;
  }

  atEnd(): boolean {
    return this.index >= this.lines.length;
  }

  peek(): string | undefined {
    return this.lines[this.index];
  }

  advance(): string | undefined {
    const value = this.lines[this.index];
    this.index += 1;
    return value;
  }

  skipBlankLines(): void {
    while (!this.atEnd() && this.peek() === '') {
      this.advance();
    }
  }
}

interface Accumulator {
  readonly new: ActiveItem[];
  readonly wip: ActiveItem[];
  readonly complete: CompleteItem[];
  readonly discarded: DiscardedItem[];
}

export function parse(text: string): Result<Board, ParseError> {
  const normalised = text.replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');
  const cursor = new Cursor(lines);

  const headerResult = parseHeader(cursor);
  if (!headerResult.ok) return headerResult;

  const tagsResult = parseTagDefinitions(cursor);
  if (!tagsResult.ok) return tagsResult;
  const tags = tagsResult.value;

  const seenIds = new Set<string>();
  const acc: Accumulator = { new: [], wip: [], complete: [], discarded: [] };

  for (const { section, heading } of SECTION_SEQUENCE) {
    const headingLine = cursor.peek();
    if (headingLine !== heading) {
      return err({
        line: cursor.lineNumber,
        reason: `Expected section heading "${heading}", found ${describeLine(headingLine)}`,
      });
    }
    cursor.advance();
    cursor.skipBlankLines();

    while (cursor.peek()?.startsWith('### ') === true) {
      const itemResult = parseItem(cursor, section, tags);
      if (!itemResult.ok) return itemResult;
      const item = itemResult.value;

      if (seenIds.has(item.id)) {
        return err({ line: cursor.lineNumber, reason: `Duplicate id "${item.id}"` });
      }
      seenIds.add(item.id);

      placeItem(acc, item);
      cursor.skipBlankLines();
    }
  }

  cursor.skipBlankLines();
  if (!cursor.atEnd()) {
    return err({
      line: cursor.lineNumber,
      reason: `Unexpected content after Discarded section: ${describeLine(cursor.peek())}`,
    });
  }

  const board: Board = { tags, new: acc.new, wip: acc.wip, complete: acc.complete, discarded: acc.discarded };
  const validated = validateBoard(board);
  if (!validated.ok) {
    return err({
      line: 0,
      reason: `Internal consistency check failed: ${describeBoardValidationError(validated.error)}`,
    });
  }

  return ok(board);
}

function parseTagDefinitions(cursor: Cursor): Result<readonly Tag[], ParseError> {
  const tags: Tag[] = [];
  const seenLower = new Set<string>();
  for (;;) {
    cursor.skipBlankLines();
    const line = cursor.peek();
    if (line === undefined) break;
    const match = TAG_DEF_RE.exec(line);
    if (!match) break;
    const lineNumber = cursor.lineNumber;
    cursor.advance();

    const rawName = match[1] ?? '';
    const rawColor = match[2] ?? '';
    const nameResult = makeTagName(rawName);
    if (!nameResult.ok) {
      return err({
        line: lineNumber,
        reason: `Invalid tag name: ${describeValidationError(nameResult.error)}`,
      });
    }
    const colorResult = makeHexColor(rawColor);
    if (!colorResult.ok) {
      return err({
        line: lineNumber,
        reason: `Invalid tag color: ${describeValidationError(colorResult.error)}`,
      });
    }

    const name = nameResult.value;
    const lower = name.toLowerCase();
    if (seenLower.has(lower)) {
      return err({ line: lineNumber, reason: `Duplicate tag "${name}"` });
    }
    seenLower.add(lower);
    tags.push({ name, color: colorResult.value });
  }
  return ok(tags);
}

function parseHeader(cursor: Cursor): Result<void, ParseError> {
  const expectedVersionLine = versionLine(CURRENT_VERSION);
  if (cursor.peek() !== expectedVersionLine) {
    return err({
      line: cursor.lineNumber,
      reason: `Expected "${expectedVersionLine}", found ${describeLine(cursor.peek())}`,
    });
  }
  cursor.advance();
  cursor.skipBlankLines();

  if (cursor.peek() !== HEADER_TITLE) {
    return err({
      line: cursor.lineNumber,
      reason: `Expected "${HEADER_TITLE}", found ${describeLine(cursor.peek())}`,
    });
  }
  cursor.advance();
  cursor.skipBlankLines();
  return ok(undefined);
}

/** Reads the `- NAME` lines below the metadata line. A name must be defined, exactly as written. */
function parseTagLines(cursor: Cursor, definedTags: readonly Tag[]): Result<readonly TagName[], ParseError> {
  const defined = new Set<string>(definedTags.map((tag) => tag.name));
  const seen = new Set<string>();
  const tags: TagName[] = [];
  for (;;) {
    const match = TAG_LINE_RE.exec(cursor.peek() ?? '');
    if (!match) break;
    const line = cursor.lineNumber;
    cursor.advance();

    const nameResult = makeTagName(match[1] ?? '');
    if (!nameResult.ok) {
      return err({ line, reason: `Invalid tag: ${describeValidationError(nameResult.error)}` });
    }
    const name = nameResult.value;
    if (seen.has(name)) {
      return err({ line, reason: `Duplicate tag "${name}" on this item` });
    }
    seen.add(name);
    if (!defined.has(name)) {
      return err({ line, reason: `Unknown tag "${name}" on this item` });
    }
    tags.push(name);
  }
  return ok(tags);
}

function parseItem(
  cursor: Cursor,
  fileSection: Section,
  definedTags: readonly Tag[],
): Result<Item, ParseError> {
  const headlineLine = cursor.advance();
  if (headlineLine === undefined) {
    return err({ line: cursor.lineNumber, reason: 'Unexpected end of file while reading an item headline' });
  }
  const headlineText = headlineLine.slice('### '.length);
  const headlineResult = makeHeadline(headlineText);
  if (!headlineResult.ok) {
    return err({
      line: cursor.lineNumber - 1,
      reason: `Invalid headline: ${describeValidationError(headlineResult.error)}`,
    });
  }

  const metaLine = cursor.advance();
  if (metaLine === undefined) {
    return err({ line: cursor.lineNumber, reason: 'Unexpected end of file while reading item metadata' });
  }
  const metaLineNumber = cursor.lineNumber - 1;
  const match = META_RE[fileSection].exec(metaLine);
  if (!match) {
    return err({
      line: metaLineNumber,
      reason: `Malformed metadata for an item under ${SECTION_TITLE[fileSection]}: ${describeLine(metaLine)}`,
    });
  }

  const idResult = makeItemId(match[1] ?? '');
  if (!idResult.ok) {
    return err({ line: metaLineNumber, reason: `Invalid id: ${describeValidationError(idResult.error)}` });
  }
  const createdResult = makeIsoTimestamp(match[2] ?? '');
  if (!createdResult.ok) {
    return err({
      line: metaLineNumber,
      reason: `Invalid created timestamp: ${describeValidationError(createdResult.error)}`,
    });
  }
  // Only the Complete and Discarded forms have a third timestamp.
  let endedAt: IsoTimestamp | undefined;
  if (match[3] !== undefined) {
    const endedResult = makeIsoTimestamp(match[3]);
    if (!endedResult.ok) {
      const key = fileSection === 'complete' ? 'completed' : 'discarded';
      return err({
        line: metaLineNumber,
        reason: `Invalid ${key} timestamp: ${describeValidationError(endedResult.error)}`,
      });
    }
    endedAt = endedResult.value;
  }

  const tagsResult = parseTagLines(cursor, definedTags);
  if (!tagsResult.ok) return tagsResult;
  const tags = tagsResult.value;

  const descResult = parseOptionalDescription(cursor);
  if (!descResult.ok) return descResult;
  const description = descResult.value;

  const id: ItemId = idResult.value;
  const createdAt: IsoTimestamp = createdResult.value;
  const headline = headlineResult.value;

  // The metadata form of Complete and Discarded always has the third timestamp.
  const missingEnd = err({
    line: metaLineNumber,
    reason: `Malformed metadata for an item under ${SECTION_TITLE[fileSection]}: ${describeLine(metaLine)}`,
  });

  switch (fileSection) {
    case 'discarded': {
      if (endedAt === undefined) return missingEnd;
      const item: DiscardedItem = {
        id,
        headline,
        createdAt,
        status: 'discarded',
        description,
        discardedAt: endedAt,
        tags,
      };
      return ok(item);
    }
    case 'complete': {
      if (endedAt === undefined) return missingEnd;
      if (description === null) {
        return err({ line: metaLineNumber, reason: 'A Complete item must have a description' });
      }
      const item: CompleteItem = {
        id,
        headline,
        createdAt,
        status: 'complete',
        description,
        completedAt: endedAt,
        tags,
      };
      return ok(item);
    }
    case 'new':
    case 'wip': {
      if (fileSection === 'new' && description !== null) {
        return err({ line: metaLineNumber, reason: 'An item with a description must be under WIP, not New' });
      }
      if (fileSection === 'wip' && description === null) {
        return err({
          line: metaLineNumber,
          reason: 'An item without a description must be under New, not WIP',
        });
      }
      const item: ActiveItem = { id, headline, createdAt, status: 'active', description, tags };
      return ok(item);
    }
  }
}

const OPENING_FENCE_RE = new RegExp(`^(\`{3,})${FENCE_LANGUAGE}$`);

function parseOptionalDescription(cursor: Cursor): Result<Description | null, ParseError> {
  const opening = cursor.peek();
  if (!opening?.startsWith('`')) {
    return ok(null);
  }
  const openingLine = cursor.lineNumber;
  const openingMatch = OPENING_FENCE_RE.exec(opening);
  if (!openingMatch) {
    return err({
      line: openingLine,
      reason: `Expected a description fence "\`\`\`${FENCE_LANGUAGE}", found ${describeLine(opening)}`,
    });
  }
  const fence = openingMatch[1] ?? '```';
  cursor.advance();

  // Any line that GitHub reads as a closing fence must be exactly the fence, so that the app
  // and github.com agree where the description ends.
  const closingRe = new RegExp(`^ {0,3}\`{${String(fence.length)},}[ \\t]*$`);
  const rawLines: string[] = [];
  for (;;) {
    const line = cursor.peek();
    if (line === undefined) {
      return err({
        line: openingLine,
        reason: `Unterminated description (missing the closing fence "${fence}")`,
      });
    }
    if (line === fence) {
      cursor.advance();
      break;
    }
    if (closingRe.test(line)) {
      return err({
        line: cursor.lineNumber,
        reason: `The closing fence must be exactly ${String(fence.length)} backticks, found ${describeLine(line)}`,
      });
    }
    rawLines.push(line);
    cursor.advance();
  }
  const descResult = makeOptionalDescription(rawLines.join('\n'));
  if (!descResult.ok) {
    return err({
      line: openingLine,
      reason: `Invalid description: ${describeValidationError(descResult.error)}`,
    });
  }
  if (descResult.value === null) {
    return err({ line: openingLine, reason: 'Empty description: remove the fence or write text in it' });
  }
  return ok(descResult.value);
}

function placeItem(acc: Accumulator, item: Item): void {
  switch (item.status) {
    case 'active':
      if (item.description === null) {
        acc.new.push(item);
      } else {
        acc.wip.push(item);
      }
      return;
    case 'complete':
      acc.complete.push(item);
      return;
    case 'discarded':
      acc.discarded.push(item);
      return;
  }
}

function describeLine(line: string | undefined): string {
  if (line === undefined) return 'end of file';
  return line === '' ? 'a blank line' : JSON.stringify(line);
}
