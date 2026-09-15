import type { Command } from '../domain/commands';
import type { Item, Section } from '../domain/types';

const SECTION_LABELS: Record<Section, string> = {
  new: 'New',
  wip: 'WIP',
  complete: 'Complete',
  discarded: 'Discarded',
};

/** Needs the item as it existed before the command, to quote its headline. */
export function commitMessage(command: Command, item: Item | undefined): string {
  const headline = item?.headline ?? '';
  switch (command.type) {
    case 'add':
      return `Add "${command.headline}"`;
    case 'editHeadline':
      return `Rename "${headline}" → "${command.headline}"`;
    case 'setDescription':
      return `Describe "${headline}"`;
    case 'complete':
      return `Complete "${headline}"`;
    case 'uncomplete':
      return `Reopen "${headline}"`;
    case 'discard':
      return `Discard "${headline}"`;
    case 'restore':
      return `Restore "${headline}"`;
    case 'reorder':
      return `Reorder ${SECTION_LABELS[command.section]}`;
    case 'delete':
      return `Delete "${headline}"`;
  }
}

export const INITIALIZE_MESSAGE = 'Initialize learning.md';
