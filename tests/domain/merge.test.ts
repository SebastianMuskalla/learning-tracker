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
import { merge, mergeChoosing } from '../../src/domain/merge';
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
    statusTemp: 'active',
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
    statusTemp: 'active',
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
    statusTemp: 'complete',
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
    statusTemp: 'discarded',
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
    if (item.statusTemp === 'complete') board.complete.push(item);
    else if (item.statusTemp === 'discarded') board.discarded.push(item);
    else if (item.description === null) board.new.push(item);
    else board.wip.push(item);
  }
  return board;
}

function ok(result: ReturnType<typeof merge>): Board {
  if (!result.ok)
    throw new Error(`expected a successful merge, got a conflict: ${JSON.stringify(result.error)}`);
  return result.value.board;
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
    expect(result).toMatchObject({ ok: false, error: [{ type: 'DivergentEdit', id: item.id }] });
  });

  it('an item moved to a different section on only one side (e.g. completed locally) is kept there', () => {
    const item = wipItem('In progress', 'some notes');
    const base = boardWith(item);
    const completed: CompleteItem = {
      id: item.id,
      headline: item.headline,
      createdAt: item.createdAt,
      statusTemp: 'complete',
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

  describe('order of a section', () => {
    function mergedValue(result: ReturnType<typeof merge>) {
      if (!result.ok) throw new Error(`expected a successful merge: ${JSON.stringify(result.error)}`);
      return result.value;
    }

    it('a local reorder wins when only the local side reordered the section', () => {
      const [a, b, c] = [newItem('A'), newItem('B'), newItem('C')];
      const base = boardWith(a, b, c);
      const local = boardWith(c, a, b);
      const remote = boardWith(a, { ...b, headline: headline('B renamed') }, c);

      const result = mergedValue(merge(base, local, remote));

      expect(headlines(result.board, 'new')).toEqual(['C', 'A', 'B renamed']);
      expect(result.lostLocalReorders.size).toBe(0);
    });

    it('an item that the remote side added is placed at its remote position in a locally reordered section', () => {
      const [a, b, n] = [newItem('A'), newItem('B'), newItem('N')];
      const base = boardWith(a, b);

      const result = mergedValue(merge(base, boardWith(b, a), boardWith(n, a, b)));

      expect(headlines(result.board, 'new')).toEqual(['N', 'B', 'A']);
      expect(result.lostLocalReorders.size).toBe(0);
    });

    it('the remote order wins when both sides reordered the section differently, and the local reorder is lost', () => {
      const [a, b, c] = [newItem('A'), newItem('B'), newItem('C')];
      const base = boardWith(a, b, c);

      const result = mergedValue(merge(base, boardWith(c, a, b), boardWith(b, c, a)));

      expect(headlines(result.board, 'new')).toEqual(['B', 'C', 'A']);
      expect([...result.lostLocalReorders]).toEqual(['new']);
    });

    it('the same reorder on both sides is not lost', () => {
      const [a, b] = [newItem('A'), newItem('B')];
      const base = boardWith(a, b);

      const result = mergedValue(merge(base, boardWith(b, a), boardWith(b, a)));

      expect(headlines(result.board, 'new')).toEqual(['B', 'A']);
      expect(result.lostLocalReorders.size).toBe(0);
    });

    it('an item restored locally stays at the top of its new section', () => {
      const [w1, w2] = [wipItem('W1', 'notes'), wipItem('W2', 'notes')];
      const discarded = discardedItem('D', { description: unwrap(makeDescription('kept')) });
      const base = boardWith(w1, w2, discarded);
      const restored: ActiveItem = { ...wipItem('D', 'kept'), id: discarded.id };
      const local = { ...boardWith(w1, w2), wip: [restored, w1, w2] };
      const remote = boardWith(w1, { ...w2, headline: headline('W2 renamed') }, discarded);

      const result = mergedValue(merge(base, local, remote));

      expect(headlines(result.board, 'wip')).toEqual(['D', 'W1', 'W2 renamed']);
      expect(result.board.discarded).toHaveLength(0);
    });

    it('an item reopened locally stays at the top of the WIP section', () => {
      const w1 = wipItem('W1', 'notes');
      const done = completeItem('Done', 'text');
      const base = boardWith(w1, done);
      const reopened: ActiveItem = { ...wipItem('Done', 'text'), id: done.id };
      const local = { ...boardWith(w1), wip: [reopened, w1] };
      const remote = boardWith({ ...w1, headline: headline('W1 renamed') }, done);

      const result = mergedValue(merge(base, local, remote));

      expect(headlines(result.board, 'wip')).toEqual(['Done', 'W1 renamed']);
    });
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
      expect(result).toMatchObject({ ok: false, error: [{ type: 'DivergentTagEdit', name: 'vue' }] });
    });

    it('a tag deleted locally but still used remotely on an item: no conflict, definition and item tag both drop', () => {
      const vue = tag('vue', '#aacbee');
      const item = newItem('Item', { tags: [vue.name] });
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
      expect(result).toMatchObject({ ok: false, error: [{ type: 'DivergentTagEdit', name: vue.name }] });
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
      expect(!result.ok && result.error[0]?.type).toBe('DivergentTagEdit');
    });

    it('every successful merge of independent boards passes validateBoard', () => {
      fc.assert(
        fc.property(arbitraryBoard, arbitraryBoard, arbitraryBoard, (base, local, remote) => {
          const result = merge(base, local, remote);
          return !result.ok || validateBoard(result.value.board).ok;
        }),
      );
    });

    it('every merge with a chosen side passes validateBoard', () => {
      fc.assert(
        fc.property(
          arbitraryBoard,
          arbitraryBoard,
          arbitraryBoard,
          fc.constantFrom('local' as const, 'remote' as const),
          (base, local, remote, side) => validateBoard(mergeChoosing(base, local, remote, side).board).ok,
        ),
      );
    });
  });

  describe('all conflicts', () => {
    it('returns each conflicting item and each conflicting tag, not only the first', () => {
      const a = newItem('A');
      const b = newItem('B');
      const vue = tag('vue', '#aacbee');
      const base = boardWithTags([vue], a, b);
      const local = boardWithTags(
        [{ ...vue, color: hexColor('#f6c9a4') }],
        { ...a, headline: headline('A mine') },
        { ...b, headline: headline('B mine') },
      );
      const remote = boardWithTags(
        [{ ...vue, color: hexColor('#d8b8e6') }],
        { ...a, headline: headline('A theirs') },
        { ...b, headline: headline('B theirs') },
      );

      const result = merge(base, local, remote);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toEqual(
        expect.arrayContaining([
          { type: 'DivergentTagEdit', name: vue.name },
          { type: 'DivergentEdit', id: a.id },
          { type: 'DivergentEdit', id: b.id },
        ]),
      );
      expect(!result.ok && result.error).toHaveLength(3);
    });
  });

  describe('dropped local changes', () => {
    it('counts a local edit of an item that the remote side deleted', () => {
      const item = newItem('Original');
      const base = boardWith(item);
      const result = merge(base, boardWith({ ...item, headline: headline('Renamed') }), emptyBoard());

      expect(result).toMatchObject({ ok: true, value: { droppedLocalChanges: 1 } });
      expect(ok(result).new).toEqual([]);
    });

    it('counts a local recolor of a tag that the remote side deleted', () => {
      const vue = tag('vue', '#aacbee');
      const base = boardWithTags([vue]);
      const result = merge(base, boardWithTags([{ ...vue, color: hexColor('#f6c9a4') }]), emptyBoard());

      expect(result).toMatchObject({ ok: true, value: { droppedLocalChanges: 1 } });
    });

    it('does not count an unchanged local item that the remote side deleted', () => {
      const item = newItem('Original');
      const base = boardWith(item);

      expect(merge(base, base, emptyBoard())).toMatchObject({ ok: true, value: { droppedLocalChanges: 0 } });
    });

    it('does not count a remote edit of an item that the local side deleted', () => {
      const item = newItem('Original');
      const base = boardWith(item);
      const remote = boardWith({ ...item, headline: headline('Renamed') });

      const result = merge(base, emptyBoard(), remote);

      expect(result).toMatchObject({ ok: true, value: { droppedLocalChanges: 0 } });
      expect(ok(result)).toEqual(emptyBoard());
    });
  });

  describe('mergeChoosing', () => {
    // Item A conflicts. Item B changed only locally, item C only remotely.
    const a = newItem('A');
    const b = newItem('B');
    const c = newItem('C');
    const base = boardWith(a, b, c);
    const local = boardWith(
      { ...a, headline: headline('A mine') },
      { ...b, headline: headline('B mine') },
      c,
    );
    const remote = boardWith({ ...a, headline: headline('A theirs') }, b, {
      ...c,
      headline: headline('C theirs'),
    });

    it('"local" takes the local version of the conflicting item and keeps each other change', () => {
      const merged = mergeChoosing(base, local, remote, 'local').board;
      expect(headlines(merged, 'new')).toEqual(['A mine', 'B mine', 'C theirs']);
    });

    it('"remote" takes the remote version of the conflicting item and keeps each other change', () => {
      const merged = mergeChoosing(base, local, remote, 'remote').board;
      expect(headlines(merged, 'new')).toEqual(['A theirs', 'B mine', 'C theirs']);
    });

    it('a tag created on both sides with a different case keeps the chosen side', () => {
      const localTags = boardWithTags([tag('vue', '#aacbee')]);
      const remoteTags = boardWithTags([tag('Vue', '#aacbee')]);

      expect(mergeChoosing(emptyBoard(), localTags, remoteTags, 'local').board.tags).toEqual([
        tag('vue', '#aacbee'),
      ]);
      expect(mergeChoosing(emptyBoard(), localTags, remoteTags, 'remote').board.tags).toEqual([
        tag('Vue', '#aacbee'),
      ]);
    });
  });
});
