/**
 * The tempo readout: − and + buttons, and a tick ruler that fills up to the current tempo with a notch at the piece's target.
 * main.ts sets #bpm, its range and #target directly, so the ruler follows those instead of being told about each change.
 */
export function bindTempoDial(): void {
  const input = document.getElementById('bpm') as HTMLInputElement;
  const ruler = document.querySelector<HTMLElement>('.ruler')!;
  const minEl = document.getElementById('bpm-min')!;
  const maxEl = document.getElementById('bpm-max')!;
  const targetEl = document.getElementById('target')!;

  const pct = (v: number, min: number, max: number) => (max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 0);
  const sync = () => {
    const min = Number(input.min) || 30;
    const max = Number(input.max) || 160;
    const target = Number(/\d+/.exec(targetEl.textContent ?? '')?.[0]);
    ruler.style.setProperty('--pct', `${pct(Number(input.value) || min, min, max)}%`);
    ruler.style.setProperty('--tpct', `${pct(target, min, max)}%`);
    ruler.classList.toggle('no-target', !target);
    minEl.textContent = String(min);
    maxEl.textContent = String(max);
  };

  // Programmatic `.value = …` does not fire events, so watch the property itself.
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
  Object.defineProperty(input, 'value', {
    get() { return native.get!.call(this); },
    set(v: string) { native.set!.call(this, v); sync(); },
  });
  const watch = new MutationObserver(sync);
  watch.observe(input, { attributes: true, attributeFilter: ['min', 'max'] });
  watch.observe(targetEl, { childList: true, characterData: true, subtree: true });
  input.addEventListener('input', sync);

  const nudge = (dir: 1 | -1) => {
    const step = Number(input.step) || 2;
    input.value = String(Math.round(Number(input.value) || 0) + dir * step);
    input.dispatchEvent(new Event('change', { bubbles: true })); // main.ts clamps and saves on change
  };
  document.getElementById('bpm-dec')!.addEventListener('click', () => nudge(-1));
  document.getElementById('bpm-inc')!.addEventListener('click', () => nudge(1));
  sync();
}
