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
    case 'createTag':
      return `Create tag "${command.name}"`;
    case 'setTagColor':
      return `Recolor tag "${command.name}"`;
    case 'deleteTag':
      return `Delete tag "${command.name}"`;
    case 'tagItem':
      return `Tag "${headline}" with "${command.tag}"`;
    case 'untagItem':
      return `Untag "${headline}" from "${command.tag}"`;
  }
}

export const INITIALIZE_MESSAGE = 'Initialize learning.md';

/**
 * Combines the per-command messages of one debounced batch into a single commit message.
 * A batch of one keeps that command's own message; a bigger batch gets a subject line plus
 * one line per command in the body, so several quick edits become one commit, not several.
 */
export function combineMessages(messages: readonly string[]): string {
  const [first] = messages;
  if (first === undefined || messages.length === 1) return first ?? '';
  return `Update learning.md (${String(messages.length)} changes)\n\n${messages.map((m) => `- ${m}`).join('\n')}`;
}
