// Looks for a newer version of the app and remembers whether one is waiting. Nothing here ever
// reloads the page by itself: the welcome screen shows a banner and the player decides.

import { registerSW } from 'virtual:pwa-register'
import { SNOOZE_KEY, isSnoozed, snoozeUntil } from './snooze'

function readSnoozed(): boolean {
  try {
    return isSnoozed(localStorage.getItem(SNOOZE_KEY), Date.now())
  } catch {
    return false
  }
}

export const updates = $state({
  /** A newer version has been downloaded and is waiting. */
  ready: false,
  /** The player hid the banner for a day. */
  snoozed: readSnoozed(),
  /** Update was tapped and the page is about to reload. */
  installing: false,
})

let applyUpdate: ((reload?: boolean) => Promise<void>) | undefined

/** Registers the service worker and keeps checking for a new version while the app is open. */
export function startUpdateChecks(): void {
  if (applyUpdate) return
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updates.ready = true
      updates.snoozed = readSnoozed()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      // A phone can keep the app in the background for days, so look again whenever it comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, 60 * 60 * 1000)
      check()
    },
  })
}

/** How long to wait for the switch before reloading the page ourselves. */
const RELOAD_FALLBACK_MS = 8000

/**
 * Switches to the new version. This reloads the page, so only the welcome screen offers it. The switch
 * takes a moment, so the banner shows it is working, and if the page has not reloaded by itself after
 * a few seconds it is reloaded here (the new version is already active by then).
 */
export function installUpdate(): void {
  if (updates.installing) return
  updates.installing = true
  void applyUpdate?.(true)
  setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS)
}

/** Hides the banner for a day. */
export function snoozeUpdate(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(snoozeUntil(Date.now())))
  } catch {
    // Without storage the banner just comes back next time.
  }
  updates.snoozed = true
}
