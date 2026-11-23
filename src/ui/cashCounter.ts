export function formatDollars(amount: number): string {
  const abs = Math.abs(Math.round(amount)).toLocaleString('en-US');
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

export interface RollingStatHandle {
  el: HTMLElement;
  valEl: HTMLElement;
  baseClass: string;
  computeClass?: (value: number) => string;
  current: number;
  target: number;
  rafId: number | null;
  pulseTimer: number | null;
  pulseClass: '' | 'is-tick-up' | 'is-tick-down';
}

function syncStatView(handle: RollingStatHandle, value: number): void {
  handle.valEl.textContent = formatDollars(value);
  const base = handle.computeClass ? handle.computeClass(value) : handle.baseClass;
  handle.el.className = handle.pulseClass ? `${base} ${handle.pulseClass}` : base;
}

export function createRollingStat(
  el: HTMLElement,
  valEl: HTMLElement,
  initialValue: number,
  baseClass: string,
  computeClass?: (value: number) => string
): RollingStatHandle {
  const handle: RollingStatHandle = {
    el,
    valEl,
    baseClass,
    computeClass,
    current: initialValue,
    target: initialValue,
    rafId: null,
    pulseTimer: null,
    pulseClass: '',
  };
  syncStatView(handle, initialValue);
  return handle;
}

export function makeRollingStatBox(
  label: string,
  initialValue: number,
  baseClass: string,
  computeClass?: (v: number) => string
): { box: HTMLElement; handle: RollingStatHandle } {
  const box = document.createElement('div');
  const lbl = document.createElement('span');
  lbl.className = 'player-stat-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'player-stat-value';
  box.append(lbl, val);
  const handle = createRollingStat(box, val, initialValue, baseClass, computeClass);
  return { box, handle };
}

export function cancelRollingStat(handle: RollingStatHandle): void {
  if (handle.rafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle.rafId);
  }
  handle.rafId = null;
  if (handle.pulseTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(handle.pulseTimer);
  }
  handle.pulseTimer = null;
  handle.pulseClass = '';
}

export function setRollingStatTarget(
  handle: RollingStatHandle,
  nextValue: number,
  opts?: { immediate?: boolean; durationMs?: number }
): void {
  const canAnimate =
    !opts?.immediate &&
    typeof window !== 'undefined' &&
    typeof requestAnimationFrame === 'function' &&
    typeof performance !== 'undefined';

  if (!canAnimate) {
    cancelRollingStat(handle);
    handle.current = nextValue;
    handle.target = nextValue;
    syncStatView(handle, nextValue);
    return;
  }

  if (handle.target === nextValue) return;

  cancelRollingStat(handle);
  const startVal = handle.current;
  handle.target = nextValue;

  if (Math.round(startVal) === Math.round(nextValue)) {
    handle.current = nextValue;
    syncStatView(handle, nextValue);
    return;
  }

  handle.pulseClass = nextValue > startVal ? 'is-tick-up' : 'is-tick-down';
  const delta = Math.abs(nextValue - startVal);
  const duration = opts?.durationMs ?? Math.min(640, Math.max(280, 260 + delta * 0.2));
  const startTime = performance.now();

  const tick = (now: number) => {
    const rawT = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - rawT, 3);
    handle.current = rawT >= 1 ? nextValue : Math.round(startVal + (nextValue - startVal) * eased);
    syncStatView(handle, handle.current);
    if (rawT < 1) {
      handle.rafId = requestAnimationFrame(tick);
    } else {
      handle.rafId = null;
      handle.pulseTimer = window.setTimeout(() => {
        handle.pulseTimer = null;
        handle.pulseClass = '';
        syncStatView(handle, handle.current);
      }, 220);
    }
  };

  syncStatView(handle, startVal);
  handle.rafId = requestAnimationFrame(tick);
}
