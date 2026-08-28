import { mount } from 'svelte';
import App from './App.svelte';
import './main.css';

const target = document.getElementById('app');
if (!target) throw new Error('dashboard: #app missing');

const app = mount(App, { target });

export default app;
