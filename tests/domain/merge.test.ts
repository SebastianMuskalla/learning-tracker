import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { emptyBoard, validateBoard } from '../../src/domain/board';
import {
  generateItemId,
  makeDescription,
  makeHeadline,
  makeHexColor,
  makeIsoTimestamp,
  makeTagName,
} from '../../src/domain/factories';
import { merge } from '../../src/domain/merge';
import { unwrap } from '../../src/domain/result';
import type {
  ActiveItem,
  Board,
  CompleteItem,
  DiscardedItem,
  HexColor,
  Headline,
  Tag,
  TagName,
} from '../../src/domain/types';

const CREATED = unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z'));
const COMPLETED = unwrap(makeIsoTimestamp('2026-09-05T00:00:00Z'));
const DISCARDED = unwrap(makeIsoTimestamp('2026-09-06T00:00:00Z'));

function headline(text: string): Headline {
  return unwrap(makeHeadline(text));
}

function tagName(text: string): TagName {
  return unwrap(makeTagName(text));
}

function hexColor(text: string): HexColor {
  return unwrap(makeHexColor(text));
}

function tag(name: string, color: string): Tag {
  return { name: tagName(name), color: hexColor(color) };
}

function newItem(text: string, overrides: Partial<ActiveItem> = {}): ActiveItem {
  return {
    id: generateItemId(),
    headline: headline(text),
    createdAt: CREATED,
    status: 'active',
    description: null,
    tags: [],
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
    tags: [],
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
    tags: [],
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
    tags: [],
    ...overrides,
  };
}

function boardWith(...items: readonly (ActiveItem | CompleteItem | DiscardedItem)[]): Board {
  return boardWithTags([], ...items);
}

function boardWithTags(
  tags: readonly Tag[],
  ...items: readonly (ActiveItem | CompleteItem | DiscardedItem)[]
): Board {
  const board: {
    tags: Tag[];
    new: ActiveItem[];
    wip: ActiveItem[];
    complete: CompleteItem[];
    discarded: DiscardedItem[];
  } = {
    tags: [...tags],
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

function headlines(board: Board, section: Exclude<keyof Board, 'tags'>): readonly string[] {
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
      tags: item.tags,
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

  describe('tags', () => {
    it('a tag added only locally is kept', () => {
      const base = emptyBoard();
      const merged = ok(merge(base, boardWithTags([tag('vue', '#aacbee')]), base));
      expect(merged.tags).toEqual([tag('vue', '#aacbee')]);
    });

    it('a tag added identically on both sides is kept once', () => {
      const base = emptyBoard();
      const merged = ok(
        merge(base, boardWithTags([tag('vue', '#aacbee')]), boardWithTags([tag('vue', '#aacbee')])),
      );
      expect(merged.tags).toEqual([tag('vue', '#aacbee')]);
    });

    it('a tag added on both sides with different colors is an unmergeable conflict', () => {
      const base = emptyBoard();
      const result = merge(
        base,
        boardWithTags([tag('vue', '#aacbee')]),
        boardWithTags([tag('vue', '#f6c9a4')]),
      );
      expect(result).toMatchObject({ ok: false, error: { type: 'DivergentTagEdit', name: 'vue' } });
    });

    it('a tag deleted locally but still used remotely on an item: no conflict, definition and item tag both drop', () => {
      const vue = tag('vue', '#aacbee');
      const item = newItem('Topic', { tags: [vue.name] });
      const base = boardWithTags([vue], item);
      const local = boardWithTags([], item);
      const remoteItem = { ...item, headline: headline('Renamed remotely') };
      const remote = boardWithTags([vue], remoteItem);

      const merged = ok(merge(base, local, remote));
      expect(merged.tags).toEqual([]);
      expect(merged.new).toHaveLength(1);
      expect(merged.new[0]?.tags).toEqual([]);
    });

    it('a color changed on only one side wins', () => {
      const vue = tag('vue', '#aacbee');
      const base = boardWithTags([vue]);
      const recolored = { ...vue, color: hexColor('#f6c9a4') };
      const merged = ok(merge(base, boardWithTags([recolored]), base));
      expect(merged.tags).toEqual([recolored]);
    });

    it('a color changed differently on both sides is a real, unmergeable conflict', () => {
      const vue = tag('vue', '#aacbee');
      const base = boardWithTags([vue]);
      const mine = { ...vue, color: hexColor('#f6c9a4') };
      const theirs = { ...vue, color: hexColor('#d8b8e6') };
      const result = merge(base, boardWithTags([mine]), boardWithTags([theirs]));
      expect(result).toMatchObject({ ok: false, error: { type: 'DivergentTagEdit', name: vue.name } });
    });
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
    // A small, hand-rolled arbitrary board: a handful of distinct "new" items plus a handful of
    // distinct tags, each item tagged with an arbitrary subset (in definition order) — section
    // placement and ordering are already covered by the deterministic cases above, so this
    // property suite is about the three-way merge invariants holding over arbitrary item and tag
    // sets together.
    const arbitraryHeadline = fc
      .string({ minLength: 1, maxLength: 20 })
      .map((s) => s.replace(/\n/g, ' ').split('<!--').join(''))
      .filter((s) => s.trim().length > 0);

    const TEST_COLORS = ['#aacbee', '#f6c9a4', '#b9dcb8', '#f4b8b0'].map((c) => hexColor(c));

    const arbitraryTagList: fc.Arbitrary<readonly Tag[]> = fc
      .uniqueArray(
        fc
          .string({ minLength: 1, maxLength: 10 })
          .map((s) => s.replace(/[^a-zA-Z0-9_-]/g, 'x'))
          .filter((s) => s.length > 0),
        { minLength: 0, maxLength: 4, selector: (s) => s.toLowerCase() },
      )
      .map((names) => names.map((name, i) => tag(name, TEST_COLORS[i % TEST_COLORS.length] ?? '#aacbee')));

    const arbitraryBoard: fc.Arbitrary<Board> = fc
      .tuple(arbitraryTagList, fc.uniqueArray(arbitraryHeadline, { minLength: 0, maxLength: 6 }))
      .chain(([tags, texts]) =>
        fc
          .array(fc.subarray(tags.map((t) => t.name)), { minLength: texts.length, maxLength: texts.length })
          .map((tagSubsets) =>
            boardWithTags(tags, ...texts.map((text, i) => newItem(text, { tags: tagSubsets[i] ?? [] }))),
          ),
      );

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

    it('the same tag created on both sides with a different case is a conflict, not a crash', () => {
      const local = {
        ...emptyBoard(),
        tags: [{ name: unwrap(makeTagName('x')), color: unwrap(makeHexColor('#aacbee')) }],
      };
      const remote = {
        ...emptyBoard(),
        tags: [{ name: unwrap(makeTagName('X')), color: unwrap(makeHexColor('#aacbee')) }],
      };

      const result = merge(emptyBoard(), local, remote);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.type).toBe('DivergentTagEdit');
    });

    it('every successful merge of independent boards passes validateBoard', () => {
      fc.assert(
        fc.property(arbitraryBoard, arbitraryBoard, arbitraryBoard, (base, local, remote) => {
          const result = merge(base, local, remote);
          return !result.ok || validateBoard(result.value).ok;
        }),
      );
    });
  });
});
