import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useBoardStore } from '../store/board';
import { useSettingsStore } from '../store/settings';

/**
 * Connects the board store to page lifecycle events. Call it once, in App.vue, so it is active on
 * every screen (tags are edited on the settings screen, so work can be pending there too).
 *
 *  - tab hidden: write pending work now, through the normal queue (browsers keep running network
 *    requests for a hidden tab);
 *  - tab visible again: read the newest version (skipped while there is local work);
 *  - `pagehide`: the page goes away; send a best-effort `keepalive` write;
 *  - `pageshow` from the back/forward cache: read the newest version;
 *  - `beforeunload`: ask the user to confirm while there is unsaved work;
 *  - `online`: retry a write that failed while the network was down;
 *  - another tab of the app wrote or read a newer version (`BroadcastChannel`): read it too, so
 *    the next write does not start with an old sha and a 409.
 */
const CHANNEL_NAME = 'learning-tracker';

export function useSyncLifecycle(): void {
  const boardStore = useBoardStore();
  const settings = useSettingsStore();

  function onVisibilityChange(): void {
    if (!settings.isReady) return;
    if (document.visibilityState === 'visible') {
      void boardStore.refresh();
    } else {
      void boardStore.flushNow();
    }
  }

  function onPageHide(): void {
    if (!settings.isReady) return;
    boardStore.flushBeforeUnload();
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted && settings.isReady) void boardStore.refresh();
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!boardStore.hasUnsavedWork) return;
    // No browser lets us show custom text any more; this is what triggers its own generic prompt.
    event.preventDefault();
  }

  function onOnline(): void {
    if (settings.isReady) void boardStore.retryNow();
  }

  // Tabs of the app in the same browser tell each other the newest sha of the file.
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

  function fileKey(): string {
    return `${settings.owner}/${settings.repo}/${settings.branch}/${settings.path}`;
  }

  watch(
    () => boardStore.sha,
    (sha) => {
      if (sha !== null) channel?.postMessage({ file: fileKey(), sha });
    },
  );

  function onChannelMessage(event: MessageEvent): void {
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null) return;
    const file: unknown = Reflect.get(data, 'file');
    const sha: unknown = Reflect.get(data, 'sha');
    if (typeof sha !== 'string' || file !== fileKey() || !settings.isReady) return;
    // `refresh` skips itself while this tab has unsaved work; the merge handles that case.
    if (sha !== boardStore.sha) void boardStore.refresh();
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('online', onOnline);
    channel?.addEventListener('message', onChannelMessage);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('online', onOnline);
    channel?.removeEventListener('message', onChannelMessage);
    channel?.close();
  });
}
