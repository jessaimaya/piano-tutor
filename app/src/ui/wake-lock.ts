/** Keeps the screen on while the app is open: a piano is played with both hands, so nobody can tap the screen to wake it. */
export function keepScreenOn(): void {
  if (!('wakeLock' in navigator)) return;
  let lock: WakeLockSentinel | undefined;
  const acquire = async (): Promise<void> => {
    if (lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = undefined; }); // the browser drops it when the tab is hidden
    } catch { /* refused (low battery, no permission): the screen just times out as before */ }
  };
  document.addEventListener('visibilitychange', () => void acquire());
  // Some browsers only grant it after a tap or key press.
  for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => void acquire(), { passive: true });
  void acquire();
}
