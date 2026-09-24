import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { useBoardStore } from './store/board';
import { useThemeStore } from './store/theme';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import './styles/base.css';

const pinia = createPinia();
const app = createApp(App).use(pinia);
// Apply the saved theme before the first render, so the page does not flash the wrong colors.
useThemeStore(pinia);

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Errors in watchers, event handlers, and promises nobody waits for would otherwise only reach
// the console. Log them, and show a short, non-blocking message.
app.config.errorHandler = (cause) => {
  console.error(cause);
  useBoardStore(pinia).showNotice(`Unexpected error: ${errorText(cause)}`);
};
window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  useBoardStore(pinia).showNotice(`Unexpected error: ${errorText(event.reason)}`);
});
// Vite fires this when a lazily loaded chunk cannot be loaded, usually because a new version was
// deployed and the old chunk files are gone.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  useBoardStore(pinia).showNotice('A new version of the app is available. Reload the page to use it.');
});

app.mount('#app');
