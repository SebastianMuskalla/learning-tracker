// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import ItemCard from '../../src/components/ItemCard.vue';
import { generateItemId, makeDescription, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { NewItem } from '../../src/domain/types';

const item: NewItem = {
  id: generateItemId(),
  headline: unwrap(makeHeadline('Item')),
  createdAt: unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z')),
  status: 'new',
  description: null,
  tags: [],
};

function mountCard(card: NewItem = item) {
  return mount(ItemCard, {
    props: { item: card, section: 'new', tags: [] },
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
}

describe('ItemCard keyboard access (O1)', () => {
  it('can be focused', () => {
    const wrapper = mountCard();
    expect(wrapper.get('li').attributes('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('opens on Enter and on Space', async () => {
    const wrapper = mountCard();

    await wrapper.get('li').trigger('keydown', { key: 'Enter' });
    await wrapper.get('li').trigger('keydown', { key: ' ' });

    expect(wrapper.emitted('select')).toHaveLength(2);
    wrapper.unmount();
  });

  it('focuses the headline input when editing starts', async () => {
    const wrapper = mountCard();

    await wrapper.get('.headline').trigger('dblclick');
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(wrapper.get('input.headline-input').element);
    wrapper.unmount();
  });
});

describe('ItemCard rename', () => {
  it.each(['enter', 'esc'])('saves the new headline on %s, once', async (key) => {
    const wrapper = mountCard();
    await wrapper.get('.headline').trigger('dblclick');
    const input = wrapper.get('input.headline-input');
    await input.setValue('Renamed');

    await input.trigger(`keyup.${key}`);
    // The browser can fire `blur` while it removes the field.
    await input.trigger('blur');

    expect(wrapper.emitted('editHeadline')).toEqual([['Renamed']]);
    expect(wrapper.find('input.headline-input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the new headline when the field loses the focus', async () => {
    const wrapper = mountCard();
    await wrapper.get('.headline').trigger('dblclick');
    const input = wrapper.get('input.headline-input');
    await input.setValue('Renamed');

    await input.trigger('blur');

    expect(wrapper.emitted('editHeadline')).toEqual([['Renamed']]);
    wrapper.unmount();
  });
});

describe('ItemCard Complete button', () => {
  // Scenario "Card without a description" of the requirement "No Complete button on a card without a description".
  it('shows no Complete button for a New item without a description', () => {
    const wrapper = mountCard();
    expect(wrapper.find('button[title="Complete"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the Complete button for a New item with a description, and emits complete on a click', async () => {
    const wrapper = mountCard({ ...item, description: unwrap(makeDescription('notes')) });
    await wrapper.get('button[title="Complete"]').trigger('click');
    expect(wrapper.emitted('complete')).toHaveLength(1);
    wrapper.unmount();
  });
});
