// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConflictDialog from '../../src/components/ConflictDialog.vue';
import { emptyBoard } from '../../src/domain/board';
import { applyCommand } from '../../src/domain/commands';
import { makeDescription, makeHeadline, makeHexColor, makeTagName } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import type { Board } from '../../src/domain/types';

const noConflict = { local: emptyBoard(), remote: emptyBoard(), conflicts: [] };

describe('ConflictDialog (O1)', () => {
  it('is a modal dialog named by its heading', () => {
    const wrapper = mount(ConflictDialog, { props: noConflict });

    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby') ?? ''}`).text()).toContain(
      'changed in two places',
    );
  });

  it('does not close on Escape: the user has to choose', async () => {
    const wrapper = mount(ConflictDialog, { props: noConflict });

    await wrapper.get('dialog').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('keepMine')).toBeUndefined();
    expect(wrapper.emitted('keepTheirs')).toBeUndefined();
  });

  it('emits the choice', async () => {
    const wrapper = mount(ConflictDialog, { props: noConflict });

    await wrapper.get('button.ghost').trigger('click');

    expect(wrapper.emitted('keepTheirs')).toHaveLength(1);
  });
});

describe('ConflictDialog content', () => {
  const tagName = unwrap(makeTagName('Cloud'));
  const base = unwrap(
    applyCommand(
      unwrap(applyCommand(emptyBoard(), { type: 'add', headline: unwrap(makeHeadline('Docker')) })),
      { type: 'createTag', name: tagName, color: unwrap(makeHexColor('#aacbee')) },
    ),
  );
  const [item] = base.new;
  if (item === undefined) throw new Error('fixture has no item');
  const itemId = item.id;

  function withDescription(board: Board, text: string): Board {
    return unwrap(
      applyCommand(board, {
        type: 'setDescription',
        id: itemId,
        description: unwrap(makeDescription(text)),
      }),
    );
  }

  function withColor(board: Board, color: string): Board {
    return unwrap(
      applyCommand(board, { type: 'setTagColor', name: tagName, color: unwrap(makeHexColor(color)) }),
    );
  }

  it('shows both versions of each conflicting item and tag, with the descriptions and colors', () => {
    const wrapper = mount(ConflictDialog, {
      props: {
        local: withColor(withDescription(base, 'Mine'), '#f6c9a4'),
        remote: withColor(withDescription(base, 'Theirs'), '#d8b8e6'),
        conflicts: [
          { type: 'DivergentEdit', id: item.id },
          { type: 'DivergentTagEdit', name: tagName },
        ],
      },
    });

    const [itemRow, tagRow] = wrapper.findAll('.conflict');
    const itemVersions = itemRow?.findAll('.version') ?? [];
    expect(itemVersions.map((v) => v.get('h3').text())).toEqual(['Your version', "GitHub's version"]);
    expect(itemVersions.map((v) => v.get('.description').text())).toEqual(['Mine', 'Theirs']);
    expect(itemVersions.map((v) => v.get('.headline').text())).toEqual(['Docker', 'Docker']);
    expect(itemVersions[0]?.text()).toContain('New');

    const tagVersions = tagRow?.findAll('.version') ?? [];
    expect(tagVersions.map((v) => v.get('.tag-color').text())).toEqual(['#f6c9a4', '#d8b8e6']);
  });

  it('shows no row for an item that one side deleted, because a delete wins without the dialog', () => {
    const wrapper = mount(ConflictDialog, {
      props: { local: base, remote: emptyBoard(), conflicts: [{ type: 'DivergentEdit', id: item.id }] },
    });

    expect(wrapper.findAll('.conflict')).toHaveLength(0);
  });
});
