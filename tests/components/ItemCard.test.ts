// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import ItemCard from '../../src/components/ItemCard.vue';
import { generateItemId, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem } from '../../src/domain/types';

const item: ActiveItem = {
  id: generateItemId(),
  headline: unwrap(makeHeadline('Topic')),
  createdAt: unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z')),
  status: 'active',
  description: null,
  tags: [],
};

function mountCard() {
  return mount(ItemCard, {
    props: { item, section: 'new', tags: [] },
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
