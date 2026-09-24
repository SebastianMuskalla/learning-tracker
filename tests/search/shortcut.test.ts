// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { searchShortcutAction } from '../../src/search/shortcut';

function keydown(key: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers });
}

describe('searchShortcutAction', () => {
  it.each(['f', 'k', 'F', 'K'])('Ctrl+%s focuses the search bar when it is unfocused', (key) => {
    expect(searchShortcutAction(keydown(key, { ctrlKey: true }), false)).toBe('focus');
  });

  it.each(['f', 'k'])('Ctrl+%s hands off to the browser when the search bar is focused', (key) => {
    expect(searchShortcutAction(keydown(key, { ctrlKey: true }), true)).toBe('browser');
  });

  it('Ctrl+Shift+F is not the shortcut', () => {
    expect(searchShortcutAction(keydown('f', { ctrlKey: true, shiftKey: true }), false)).toBe('none');
  });

  it('plain f is not the shortcut', () => {
    expect(searchShortcutAction(keydown('f'), false)).toBe('none');
  });

  it('Ctrl+G is not the shortcut', () => {
    expect(searchShortcutAction(keydown('g', { ctrlKey: true }), false)).toBe('none');
  });

  it('Meta+F (macOS Cmd+F) focuses the search bar when it is unfocused', () => {
    expect(searchShortcutAction(keydown('f', { metaKey: true }), false)).toBe('focus');
  });

  it('Meta+F hands off to the browser when the search bar is focused', () => {
    expect(searchShortcutAction(keydown('f', { metaKey: true }), true)).toBe('browser');
  });

  it('Ctrl+Alt+F is not the shortcut', () => {
    expect(searchShortcutAction(keydown('f', { ctrlKey: true, altKey: true }), false)).toBe('none');
  });
});
