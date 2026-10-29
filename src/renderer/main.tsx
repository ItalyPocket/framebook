import React from 'react'
import { createRoot } from 'react-dom/client'
import { useSettings } from './settings'
import { App } from './App'
import { useStore } from './store'
import { registerControlHandler } from './control'

// Automation surface for the e2e smoke test and for AI-agent driving — not a
// public API; see AGENTS.md.
;(window as unknown as Record<string, unknown>).__sbr = {
  store: useStore
}

// External agents (MCP clients) drive the app through this whitelist.
registerControlHandler()

const root = createRoot(document.getElementById('root')!)
void useSettings.getState().load().catch(() => undefined).then(() => root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
))
