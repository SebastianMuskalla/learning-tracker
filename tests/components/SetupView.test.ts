// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupView from '../../src/components/SetupView.vue';
import { emptyBoard } from '../../src/domain/board';
import { applyCommand } from '../../src/domain/commands';
import { makeHeadline, makeHexColor, makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board } from '../../src/domain/types';
import { serialize } from '../../src/format/serialize';
import * as client from '../../src/github/client';
import { useBoardStore } from '../../src/store/board';
import { useSettingsStore } from '../../src/store/settings';

vi.mock('../../src/github/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/github/client')>();
  return { ...actual, getFile: vi.fn(), putFile: vi.fn() };
});

const getFile = vi.mocked(client.getFile);
const putFile = vi.mocked(client.putFile);

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.updateRepoSettings({ owner: 'me', repo: 'old-repo', branch: 'main', path: 'learning.md' });
  settings.setToken('test-token');
});

function mountSetup() {
  return mount(SetupView, { props: { reason: null }, global: { plugins: [pinia] }, attachTo: document.body });
}

async function loadBoard(board: Board): Promise<ReturnType<typeof useBoardStore>> {
  const store = useBoardStore();
  getFile.mockResolvedValueOnce({ ok: true, value: { text: serialize(board), sha: 's1' } });
  await store.load();
  return store;
}

async function fieldByLabel(
  wrapper: ReturnType<typeof mountSetup>,
  label: string,
  value: string,
): Promise<void> {
  const field = wrapper.findAll('label').find((l) => l.text().startsWith(label));
  if (!field) throw new Error(`no field ${label}`);
  await field.get('input').setValue(value);
}

describe('switching repositories (C5)', () => {
  it('writes pending work to the old repository, then forgets its state', async () => {
    const store = await loadBoard(emptyBoard());
    store.applyAndSync({ type: 'add', headline: unwrap(makeHeadline('Mine')) });
    putFile.mockResolvedValue({ ok: true, value: { sha: 's2' } });
    const wrapper = mountSetup();

    await fieldByLabel(wrapper, 'Repository', 'new-repo');
    await wrapper.get('button.primary').trigger('click');
    await flushPromises();

    expect(putFile).toHaveBeenCalledWith(expect.objectContaining({ repo: 'old-repo' }), expect.anything());
    const settings = useSettingsStore();
    expect(settings.repo).toBe('new-repo');
    expect(store.sha).toBeNull();
    expect(store.board.new).toEqual([]);
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not switch when the pending work could not be written', async () => {
    const store = await loadBoard(emptyBoard());
    store.applyAndSync({ type: 'add', headline: unwrap(makeHeadline('Mine')) });
    putFile.mockResolvedValue({ ok: false, error: { type: 'Network', message: 'offline' } });
    const wrapper = mountSetup();

    await fieldByLabel(wrapper, 'Repository', 'new-repo');
    await wrapper.get('button.primary').trigger('click');
    await flushPromises();

    expect(useSettingsStore().repo).toBe('old-repo');
    expect(store.board.new.map((i) => i.headline)).toEqual(['Mine']);
    expect(wrapper.text()).toContain('not saved yet');
    expect(wrapper.emitted('done')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the state when the repository does not change', async () => {
    const store = await loadBoard(emptyBoard());
    const wrapper = mountSetup();

    await wrapper.get('button.primary').trigger('click');
    await flushPromises();

    expect(store.sha).toBe('s1');
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
  });

  it('rejects owner or repository names with characters GitHub does not allow (O2)', async () => {
    const wrapper = mountSetup();

    await fieldByLabel(wrapper, 'Owner', 'me/other');
    await wrapper.get('button.primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('may only contain');
    expect(useSettingsStore().owner).toBe('me');
    wrapper.unmount();
  });
});

describe('deleting a tag', () => {
  it('shows how many items use the tag, in a modal dialog', async () => {
    const tag = unwrap(makeTagName('vue'));
    let board = unwrap(
      applyCommand(emptyBoard(), { type: 'createTag', name: tag, color: unwrap(makeHexColor('#aacbee')) }),
    );
    for (const headline of ['One', 'Two']) {
      board = unwrap(applyCommand(board, { type: 'add', headline: unwrap(makeHeadline(headline)) }));
      const id = board.new[0]?.id;
      if (id === undefined) throw new Error('no item');
      board = unwrap(applyCommand(board, { type: 'tagItem', id, tag }));
    }
    await loadBoard(board);
    const wrapper = mountSetup();

    await wrapper.get('button[aria-label="Delete tag vue"]').trigger('click');

    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('aria-labelledby')).toBe('delete-tag-title');
    expect(dialog.text()).toContain('It is used by 2 items. They will lose this tag.');
    wrapper.unmount();
  });
});
