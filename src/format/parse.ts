import {
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeItemId,
  makeOptionalDescription,
  makeTagName,
} from '../domain/factories';
import { err, ok, type Result } from '../domain/result';
import { validateBoard } from '../domain/board';
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
import { DESC_END, DESC_START, HEADER_COMMENT, HEADER_TITLE } from './serialize';

export interface ParseError {
  readonly line: number;
  readonly reason: string;
}

export interface ParseWarning {
  readonly line: number;
  readonly reason: string;
}

export interface ParseSuccess {
  readonly board: Board;
  readonly warnings: readonly ParseWarning[];
}

const SECTION_SEQUENCE: readonly { readonly section: Section; readonly heading: string }[] = [
  { section: 'new', heading: '## New' },
  { section: 'wip', heading: '## WIP' },
  { section: 'complete', heading: '## Complete' },
  { section: 'discarded', heading: '## Discarded' },
];

// A timestamp value is either the current full format (`2026-09-16T14:32:07Z`) or the legacy
// date-only format (`2026-09-16`) written before this app tracked time; see makeIsoTimestamp.
const TS = String.raw`\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?`;
const META_RE = new RegExp(
  `^<!-- id:([0-9A-Za-z]{26}) created:(${TS})(?: completed:(${TS}))?(?: discarded:(${TS}))?(?: tags:(\\S+))? -->$`,
);
const TAG_DEF_RE = /^<!-- tag:(\S+) color:(\S+) -->$/;

class Cursor {
  private index = 0;
  constructor(private readonly lines: readonly string[]) {}

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

export function parse(text: string): Result<ParseSuccess, ParseError> {
  const normalised = text.replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');
  const cursor = new Cursor(lines);

  const headerResult = parseHeader(cursor);
  if (!headerResult.ok) return headerResult;

  const tagsResult = parseTagDefinitions(cursor);
  if (!tagsResult.ok) return tagsResult;
  const tags = tagsResult.value;

  const warnings: ParseWarning[] = [];
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
      const { item, warning } = itemResult.value;

      if (seenIds.has(item.id)) {
        return err({ line: cursor.lineNumber, reason: `Duplicate id "${item.id}"` });
      }
      seenIds.add(item.id);

      if (warning) warnings.push(warning);
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
    return err({ line: 0, reason: `Internal consistency check failed: ${JSON.stringify(validated.error)}` });
  }

  return ok({ board, warnings });
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
      return err({ line: lineNumber, reason: `Invalid tag name: ${JSON.stringify(nameResult.error)}` });
    }
    const colorResult = makeHexColor(rawColor);
    if (!colorResult.ok) {
      return err({ line: lineNumber, reason: `Invalid tag color: ${JSON.stringify(colorResult.error)}` });
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
  if (cursor.peek() !== HEADER_TITLE) {
    return err({
      line: cursor.lineNumber,
      reason: `Expected "${HEADER_TITLE}", found ${describeLine(cursor.peek())}`,
    });
  }
  cursor.advance();
  cursor.skipBlankLines();

  if (cursor.peek() !== HEADER_COMMENT) {
    return err({
      line: cursor.lineNumber,
      reason: `Expected the learning-tracker version comment, found ${describeLine(cursor.peek())}`,
    });
  }
  cursor.advance();
  cursor.skipBlankLines();
  return ok(undefined);
}

interface ParsedItem {
  readonly item: Item;
  readonly warning: ParseWarning | undefined;
}

function parseItemTags(
  rawTags: string | undefined,
  definedTags: readonly Tag[],
  headline: string,
  line: number,
): Result<readonly TagName[], ParseError> {
  if (rawTags === undefined) return ok([]);

  const definedLower = new Set(definedTags.map((tag) => tag.name.toLowerCase()));
  const seenLower = new Set<string>();
  const tags: TagName[] = [];
  for (const raw of rawTags.split(',')) {
    const nameResult = makeTagName(raw);
    if (!nameResult.ok) {
      return err({ line, reason: `Invalid tag on item "${headline}": ${JSON.stringify(nameResult.error)}` });
    }
    const name = nameResult.value;
    const lower = name.toLowerCase();
    if (seenLower.has(lower)) {
      return err({ line, reason: `Duplicate tag "${name}" on item "${headline}"` });
    }
    seenLower.add(lower);
    if (!definedLower.has(lower)) {
      return err({ line, reason: `Unknown tag "${name}" on item "${headline}"` });
    }
    tags.push(name);
  }
  return ok(tags);
}

function parseItem(
  cursor: Cursor,
  fileSection: Section,
  definedTags: readonly Tag[],
): Result<ParsedItem, ParseError> {
  const headlineLine = cursor.advance();
  if (headlineLine === undefined) {
    return err({ line: cursor.lineNumber, reason: 'Unexpected end of file while reading an item headline' });
  }
  const headlineText = headlineLine.slice('### '.length);
  const headlineResult = makeHeadline(headlineText);
  if (!headlineResult.ok) {
    return err({
      line: cursor.lineNumber - 1,
      reason: `Invalid headline: ${JSON.stringify(headlineResult.error)}`,
    });
  }

  const metaLine = cursor.advance();
  if (metaLine === undefined) {
    return err({ line: cursor.lineNumber, reason: 'Unexpected end of file while reading item metadata' });
  }
  const match = META_RE.exec(metaLine);
  if (!match) {
    return err({
      line: cursor.lineNumber - 1,
      reason: `Malformed metadata comment: ${describeLine(metaLine)}`,
    });
  }
  const rawId = match[1] ?? '';
  const rawCreated = match[2] ?? '';
  const rawCompleted = match[3];
  const rawDiscarded = match[4];
  const rawTags = match[5];

  const idResult = makeItemId(rawId);
  if (!idResult.ok) {
    return err({ line: cursor.lineNumber - 1, reason: `Invalid id: ${JSON.stringify(idResult.error)}` });
  }
  const createdResult = makeIsoTimestamp(rawCreated);
  if (!createdResult.ok) {
    return err({
      line: cursor.lineNumber - 1,
      reason: `Invalid created timestamp: ${JSON.stringify(createdResult.error)}`,
    });
  }

  let completedAt: IsoTimestamp | undefined;
  if (rawCompleted !== undefined) {
    const completedResult = makeIsoTimestamp(rawCompleted);
    if (!completedResult.ok) {
      return err({
        line: cursor.lineNumber - 1,
        reason: `Invalid completed timestamp: ${JSON.stringify(completedResult.error)}`,
      });
    }
    completedAt = completedResult.value;
  }

  let discardedAt: IsoTimestamp | undefined;
  if (rawDiscarded !== undefined) {
    const discardedResult = makeIsoTimestamp(rawDiscarded);
    if (!discardedResult.ok) {
      return err({
        line: cursor.lineNumber - 1,
        reason: `Invalid discarded timestamp: ${JSON.stringify(discardedResult.error)}`,
      });
    }
    discardedAt = discardedResult.value;
  }

  if (completedAt !== undefined && discardedAt !== undefined) {
    return err({
      line: cursor.lineNumber - 1,
      reason: 'An item cannot have both completed: and discarded: metadata',
    });
  }

  const headline = headlineResult.value;
  const tagsResult = parseItemTags(rawTags, definedTags, headline, cursor.lineNumber - 1);
  if (!tagsResult.ok) return tagsResult;
  const tags = tagsResult.value;

  const descResult = parseOptionalDescription(cursor);
  if (!descResult.ok) return descResult;
  const description = descResult.value;

  const id: ItemId = idResult.value;
  const createdAt: IsoTimestamp = createdResult.value;

  if (discardedAt !== undefined) {
    if (fileSection !== 'discarded') {
      return err({
        line: cursor.lineNumber,
        reason: 'Item with discarded: metadata found outside the Discarded section',
      });
    }
    const item: DiscardedItem = {
      id,
      headline,
      createdAt,
      status: 'discarded',
      description,
      discardedAt,
      tags,
    };
    return ok({ item, warning: undefined });
  }

  if (completedAt !== undefined) {
    if (fileSection !== 'complete') {
      return err({
        line: cursor.lineNumber,
        reason: 'Item with completed: metadata found outside the Complete section',
      });
    }
    if (description === null) {
      return err({ line: cursor.lineNumber, reason: 'A Complete item must have a description' });
    }
    const item: CompleteItem = {
      id,
      headline,
      createdAt,
      status: 'complete',
      description,
      completedAt,
      tags,
    };
    return ok({ item, warning: undefined });
  }

  if (fileSection === 'complete' || fileSection === 'discarded') {
    return err({
      line: cursor.lineNumber,
      reason: `Item under ${fileSection === 'complete' ? 'Complete' : 'Discarded'} is missing the required metadata`,
    });
  }

  const item: ActiveItem = { id, headline, createdAt, status: 'active', description, tags };
  const expectedSection: Section = description === null ? 'new' : 'wip';
  const warning: ParseWarning | undefined =
    expectedSection === fileSection
      ? undefined
      : {
          line: cursor.lineNumber,
          reason: `"${item.headline}" is under ${fileSection === 'new' ? 'New' : 'WIP'} but its description implies ${
            expectedSection === 'new' ? 'New' : 'WIP'
          }; it will be normalised on the next write`,
        };

  return ok({ item, warning });
}

function parseOptionalDescription(cursor: Cursor): Result<Description | null, ParseError> {
  if (cursor.peek() !== DESC_START) {
    return ok(null);
  }
  cursor.advance();
  const rawLines: string[] = [];
  for (;;) {
    const line = cursor.peek();
    if (line === undefined) {
      return err({
        line: cursor.lineNumber,
        reason: `Unterminated description block (missing "${DESC_END}")`,
      });
    }
    if (line === DESC_END) {
      cursor.advance();
      break;
    }
    rawLines.push(line);
    cursor.advance();
  }
  const descResult = makeOptionalDescription(rawLines.join('\n'));
  if (!descResult.ok) {
    return err({
      line: cursor.lineNumber,
      reason: `Invalid description: ${JSON.stringify(descResult.error)}`,
    });
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
