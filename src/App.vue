<script setup lang="ts">
import { ref, watch } from 'vue';
import BoardView from './components/BoardView.vue';
import SetupView from './components/SetupView.vue';
import { useSyncLifecycle } from './composables/useSyncLifecycle';
import { useBoardStore } from './store/board';
import { useSettingsStore } from './store/settings';

const settings = useSettingsStore();
const boardStore = useBoardStore();
useSyncLifecycle();
const showSetup = ref(!settings.isReady);
const setupReason = ref<string | null>(null);

watch(
  () => settings.isReady,
  (ready) => {
    if (ready) showSetup.value = false;
  },
);

function openSettings(reason?: string): void {
  setupReason.value = reason ?? null;
  showSetup.value = true;
}

function onSetupDone(): void {
  // A token rejection while the setup screen was open sets this flag, but only the board watches
  // it. Clear it, so that the next rejection on the board opens the setup screen again.
  boardStore.unauthorized = false;
  setupReason.value = null;
  showSetup.value = false;
}
</script>

<template>
  <SetupView v-if="showSetup" :reason="setupReason" @done="onSetupDone" />
  <BoardView v-else @open-settings="openSettings" />
</template>
