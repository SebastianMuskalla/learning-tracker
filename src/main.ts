import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import './styles/base.css';

createApp(App).use(createPinia()).mount('#app');
