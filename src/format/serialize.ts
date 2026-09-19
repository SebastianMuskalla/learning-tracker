import type { Board, Item, Section, Tag } from '../domain/types';

export const FORMAT_VERSION = 'v1';
export const HEADER_TITLE = '# Learning';
export const HEADER_COMMENT = `<!-- learning-tracker: ${FORMAT_VERSION} — edit by hand at your own risk; the app validates strictly -->`;
export const DESC_START = '<!-- desc -->';
export const DESC_END = '<!-- /desc -->';

const SECTION_TITLES: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

const SECTION_ORDER: readonly Section[] = ['new', 'wip', 'complete', 'discarded'];

export function serialize(board: Board): string {
  const lines: string[] = [HEADER_TITLE, '', HEADER_COMMENT, ''];
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
    lines.push(DESC_START, ...item.description.split('\n'), DESC_END);
  }
  lines.push('');
  return lines;
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
