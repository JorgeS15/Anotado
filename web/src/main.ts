import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { pwa } from './lib/pwa.svelte';
import './app.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    pwa.update = () => updateSW(true);
    pwa.needRefresh = true;
  },
  onRegisteredSW(_url, registration) {
    // Check for a new version every hour while the app stays open.
    if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  },
});

export default mount(App, { target: document.getElementById('app')! });
