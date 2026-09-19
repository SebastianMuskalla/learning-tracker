// See doc/requirement-2-search.md section 3.7.

export type SearchShortcutResult = 'focus' | 'browser' | 'none';

/**
 * Decides what `Ctrl+F` / `Ctrl+K` (or `Cmd` on macOS) should do: focus the search input, let the
 * browser handle it (the search input already has focus), or do nothing (not the shortcut).
 */
export function searchShortcutAction(event: KeyboardEvent, searchHasFocus: boolean): SearchShortcutResult {
  const key = event.key.toLowerCase();
  const isShortcutKey = key === 'f' || key === 'k';
  const isPlainCtrlOrMeta = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
  if (!isShortcutKey || !isPlainCtrlOrMeta) return 'none';
  return searchHasFocus ? 'browser' : 'focus';
}
