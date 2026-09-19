import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyBoard, validateBoard } from '../../src/domain/board';
import { generateItemId, makeDescription, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { merge } from '../../src/domain/merge';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem, Board, CompleteItem, DiscardedItem, Headline } from '../../src/domain/types';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));
const COMPLETED = unwrap(makeIsoTimestamp('2026-09-05T00:00:00Z'));
const DISCARDED = unwrap(makeIsoTimestamp('2026-09-06T00:00:00Z'));

function headline(text: string): Headline {
  return unwrap(makeHeadline(text));
}

function newItem(text: string, overrides: Partial<ActiveItem> = {}): ActiveItem {
  return {
    id: generateItemId(),
    headline: headline(text),
    createdAt: CREATED,
    status: 'active',
    description: null,
    ...overrides,
  };
}

function wipItem(text: string, description: string, overrides: Partial<ActiveItem> = {}): ActiveItem {
  return {
    id: generateItemId(),
    headline: headline(text),
    createdAt: CREATED,
    status: 'active',
    description: unwrap(makeDescription(description)),
    ...overrides,
  };
}

function completeItem(
  text: string,
  description: string,
  overrides: Partial<CompleteItem> = {},
): CompleteItem {
  return {
    id: generateItemId(),
    headline: headline(text),
    createdAt: CREATED,
    status: 'complete',
    description: unwrap(makeDescription(description)),
    completedAt: COMPLETED,
    ...overrides,
  };
}

function discardedItem(text: string, overrides: Partial<DiscardedItem> = {}): DiscardedItem {
  return {
    id: generateItemId(),
    headline: headline(text),
    createdAt: CREATED,
    status: 'discarded',
    description: null,
    discardedAt: DISCARDED,
    ...overrides,
  };
}

function boardWith(...items: readonly (ActiveItem | CompleteItem | DiscardedItem)[]): Board {
  const board: {
    new: ActiveItem[];
    wip: ActiveItem[];
    complete: CompleteItem[];
    discarded: DiscardedItem[];
  } = {
    new: [],
    wip: [],
    complete: [],
    discarded: [],
  };
  for (const item of items) {
    if (item.status === 'complete') board.complete.push(item);
    else if (item.status === 'discarded') board.discarded.push(item);
    else if (item.description === null) board.new.push(item);
    else board.wip.push(item);
  }
  return board;
}

function ok(result: ReturnType<typeof merge>): Board {
  if (!result.ok)
    throw new Error(`expected a successful merge, got a conflict: ${JSON.stringify(result.error)}`);
  return result.value;
}

function headlines(board: Board, section: keyof Board): readonly string[] {
  return board[section].map((item) => item.headline);
}

describe('merge', () => {
  it('an item added only locally is kept', () => {
    const base = emptyBoard();
    const mine = newItem('Mine');
    const merged = ok(merge(base, boardWith(mine), base));
    expect(headlines(merged, 'new')).toEqual(['Mine']);
  });

  it('an item added only remotely is kept', () => {
    const base = emptyBoard();
    const theirs = newItem('Theirs');
    const merged = ok(merge(base, base, boardWith(theirs)));
    expect(headlines(merged, 'new')).toEqual(['Theirs']);
  });

  it('items added independently on both sides are both kept', () => {
    const base = emptyBoard();
    const mine = newItem('Mine');
    const theirs = newItem('Theirs');
    const merged = ok(merge(base, boardWith(mine), boardWith(theirs)));
    expect([...headlines(merged, 'new')].sort()).toEqual(['Mine', 'Theirs']);
  });

  it('an item deleted locally (present remotely, unchanged) is dropped — delete wins', () => {
    const item = newItem('Gone locally');
    const base = boardWith(item);
    const merged = ok(merge(base, emptyBoard(), base));
    expect(merged).toEqual(emptyBoard());
  });

  it('an item deleted remotely (present locally, unchanged) is dropped — delete wins', () => {
    const item = newItem('Gone remotely');
    const base = boardWith(item);
    const merged = ok(merge(base, base, emptyBoard()));
    expect(merged).toEqual(emptyBoard());
  });

  it('an item changed on only the local side keeps the local change', () => {
    const item = newItem('Original');
    const base = boardWith(item);
    const renamed = { ...item, headline: headline('Renamed locally') };
    const merged = ok(merge(base, boardWith(renamed), base));
    expect(headlines(merged, 'new')).toEqual(['Renamed locally']);
  });

  it('an item changed on only the remote side keeps the remote change', () => {
    const item = newItem('Original');
    const base = boardWith(item);
    const renamed = { ...item, headline: headline('Renamed remotely') };
    const merged = ok(merge(base, base, boardWith(renamed)));
    expect(headlines(merged, 'new')).toEqual(['Renamed remotely']);
  });

  it('an item changed identically on both sides is kept once, not duplicated', () => {
    const item = newItem('Original');
    const base = boardWith(item);
    const renamed = { ...item, headline: headline('Same rename') };
    const merged = ok(merge(base, boardWith(renamed), boardWith({ ...renamed })));
    expect(headlines(merged, 'new')).toEqual(['Same rename']);
  });

  it('an item changed differently on both sides is a real, unmergeable conflict', () => {
    const item = newItem('Original');
    const base = boardWith(item);
    const mine = { ...item, headline: headline('Mine') };
    const theirs = { ...item, headline: headline('Theirs') };
    const result = merge(base, boardWith(mine), boardWith(theirs));
    expect(result).toMatchObject({ ok: false, error: { type: 'DivergentEdit', id: item.id } });
  });

  it('an item moved to a different section on only one side (e.g. completed locally) is kept there', () => {
    const item = wipItem('In progress', 'some notes');
    const base = boardWith(item);
    const completed: CompleteItem = {
      id: item.id,
      headline: item.headline,
      createdAt: item.createdAt,
      status: 'complete',
      description: unwrap(makeDescription('some notes')),
      completedAt: COMPLETED,
    };
    const merged = ok(merge(base, boardWith(completed), base));
    expect(headlines(merged, 'complete')).toEqual(['In progress']);
    expect(merged.wip).toHaveLength(0);
  });

  it('order follows remote, with local-only additions inserted at their local position', () => {
    const a = newItem('A');
    const b = newItem('B');
    const base = boardWith(a, b);
    // Remote reordered to [B, A]; local added C at the front.
    const remote = boardWith(b, a);
    const c = newItem('C');
    const local = { ...boardWith(a, b), new: [c, a, b] };
    const merged = ok(merge(base, local, remote));
    expect(headlines(merged, 'new')).toEqual(['C', 'B', 'A']);
  });

  it('every successful merge produces a structurally valid board', () => {
    const item = newItem('Original');
    const base = boardWith(item);
    const renamed = { ...item, headline: headline('Renamed') };
    const merged = ok(merge(base, boardWith(renamed), base));
    expect(validateBoard(merged).ok).toBe(true);
  });

  describe('identity cases', () => {
    it('merge(base, base, remote) equals remote', () => {
      const item = newItem('X');
      const base = emptyBoard();
      const remote = boardWith(item);
      expect(ok(merge(base, base, remote))).toEqual(remote);
    });

    it('merge(base, local, base) equals local', () => {
      const item = newItem('X');
      const base = emptyBoard();
      const local = boardWith(item);
      expect(ok(merge(base, local, base))).toEqual(local);
    });

    it('merge(b, b, b) equals b', () => {
      const b = boardWith(newItem('A'), wipItem('B', 'desc'), completeItem('C', 'desc'), discardedItem('D'));
      expect(ok(merge(b, b, b))).toEqual(b);
    });
  });

  describe('properties', () => {
    // A small, hand-rolled arbitrary board: a handful of distinct "new" items, since section
    // placement and ordering are already covered by the deterministic cases above — this
    // property suite is about the three-way merge invariants holding over arbitrary item sets.
    const arbitraryHeadline = fc
      .string({ minLength: 1, maxLength: 20 })
      .map((s) => s.replace(/\n/g, ' ').split('<!--').join(''))
      .filter((s) => s.trim().length > 0);

    const arbitraryBoard: fc.Arbitrary<Board> = fc
      .uniqueArray(arbitraryHeadline, { minLength: 0, maxLength: 6 })
      .map((texts) => boardWith(...texts.map((t) => newItem(t))));

    it('merge(base, base, remote) always equals remote', () => {
      fc.assert(
        fc.property(arbitraryBoard, arbitraryBoard, (base, remote) => {
          expect(ok(merge(base, base, remote))).toEqual(remote);
        }),
      );
    });

    it('merge(base, local, base) always equals local', () => {
      fc.assert(
        fc.property(arbitraryBoard, arbitraryBoard, (base, local) => {
          expect(ok(merge(base, local, base))).toEqual(local);
        }),
      );
    });

    it('every successful merge of independent boards passes validateBoard', () => {
      fc.assert(
        fc.property(arbitraryBoard, arbitraryBoard, arbitraryBoard, (base, local, remote) => {
          const result = merge(base, local, remote);
          if (result.ok) expect(validateBoard(result.value).ok).toBe(true);
        }),
      );
    });
  });
});
