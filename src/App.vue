<script setup lang="ts">
import { ref, watch } from 'vue';
import BoardView from './components/BoardView.vue';
import SetupView from './components/SetupView.vue';
import { useSyncLifecycle } from './composables/useSyncLifecycle';
import { useSettingsStore } from './store/settings';

const settings = useSettingsStore();
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
  setupReason.value = null;
  showSetup.value = false;
}
</script>

<template>
  <SetupView v-if="showSetup" :reason="setupReason" @done="onSetupDone" />
  <BoardView v-else @open-settings="openSettings" />
</template>
