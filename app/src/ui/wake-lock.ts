const IDLE_MS = 90_000; // no tap, key, note or run for this long: let the screen time out as usual

let touch: () => void = () => {};

/** Something is happening (a tap, a key, a note, a frame of a run): keep the screen on for a while longer. Cheap enough to call every frame. */
export function screenActivity(): void {
  touch();
}

/**
 * Keeps the screen on while you are playing: a piano is played with both hands, so nobody can tap the screen to wake it.
 * Only while there is activity, and for IDLE_MS after the last: a screen left lit on the music stand is the biggest drain on a phone.
 */
export function keepScreenOn(): void {
  if (!('wakeLock' in navigator)) return;
  let lock: WakeLockSentinel | undefined;
  let pending = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  const release = (): void => { const l = lock; lock = undefined; void l?.release().catch(() => {}); };
  const acquire = async (): Promise<void> => {
    if (lock || pending || document.visibilityState !== 'visible') return;
    pending = true;
    try {
      const l = await navigator.wakeLock.request('screen');
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = undefined; }); // the browser drops it when the tab is hidden
    } catch { /* refused (low battery, no permission): the screen just times out as before */ }
    pending = false;
  };
  touch = (): void => {
    const now = performance.now();
    if (lock && now - last < 5000) return; // frames call this: re-arm the timer only now and then
    last = now;
    clearTimeout(idle);
    idle = setTimeout(release, IDLE_MS);
    void acquire();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touch(); });
  // Some browsers only grant it after a tap or key press.
  for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, touch, { passive: true });
  touch();
}
