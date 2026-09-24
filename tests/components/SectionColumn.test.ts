// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import SectionColumn from '../../src/components/SectionColumn.vue';
import { generateItemId, makeHeadline, makeIsoTimestamp } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { ActiveItem } from '../../src/domain/types';

function item(headline: string): ActiveItem {
  return {
    id: generateItemId(),
    headline: unwrap(makeHeadline(headline)),
    createdAt: unwrap(makeIsoTimestamp('2026-09-01T00:00:00Z')),
    status: 'active',
    description: null,
    tags: [],
  };
}

const first = item('First');
const second = item('Second');

function mountColumn() {
  return mount(SectionColumn, {
    props: {
      title: 'New',
      section: 'new',
      items: [first, second],
      totalCount: 2,
      filterActive: false,
      tags: [],
      dragDisabled: false,
    },
    global: { plugins: [createPinia()] },
  });
}

function listIsShown(wrapper: ReturnType<typeof mountColumn>): boolean {
  return wrapper.get('ul.list').attributes('style')?.includes('display: none') !== true;
}

describe('SectionColumn collapsing', () => {
  it('starts expanded', () => {
    const wrapper = mountColumn();
    expect(wrapper.get('button.toggle').attributes('aria-expanded')).toBe('true');
    expect(listIsShown(wrapper)).toBe(true);
  });

  it('clicking the headline collapses and expands the list, and the count stays visible', async () => {
    const wrapper = mountColumn();
    const toggle = wrapper.get('button.toggle');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(listIsShown(wrapper)).toBe(false);
    expect(wrapper.get('.count').text()).toBe('2');
    expect(wrapper.get('.title').text()).toBe('New');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(listIsShown(wrapper)).toBe(true);
  });

  it('stays collapsed while a filter changes the items, and shows the filtered count', async () => {
    const wrapper = mountColumn();
    await wrapper.get('button.toggle').trigger('click');

    await wrapper.setProps({ items: [second], filterActive: true });
    expect(listIsShown(wrapper)).toBe(false);
    expect(wrapper.get('.count').text()).toBe('1 of 2');

    await wrapper.get('button.toggle').trigger('click');
    expect(listIsShown(wrapper)).toBe(true);
    expect(wrapper.findAll('li')).toHaveLength(1);
  });
});
