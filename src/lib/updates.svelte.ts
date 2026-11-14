// Looks for a newer version of the app and remembers whether one is waiting. Nothing here ever
// reloads the page by itself: the welcome screen shows a banner and the player decides.

import { registerSW } from 'virtual:pwa-register'
import { SAVE_VERSION, parseSaveVersion, updateRisk } from './saveVersion'
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
  /** Update was tapped with a game in progress, and the new version is being asked whether it can read it. */
  checking: false,
  /**
   * Update was tapped but would (ends) or might (unknown) end the game in progress. The banner shows a
   * warning, and nothing happens until the player confirms or cancels.
   */
  warning: null as null | 'ends' | 'unknown',
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
  updates.warning = null
  updates.installing = true
  void applyUpdate?.(true)
  setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS)
}

/** How long to wait for version.json before giving up. */
const VERSION_TIMEOUT_MS = 4000

/** The save version of the newest app on the server, or null if it cannot be read right now. */
async function newestSaveVersion(): Promise<number | null> {
  try {
    // version.json is never kept by the service worker or the browser, so this is the server's answer.
    const url = new URL('version.json', document.baseURI)
    url.searchParams.set('t', String(Date.now()))
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(VERSION_TIMEOUT_MS) })
    return response.ok ? parseSaveVersion(await response.text()) : null
  } catch {
    return null
  }
}

/**
 * The Update button. With no game in progress it updates at once. With one, it first asks whether the
 * new version can still read the saved game, and if not (or if it cannot find out) it shows a warning
 * and waits for the player to confirm or cancel.
 */
export async function requestUpdate(gameInProgress: boolean): Promise<void> {
  if (updates.installing || updates.checking) return
  if (!gameInProgress) {
    installUpdate()
    return
  }
  updates.checking = true
  const risk = updateRisk(true, SAVE_VERSION, await newestSaveVersion())
  updates.checking = false
  if (risk === 'none') installUpdate()
  else updates.warning = risk
}

/** Backs out of the warning. The game in progress is untouched and the banner goes back to normal. */
export function cancelUpdate(): void {
  updates.warning = null
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
