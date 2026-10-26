/** Three looks: a warm light one, a cold blue-grey one and a dark one. The choice is remembered in this browser. */
export const THEMES = [
  { id: 'warm', label: 'Warm modern' },
  { id: 'cold', label: 'Cold blues' },
  { id: 'night', label: 'Night' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'piano-tutor:theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/** The saved theme if it is still a known one, otherwise Night for a dark system and Warm for a light one. */
export function resolveTheme(saved: string | null | undefined, prefersDark: boolean): ThemeId {
  return isTheme(saved) ? saved : prefersDark ? 'night' : 'warm';
}

export function bindThemes(host: HTMLElement): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* private window: fall back to the system setting */ }
  let current = resolveTheme(saved, matchMedia('(prefers-color-scheme: dark)').matches);

  const apply = (id: ThemeId, remember: boolean) => {
    current = id;
    document.documentElement.dataset.theme = id;
    for (const b of host.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.theme === id));
    if (remember) try { localStorage.setItem(KEY, id); } catch { /* not saved */ }
  };

  host.replaceChildren(
    ...THEMES.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-dot';
      b.dataset.theme = t.id;
      b.title = t.label;
      b.setAttribute('aria-label', `${t.label} theme`);
      b.addEventListener('click', () => apply(t.id, true));
      return b;
    }),
  );
  apply(current, false);
}
