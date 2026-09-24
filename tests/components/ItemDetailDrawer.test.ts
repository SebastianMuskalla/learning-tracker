// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ItemDetailDrawer from '../../src/components/ItemDetailDrawer.vue';
import { generateItemId, makeDescription, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem } from '../../src/domain/types';
import { useBoardStore } from '../../src/store/board';

function item(headline: string, description: string | null): ActiveItem {
  return {
    id: generateItemId(),
    headline: unwrap(makeHeadline(headline)),
    createdAt: unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z')),
    status: 'active',
    description: description === null ? null : unwrap(makeDescription(description)),
    tags: [],
  };
}

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountDrawer(initial: ActiveItem) {
  return mount(ItemDetailDrawer, {
    props: { item: initial, tags: [] },
    global: { plugins: [pinia] },
  });
}

describe('ItemDetailDrawer drafts (C6)', () => {
  it('saves a changed description on blur, with the item id', async () => {
    const first = item('Topic', 'old');
    const wrapper = mountDrawer(first);

    await wrapper.get('textarea').setValue('new text');
    await wrapper.get('textarea').trigger('blur');

    expect(wrapper.emitted('setDescription')).toEqual([[first.id, 'new text']]);
  });

  it('does not emit on blur when nothing changed', async () => {
    const wrapper = mountDrawer(item('Topic', 'same'));

    await wrapper.get('textarea').trigger('blur');
    await wrapper.get('input.headline').trigger('blur');

    expect(wrapper.emitted('setDescription')).toBeUndefined();
    expect(wrapper.emitted('editHeadline')).toBeUndefined();
  });

  it('does not emit when only blank lines around the text changed', async () => {
    const wrapper = mountDrawer(item('Topic', 'same'));

    await wrapper.get('textarea').setValue('\nsame\n\n');
    await wrapper.get('textarea').trigger('blur');

    expect(wrapper.emitted('setDescription')).toBeUndefined();
  });

  it('saves on Ctrl+S', async () => {
    const first = item('Topic', null);
    const wrapper = mountDrawer(first);

    await wrapper.get('textarea').setValue('typed');
    await wrapper.get('aside').trigger('keydown', { key: 's', ctrlKey: true });

    expect(wrapper.emitted('setDescription')).toEqual([[first.id, 'typed']]);
  });

  it('follows a change of the stored description while the draft has no changes', async () => {
    const first = item('Topic', 'old');
    const wrapper = mountDrawer(first);

    await wrapper.setProps({
      item: { ...first, description: unwrap(makeDescription('merged from GitHub')) },
    });

    expect(wrapper.get('textarea').element.value).toBe('merged from GitHub');
    expect(wrapper.find('.changed-elsewhere').exists()).toBe(false);
  });

  it('keeps a draft with changes when the stored description changes, and offers both versions', async () => {
    const first = item('Topic', 'old');
    const wrapper = mountDrawer(first);
    await wrapper.get('textarea').setValue('my draft');

    await wrapper.setProps({ item: { ...first, description: unwrap(makeDescription('theirs')) } });

    expect(wrapper.get('textarea').element.value).toBe('my draft');
    expect(wrapper.get('.changed-elsewhere').text()).toContain('changed on GitHub');

    const useTheirs = wrapper.findAll('.changed-elsewhere button').find((b) => b.text() === 'Use theirs');
    await useTheirs?.trigger('click');
    expect(wrapper.get('textarea').element.value).toBe('theirs');
    expect(wrapper.find('.changed-elsewhere').exists()).toBe(false);
  });

  it('saves a draft with changes when the drawer closes (unmount)', async () => {
    const first = item('Topic', 'old');
    const wrapper = mountDrawer(first);
    await wrapper.get('textarea').setValue('typed, then Escape');

    wrapper.unmount();

    expect(wrapper.emitted('setDescription')).toEqual([[first.id, 'typed, then Escape']]);
  });

  it('saves the draft of the previous item, with its id, when another item is selected', async () => {
    const first = item('First', 'one');
    const second = item('Second', 'two');
    const wrapper = mountDrawer(first);
    await wrapper.get('textarea').setValue('draft for first');

    await wrapper.setProps({ item: second });

    expect(wrapper.emitted('setDescription')).toEqual([[first.id, 'draft for first']]);
    expect(wrapper.get('textarea').element.value).toBe('two');
  });

  it('does not save the drafts of a deleted item', async () => {
    const first = item('Topic', 'old');
    const wrapper = mountDrawer(first);
    await wrapper.get('textarea').setValue('typed');

    const deleteButton = wrapper.findAll('.actions button').find((b) => b.text().includes('Delete'));
    await deleteButton?.trigger('click');
    const confirm = wrapper.findAll('dialog button').find((b) => b.text().includes('Delete permanently'));
    await confirm?.trigger('click');
    expect(wrapper.emitted('delete')).toEqual([[first.id]]);

    // test-utils starts a new record of emitted events on unmount, so this sees only the
    // events emitted while unmounting.
    wrapper.unmount();
    expect(wrapper.emitted('setDescription')).toBeUndefined();
  });

  it('reports a draft with changes to the store, so closing the tab asks first', async () => {
    const wrapper = mountDrawer(item('Topic', 'old'));
    const board = useBoardStore(pinia);

    await wrapper.get('textarea').setValue('typed');
    expect(board.hasUnsavedWork).toBe(true);

    wrapper.unmount();
    expect(board.hasUnsavedWork).toBe(false);
  });
});
