// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConflictBanner from '../../src/components/ConflictBanner.vue';
import { emptyBoard } from '../../src/domain/board';

describe('ConflictBanner (O1)', () => {
  it('is a modal dialog named by its heading', () => {
    const wrapper = mount(ConflictBanner, { props: { local: emptyBoard(), remote: emptyBoard() } });

    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby') ?? ''}`).text()).toContain(
      'changed in two places',
    );
  });

  it('does not close on Escape: the user has to choose', async () => {
    const wrapper = mount(ConflictBanner, { props: { local: emptyBoard(), remote: emptyBoard() } });

    await wrapper.get('dialog').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('keepMine')).toBeUndefined();
    expect(wrapper.emitted('keepTheirs')).toBeUndefined();
  });

  it('emits the choice', async () => {
    const wrapper = mount(ConflictBanner, { props: { local: emptyBoard(), remote: emptyBoard() } });

    await wrapper.get('button.ghost').trigger('click');

    expect(wrapper.emitted('keepTheirs')).toHaveLength(1);
  });
});
