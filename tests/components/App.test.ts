// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.vue';
import { emptyBoard } from '../../src/domain/board';
import { makeHeadline } from '../../src/domain/factories';
import { unwrap } from '../../src/domain/result';
import { serialize } from '../../src/format/serialize';
import * as client from '../../src/github/client';
import { useBoardStore } from '../../src/store/board';

vi.mock('../../src/github/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/github/client')>();
  return { ...actual, getFile: vi.fn(), putFile: vi.fn() };
});

const getFile = vi.mocked(client.getFile);

function configure(): void {
  localStorage.setItem(
    'learning-tracker:settings',
    JSON.stringify({ owner: 'me', repo: 'learning-data', branch: 'main', path: 'learning.md' }),
  );
  localStorage.setItem('learning-tracker:token', 'test-token');
}

function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(App, { global: { plugins: [pinia] }, attachTo: document.body });
  return { wrapper, board: useBoardStore(pinia) };
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

function beforeUnloadIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  getFile.mockResolvedValue({ ok: true, value: { text: serialize(emptyBoard()), sha: 's1' } });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('unload protection (C4)', () => {
  it('asks before closing the tab while the settings screen is open and work is pending', () => {
    const { wrapper, board } = mountApp();
    expect(wrapper.find('.setup').exists()).toBe(true);

    board.applyAndSync({ type: 'add', headline: unwrap(makeHeadline('Mine')) });

    expect(beforeUnloadIsBlocked()).toBe(true);
    wrapper.unmount();
  });

  it('does not ask when there is no unsaved work', async () => {
    configure();
    const { wrapper } = mountApp();
    await flushPromises();

    expect(beforeUnloadIsBlocked()).toBe(false);
    wrapper.unmount();
  });

  it('asks while an editor has an unsaved draft', () => {
    const { wrapper, board } = mountApp();
    board.setDraftDirty('drawer-description', true);

    expect(beforeUnloadIsBlocked()).toBe(true);
    wrapper.unmount();
  });
});

describe('page lifecycle (C2)', () => {
  it('tab hidden → writes through the normal queue; tab visible → refreshes', async () => {
    configure();
    const { wrapper, board } = mountApp();
    await flushPromises();
    const flushNow = vi.spyOn(board, 'flushNow');
    const refresh = vi.spyOn(board, 'refresh');
    const flushBeforeUnload = vi.spyOn(board, 'flushBeforeUnload');

    setVisibility('hidden');
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(flushBeforeUnload).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('pagehide → best-effort keepalive write; pageshow from the back/forward cache → refresh', async () => {
    configure();
    const { wrapper, board } = mountApp();
    await flushPromises();
    const flushBeforeUnload = vi.spyOn(board, 'flushBeforeUnload');
    const refresh = vi.spyOn(board, 'refresh');

    window.dispatchEvent(new Event('pagehide'));
    expect(flushBeforeUnload).toHaveBeenCalledTimes(1);

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(refresh).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('online → retries a failed write', async () => {
    configure();
    const { wrapper, board } = mountApp();
    await flushPromises();
    const retryNow = vi.spyOn(board, 'retryNow');

    window.dispatchEvent(new Event('online'));

    expect(retryNow).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('another tab reports a newer sha → refreshes (C7)', async () => {
    configure();
    const { wrapper, board } = mountApp();
    await flushPromises();
    const refresh = vi.spyOn(board, 'refresh');
    const otherTab = new BroadcastChannel('learning-tracker');

    otherTab.postMessage({ file: 'me/learning-data/main/learning.md', sha: 's1' }); // same sha
    otherTab.postMessage({ file: 'me/other-repo/main/learning.md', sha: 's9' }); // another file
    otherTab.postMessage({ file: 'me/learning-data/main/learning.md', sha: 's2' });
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    otherTab.close();
    wrapper.unmount();
  });

  it('removes the listeners on unmount', async () => {
    configure();
    const { wrapper, board } = mountApp();
    await flushPromises();
    const flushNow = vi.spyOn(board, 'flushNow');
    wrapper.unmount();

    setVisibility('hidden');

    expect(flushNow).not.toHaveBeenCalled();
  });
});
