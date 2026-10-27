// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardView from '../../src/components/BoardView.vue';
import { emptyBoard } from '../../src/domain/board';
import { applyCommand, type Command } from '../../src/domain/commands';
import { generateItemId, makeHeadline, makeHexColor, makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board, ItemId } from '../../src/domain/types';
import { serialize } from '../../src/format/serialize';
import * as client from '../../src/github/client';
import { useBoardStore } from '../../src/store/board';
import { useSearchStore } from '../../src/store/search';
import { useSettingsStore } from '../../src/store/settings';
import { useTagFilterStore } from '../../src/store/tagFilter';
import { BoardBuilder } from '../keywords/boardBuilder';

vi.mock('../../src/github/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/github/client')>();
  return { ...actual, getFile: vi.fn(), putFile: vi.fn() };
});

const getFile = vi.mocked(client.getFile);
const putFile = vi.mocked(client.putFile);
const UNCATEGORIZED_KEY = 'learning-tracker:filter-uncategorized';
const vue = unwrap(makeTagName('vue'));
const rust = unwrap(makeTagName('rust'));

const ids = new Map<string, ItemId>();

function idOf(name: string): ItemId {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`no item ${name}`);
  return id;
}

function run(board: Board, command: Command): Board {
  return unwrap(applyCommand(board, command));
}

/** Tags vue and rust; items: Tagged (vue), Rusty (rust), Plain (none). */
function sampleBoard(): Board {
  let board = emptyBoard();
  board = run(board, { type: 'createTag', name: vue, color: unwrap(makeHexColor('#aacbee')) });
  board = run(board, { type: 'createTag', name: rust, color: unwrap(makeHexColor('#f6c9a4')) });
  for (const name of ['Plain', 'Rusty', 'Tagged']) {
    const id = generateItemId();
    ids.set(name, id);
    board = run(board, { type: 'add', id, headline: unwrap(makeHeadline(name)) });
  }
  board = run(board, { type: 'tagItem', id: idOf('Tagged'), tag: vue });
  board = run(board, { type: 'tagItem', id: idOf('Rusty'), tag: rust });
  return board;
}

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.updateRepoSettings({ owner: 'me', repo: 'data', branch: 'main', path: 'learning.md' });
  settings.setToken('test-token');
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function mountBoard(board: Board, active = false) {
  if (active) localStorage.setItem(UNCATEGORIZED_KEY, 'true');
  setActivePinia(pinia);
  const store = useTagFilterStore();
  getFile.mockResolvedValue({ ok: true, value: { text: serialize(board), sha: 's1' } });
  const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, store, board: useBoardStore() };
}

function chip(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.tag-filter-bar button').find((b) => b.text().includes('Uncategorized'));
}

function headlines(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.card .headline').map((h) => h.text());
}

describe('the Uncategorized chip', () => {
  it('is shown last when a tag is defined and an item has no tags', async () => {
    const { wrapper } = await mountBoard(sampleBoard());
    const chips = wrapper.findAll('.tag-filter-bar button');
    expect(chips.map((c) => c.text())).toEqual(['vue', 'rust', 'Uncategorized']);
    expect(chips[2]?.attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });

  it('is hidden when every item has a tag', async () => {
    const board = run(sampleBoard(), { type: 'tagItem', id: idOf('Plain'), tag: vue });
    const { wrapper } = await mountBoard(board);
    expect(chip(wrapper)).toBeUndefined();
    wrapper.unmount();
  });

  it('is hidden, and the filter bar too, when no tag is defined', async () => {
    let board = emptyBoard();
    board = run(board, { type: 'add', headline: unwrap(makeHeadline('Plain')) });
    const { wrapper } = await mountBoard(board);
    expect(wrapper.find('.tag-filter-bar').exists()).toBe(false);
    wrapper.unmount();
  });

  it('when active, shows only untagged items, with "x of y" counts and no dragging', async () => {
    const { wrapper } = await mountBoard(sampleBoard());
    await chip(wrapper)?.trigger('click');
    expect(headlines(wrapper)).toEqual(['Plain']);
    expect(wrapper.find('.count').text()).toBe('1 of 3');
    expect(wrapper.find('ul.list').classes()).toContain('drag-disabled');
    expect(chip(wrapper)?.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('combines with an active tag chip as a union', async () => {
    const { wrapper } = await mountBoard(sampleBoard());
    await chip(wrapper)?.trigger('click');
    const vueChip = () => wrapper.findAll('.tag-filter-bar button').find((b) => b.text() === 'vue');
    expect(vueChip()?.attributes('aria-pressed')).toBe('false');
    await vueChip()?.trigger('click');
    expect(vueChip()?.attributes('aria-pressed')).toBe('true');
    expect(headlines(wrapper).sort()).toEqual(['Plain', 'Tagged']);
    wrapper.unmount();
  });

  it('shows an item at once when it loses its last tag (also through deleteTag)', async () => {
    const { wrapper, board } = await mountBoard(sampleBoard(), true);
    expect(headlines(wrapper)).toEqual(['Plain']);
    board.applyAndSync({ type: 'deleteTag', name: rust });
    await flushPromises();
    expect(headlines(wrapper).sort()).toEqual(['Plain', 'Rusty']);
    wrapper.unmount();
  });

  it('disappears when the last untagged item gets a tag, and the stored state is cleared', async () => {
    const { wrapper, board, store } = await mountBoard(sampleBoard(), true);
    board.applyAndSync({ type: 'tagItem', id: idOf('Plain'), tag: vue });
    await flushPromises();
    expect(chip(wrapper)).toBeUndefined();
    expect(store.uncategorizedActive).toBe(false);
    expect(localStorage.getItem(UNCATEGORIZED_KEY)).toBeNull();
    expect(headlines(wrapper)).toHaveLength(3);
    wrapper.unmount();
  });

  it('forgets the state when the board loads without an untagged item', async () => {
    const board = run(sampleBoard(), { type: 'tagItem', id: idOf('Plain'), tag: vue });
    const { wrapper, store } = await mountBoard(board, true);
    expect(store.uncategorizedActive).toBe(false);
    wrapper.unmount();
  });

  it('keeps the stored state before the first load and when the file has a parse error', async () => {
    localStorage.setItem(UNCATEGORIZED_KEY, 'true');
    getFile.mockResolvedValue({ ok: true, value: { text: 'not a learning file', sha: 's1' } });
    const store = useTagFilterStore();
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    expect(store.uncategorizedActive).toBe(true);
    await flushPromises();
    expect(useBoardStore().parseError).not.toBeNull();
    expect(store.uncategorizedActive).toBe(true);
    wrapper.unmount();
  });

  it('keeps the stored state when a load fails because the network is down', async () => {
    localStorage.setItem(UNCATEGORIZED_KEY, 'true');
    getFile.mockResolvedValue({ ok: false, error: { type: 'Network', message: 'Failed to fetch' } });
    const store = useTagFilterStore();
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    await flushPromises();
    expect(useBoardStore().syncStatus).toBe('error');
    expect(store.uncategorizedActive).toBe(true);
    wrapper.unmount();
  });

  it('keeps the stored state while the file is not found', async () => {
    localStorage.setItem(UNCATEGORIZED_KEY, 'true');
    getFile.mockResolvedValue({ ok: false, error: { type: 'NotFound' } });
    const store = useTagFilterStore();
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    await flushPromises();
    expect(useBoardStore().fileNotFound).toBe(true);
    expect(store.uncategorizedActive).toBe(true);
    wrapper.unmount();
  });
});

describe('keyword links', () => {
  it('open an item that the search hides, and the search term stays', async () => {
    const builder = new BoardBuilder()
      .add('OWASP', 'complete', 'The project.')
      .add('Source', 'new', 'Read about OWASP.');
    const { wrapper } = await mountBoard(builder.board);
    const search = useSearchStore();
    search.term = 'Source';
    await flushPromises();
    expect(headlines(wrapper)).toEqual(['Source']);

    await wrapper
      .findAll('.card')
      .find((c) => c.text().includes('Source'))
      ?.trigger('click');
    await flushPromises();
    await wrapper.get('.detail-view span.keyword-link').trigger('click');
    await flushPromises();

    expect(wrapper.get<HTMLInputElement>('.detail-view input.headline').element.value).toBe('OWASP');
    expect(search.term).toBe('Source');
    expect(headlines(wrapper)).toEqual(['Source']);
    wrapper.unmount();
  });
});

describe('the "Item" field of the header bar', () => {
  it('shows a message for an empty headline and adds no item', async () => {
    const { wrapper, board } = await mountBoard(sampleBoard());

    await wrapper.get('.header-bar form').trigger('submit');

    expect(wrapper.get('.add-error').text()).toBe('Enter a short, single-line headline.');
    expect(board.board.new).toHaveLength(3);
    wrapper.unmount();
  });

  it('is disabled while learning.md is missing, and enabled after the user creates the file', async () => {
    getFile.mockResolvedValue({ ok: false, error: { type: 'NotFound' } });
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    await flushPromises();
    const field = () => wrapper.get<HTMLInputElement>('.header-bar input');
    const addButton = () => wrapper.get<HTMLButtonElement>('.header-bar button[type="submit"]');
    expect(field().element.disabled).toBe(true);
    expect(addButton().element.disabled).toBe(true);

    putFile.mockResolvedValue({ ok: true, value: { sha: 's1' } });
    const create = wrapper.findAll('button').find((b) => b.text().includes('Create it'));
    await create?.trigger('click');
    await flushPromises();

    expect(field().element.disabled).toBe(false);
    expect(addButton().element.disabled).toBe(false);
    wrapper.unmount();
  });
});

describe('the Complete button on a card', () => {
  // Scenario "Complete on the card" of the requirement "Complete on the card".
  it('completes the New item with a description and puts it first in the Complete section', async () => {
    const builder = new BoardBuilder().add('Git', 'complete').add('Docker', 'new');
    const { wrapper, board } = await mountBoard(builder.board);

    await wrapper.get('.card.new .actions button').trigger('click');
    await flushPromises();

    expect(board.board.complete.map((item) => item.headline)).toEqual(['Docker', 'Git']);
    expect(wrapper.findAll('.card.complete .headline').map((h) => h.text())).toEqual(['Docker', 'Git']);
    wrapper.unmount();
  });
});

describe('search', () => {
  async function search(wrapper: ReturnType<typeof mount>, term: string): Promise<void> {
    await wrapper.get('.search-bar input').setValue(term);
    await flushPromises();
  }

  it('shows the match count and an X button that clears the search', async () => {
    const { wrapper } = await mountBoard(sampleBoard());
    expect(wrapper.find('.search-bar .clear').exists()).toBe(false);

    await search(wrapper, 'plain');
    expect(headlines(wrapper)).toEqual(['Plain']);
    expect(wrapper.get('.search-bar .count').text()).toBe('1 out of 3 items');

    await wrapper.get('.search-bar .clear').trigger('click');
    expect(wrapper.get<HTMLInputElement>('.search-bar input').element.value).toBe('');
    expect(headlines(wrapper)).toHaveLength(3);
    expect(wrapper.find('.search-bar .clear').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows each item for a term without a letter or a digit', async () => {
    const { wrapper } = await mountBoard(sampleBoard());

    await search(wrapper, '-');

    expect(headlines(wrapper)).toHaveLength(3);
    expect(wrapper.get('.search-bar .count').text()).toBe('3 out of 3 items');
    wrapper.unmount();
  });

  it('turns off drag and drop', async () => {
    const { wrapper } = await mountBoard(sampleBoard());
    expect(wrapper.get('ul.list').classes()).not.toContain('drag-disabled');

    await search(wrapper, 'plain');

    expect(wrapper.get('ul.list').classes()).toContain('drag-disabled');
    wrapper.unmount();
  });

  it('tells the user about a match that is only in a link target', async () => {
    const builder = new BoardBuilder().add('Docs', 'new', 'See [the site](https://example.org).');
    const { wrapper } = await mountBoard(builder.board);

    await search(wrapper, 'example.org');

    expect(wrapper.get('.card .desc-hint').text()).toBe(
      'Also matches in the description (not visible in this preview)',
    );
    wrapper.unmount();
  });

  it('moves the focus to the search bar on Ctrl+K while the user edits a description', async () => {
    const builder = new BoardBuilder().add('Docker', 'new');
    const { wrapper } = await mountBoard(builder.board);
    await wrapper.get('.card').trigger('click');
    const textarea = wrapper.get<HTMLTextAreaElement>('.detail-view textarea').element;
    textarea.focus();

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

    expect(document.activeElement).toBe(wrapper.get('.search-bar input').element);
    wrapper.unmount();
  });
});

describe('a file that the app cannot read', () => {
  it('shows the line of a parse error, a link to the file, and that writes are blocked', async () => {
    const text = serialize(sampleBoard()).replace(/created:\S+ -->/, 'created:broken -->');
    const line = text.split('\n').findIndex((l) => l.includes('created:broken')) + 1;
    getFile.mockResolvedValue({ ok: true, value: { text, sha: 's1' } });
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    await flushPromises();

    const banner = wrapper.get('.banner');
    expect(banner.text()).toContain(`learning.md failed to parse (line ${String(line)}).`);
    expect(banner.get('a').attributes('href')).toBe('https://github.com/me/data/blob/main/learning.md');
    expect(banner.text()).toContain('All writes are blocked until the file is fixed by hand.');
    expect(banner.find('button.reload').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a Reload button for a file with a newer format version', async () => {
    const text = serialize(sampleBoard()).replace('version:6', 'version:7');
    getFile.mockResolvedValue({ ok: true, value: { text, sha: 's1' } });
    const wrapper = mount(BoardView, { global: { plugins: [pinia] }, attachTo: document.body });
    await flushPromises();

    const banner = wrapper.get('.banner');
    expect(banner.text()).toContain('All writes are blocked until the app is reloaded.');
    expect(banner.get('button.reload').text()).toBe('Reload');
    expect(putFile).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
