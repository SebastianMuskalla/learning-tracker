import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { useThemeStore } from './store/theme';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import './styles/base.css';

const pinia = createPinia();
const app = createApp(App).use(pinia);
// Apply the saved theme before the first render, so the page does not flash the wrong colors.
useThemeStore(pinia);
app.mount('#app');
