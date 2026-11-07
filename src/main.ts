import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { startUpdateChecks } from './lib/updates.svelte'

startUpdateChecks()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
