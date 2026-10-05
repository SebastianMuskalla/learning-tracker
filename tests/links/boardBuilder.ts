import { emptyBoard } from '../../src/domain/board';
import { applyCommand, type Command } from '../../src/domain/commands';
import { generateItemId, makeDescription, makeHeadline } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board, ItemId } from '../../src/domain/types';

export type Status = 'new' | 'wip' | 'complete' | 'discarded';

/** Builds a board for the keyword-link tests. Each topic gets the description "About <headline>." */
export class BoardBuilder {
  board: Board = emptyBoard();
  readonly ids = new Map<string, ItemId>();

  add(headline: string, status: Status = 'complete', description = `About ${headline}.`): this {
    const id = generateItemId();
    this.ids.set(headline, id);
    this.run({ type: 'add', id, headline: unwrap(makeHeadline(headline)) });
    if (status === 'new') return this;
    this.run({ type: 'setDescription', id, description: unwrap(makeDescription(description)) });
    if (status === 'complete') this.run({ type: 'complete', id });
    if (status === 'discarded') this.run({ type: 'discard', id });
    return this;
  }

  id(headline: string): ItemId {
    const id = this.ids.get(headline);
    if (id === undefined) throw new Error(`no topic ${headline}`);
    return id;
  }

  private run(command: Command): void {
    this.board = unwrap(applyCommand(this.board, command));
  }
}
