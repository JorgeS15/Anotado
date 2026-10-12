import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';

registerSW({ immediate: true });

export default mount(App, { target: document.getElementById('app')! });
