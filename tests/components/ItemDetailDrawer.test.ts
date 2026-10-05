// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ItemDetailDrawer from '../../src/components/ItemDetailDrawer.vue';
import { applyCommand } from '../../src/domain/commands';
import { generateItemId, makeDescription, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import { findItemById, type ActiveItem } from '../../src/domain/types';
import { useBoardStore } from '../../src/store/board';
import { BoardBuilder } from '../links/boardBuilder';

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

describe('ItemDetailDrawer keyword links', () => {
  /** OWASP (Complete), XSS (WIP), and a WIP source that mentions both. */
  function setup(sourceDescription = 'Read about OWASP and XSS.', extra?: (b: BoardBuilder) => void) {
    const builder = new BoardBuilder()
      .add('OWASP (Open Worldwide Application Security Project)', 'complete', 'The **OWASP** project.')
      .add('XSS', 'wip')
      .add('Source', 'wip', sourceDescription);
    extra?.(builder);
    useBoardStore(pinia).board = builder.board;
    const owaspId = builder.id('OWASP (Open Worldwide Application Security Project)');
    return { builder, owaspId };
  }

  function mountFor(builder: BoardBuilder, headline: string) {
    const shown = findItemById(builder.board, builder.id(headline));
    if (shown === undefined) throw new Error('no item');
    return mount(ItemDetailDrawer, {
      props: { item: shown, tags: [] },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('links a keyword of a Complete topic in the live preview, but not a WIP topic', async () => {
    const { builder, owaspId } = setup();
    const wrapper = mountFor(builder, 'Source');
    await flushPromises();
    const links = wrapper.findAll('.preview span.keyword-link');
    expect(links.map((l) => l.text())).toEqual(['OWASP']);
    expect(links[0]?.attributes('data-target-id')).toBe(owaspId);
    wrapper.unmount();
  });

  it('opens the target on click, without edit mode, in the read-only view', async () => {
    const { builder, owaspId } = setup('Read about OWASP.', (b) => b.add('Done', 'complete', 'See OWASP.'));
    const wrapper = mountFor(builder, 'Done');
    await flushPromises();
    const link = wrapper.get('.preview-static span.keyword-link');
    await link.trigger('click');
    expect(wrapper.emitted('openItem')).toEqual([[owaspId]]);
    expect(wrapper.find('textarea').exists()).toBe(false);

    await wrapper.get('.preview-static').trigger('click');
    expect(wrapper.find('textarea').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the target on Enter and on a middle click', async () => {
    const { builder, owaspId } = setup();
    const wrapper = mountFor(builder, 'Source');
    await flushPromises();
    const link = wrapper.get('.preview span.keyword-link');
    await link.trigger('keydown', { key: 'Enter' });
    await link.trigger('auxclick', { button: 1 });
    expect(wrapper.emitted('openItem')).toEqual([[owaspId], [owaspId]]);
    wrapper.unmount();
  });

  it('does not link a topic to itself', async () => {
    const { builder } = setup();
    const wrapper = mountFor(builder, 'OWASP (Open Worldwide Application Security Project)');
    await flushPromises();
    expect(wrapper.find('.preview-static').exists()).toBe(true);
    expect(wrapper.find('span.keyword-link').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the tooltip at once on focus, and after a delay on hover', async () => {
    const { builder } = setup();
    const wrapper = mountFor(builder, 'Source');
    await flushPromises();
    const link = wrapper.get('.preview span.keyword-link');

    await link.trigger('focusin');
    const tooltip = document.querySelector('.keyword-tooltip');
    expect(tooltip?.querySelector('.title')?.textContent).toBe(
      'OWASP (Open Worldwide Application Security Project)',
    );
    expect(tooltip?.querySelector('.body strong')?.textContent).toBe('OWASP');
    expect(tooltip?.querySelector('span.keyword-link')).toBeNull();

    await link.trigger('focusout');
    expect(document.querySelector('.keyword-tooltip')).toBeNull();

    vi.useFakeTimers();
    await link.trigger('pointerover', { pointerType: 'mouse' });
    await nextTick();
    expect(document.querySelector('.keyword-tooltip')).toBeNull();
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(document.querySelector('.keyword-tooltip')).not.toBeNull();

    await link.trigger('pointerout');
    expect(document.querySelector('.keyword-tooltip')).toBeNull();
    wrapper.unmount();
  });

  it('shows no tooltip on touch', async () => {
    const { builder } = setup();
    const wrapper = mountFor(builder, 'Source');
    await flushPromises();
    vi.useFakeTimers();
    await wrapper.get('.preview span.keyword-link').trigger('pointerover', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(document.querySelector('.keyword-tooltip')).toBeNull();
    wrapper.unmount();
  });

  it('shows the keywords of the headline draft, with a note for a topic that is not complete', async () => {
    const { builder } = setup();
    const wrapper = mountFor(builder, 'Source');
    expect(wrapper.findAll('.keyword-chip').map((c) => c.text())).toEqual(['Source']);
    expect(wrapper.get('.keywords').text()).toContain('Linked as:');
    expect(wrapper.get('.keywords').text()).toContain(
      'Other topics link here only when this topic is complete.',
    );

    await wrapper.get('input.headline').setValue('CI/CD, CD (x)');
    expect(wrapper.findAll('.keyword-chip').map((c) => c.text())).toEqual(['CI/CD', 'CD']);

    await wrapper.get('input.headline').setValue('(only)');
    expect(wrapper.find('.keyword-chip').exists()).toBe(false);
    expect(wrapper.get('.keywords').text()).toBe(
      'Not linked: the headline has no keyword with 2 or more characters.',
    );
    wrapper.unmount();
  });

  it('warns about a keyword that another Complete topic gives', () => {
    const { builder } = setup('Text', (b) => b.add('Owasp (other)', 'complete'));
    const wrapper = mountFor(builder, 'Owasp (other)');
    const chip = wrapper.get('.keyword-chip');
    expect(chip.classes()).toContain('collision');
    expect(chip.text()).toContain(
      'Also used by "OWASP (Open Worldwide Application Security Project)" — not linked.',
    );
    expect(wrapper.get('.keywords').text()).not.toContain('only when this topic is complete');
    wrapper.unmount();
  });

  it('updates the links when a target changes in the store', async () => {
    const { builder, owaspId } = setup();
    const wrapper = mountFor(builder, 'Source');
    await flushPromises();
    expect(wrapper.findAll('span.keyword-link')).toHaveLength(1);

    const store = useBoardStore(pinia);
    store.board = unwrap(applyCommand(store.board, { type: 'uncomplete', id: owaspId }));
    await flushPromises();
    expect(wrapper.findAll('span.keyword-link')).toHaveLength(0);
    wrapper.unmount();
  });
});
