import type { Board, Item, Section, Tag } from '../domain/types';
import { CURRENT_VERSION, versionLine } from './version';

export const HEADER_TITLE = '# Learning';
export const FENCE_LANGUAGE = 'markdown';
const MIN_FENCE_LENGTH = 3;

const SECTION_TITLES: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

const SECTION_ORDER: readonly Section[] = ['new', 'wip', 'complete', 'discarded'];

export function serialize(board: Board): string {
  const lines: string[] = [versionLine(CURRENT_VERSION), '', HEADER_TITLE, ''];
  for (const tag of board.tags) {
    lines.push(tagDefLine(tag));
  }
  if (board.tags.length > 0) {
    lines.push('');
  }

  for (const section of SECTION_ORDER) {
    lines.push(`## ${SECTION_TITLES[section]}`, '');
    for (const item of board[section]) {
      lines.push(...serializeItem(item));
    }
  }

  while (lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function serializeItem(item: Item): readonly string[] {
  const lines: string[] = [`### ${item.headline}`, metaLine(item)];
  if (item.description !== null) {
    const fence = '`'.repeat(fenceLength(item.description));
    lines.push(`${fence}${FENCE_LANGUAGE}`, ...item.description.split('\n'), fence);
  }
  lines.push('');
  return lines;
}

/**
 * The fence is longer than every backtick run at the start of a description line (after at most
 * 3 spaces). Only such a line can close a fence in CommonMark, so no line can close it early.
 */
export function fenceLength(description: string): number {
  let longest = 0;
  for (const line of description.split('\n')) {
    const match = /^ {0,3}(`+)/.exec(line);
    if (match?.[1] !== undefined) longest = Math.max(longest, match[1].length);
  }
  return Math.max(MIN_FENCE_LENGTH, longest + 1);
}

function metaLine(item: Item): string {
  const parts = [`id:${item.id}`, `created:${item.createdAt}`];
  if (item.status === 'complete') {
    parts.push(`completed:${item.completedAt}`);
  }
  if (item.status === 'discarded') {
    parts.push(`discarded:${item.discardedAt}`);
  }
  if (item.tags.length > 0) {
    parts.push(`tags:${item.tags.join(',')}`);
  }
  return `<!-- ${parts.join(' ')} -->`;
}

function tagDefLine(tag: Tag): string {
  return `<!-- tag:${tag.name} color:${tag.color} -->`;
}
