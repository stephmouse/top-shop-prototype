import { sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { sanitizeSignatureStore } from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { GameState } from '../engine/types';
import { HEX_COLOR_RE } from '../net/protocol';
import { createAvatarElement } from './avatarSvg';
import { createColorPickerButton, PLAYER_COLOR_SWATCHES } from './colorPickerButton';

export const GUEST_PROFILE_STORAGE_KEY = 'top_shop_guest_profile_v1';

export interface UserProfile {
  name: string;
  color: string;
  avatar: AvatarSpec;
  signatureStore?: SignatureStoreSpec;
}

export interface ProfileEditorOptions {
  profile: UserProfile;
  onChange: (next: UserProfile) => void;
  onCommit?: (next: UserProfile) => void;
  onEditAvatar?: (current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
  onEditSignatureStore?: (
    current: SignatureStoreSpec | undefined,
    color: string,
    onSave: (next: SignatureStoreSpec | undefined) => void
  ) => void;
  avatarTitle?: string;
  saveLabel?: string;
  placeholder?: string;
}

function getLocalStore(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadUserProfile(fallback: {
  name: string;
  color: string;
  avatar?: AvatarSpec;
  signatureStore?: SignatureStoreSpec;
}): UserProfile {
  const fbSig = sanitizeSignatureStore(fallback.signatureStore);
  const def: UserProfile = {
    name: fallback.name.trim().slice(0, 18) || 'Guest',
    color: HEX_COLOR_RE.test(fallback.color) ? fallback.color : '#3498db',
    avatar: sanitizeAvatarSpec(fallback.avatar, 1),
    ...(fbSig ? { signatureStore: fbSig } : {}),
  };
  const store = getLocalStore();
  if (!store) return def;
  try {
    const rawText = store.getItem(GUEST_PROFILE_STORAGE_KEY);
    if (!rawText) return def;
    const raw: unknown = JSON.parse(rawText);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return def;
    const r = raw as Record<string, unknown>;
    const sig = sanitizeSignatureStore(r.signatureStore) ?? def.signatureStore;
    return {
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 18) : def.name,
      color: typeof r.color === 'string' && HEX_COLOR_RE.test(r.color) ? r.color : def.color,
      avatar: sanitizeAvatarSpec(r.avatar, 1),
      ...(sig ? { signatureStore: sig } : {}),
    };
  } catch {
    return def;
  }
}

export function saveUserProfile(prof: UserProfile): void {
  const store = getLocalStore();
  if (!store) return;
  try {
    store.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(prof));
  } catch {
    /* Ignore quota errors */
  }
}

export function isMatchInProgress(state: GameState): boolean {
  return state.phase !== 'GAME_OVER' && (state.turnNumber > 1 || state.phase !== 'ROLL_PENCIL');
}

export function createProfileEditorRow(opts: ProfileEditorOptions): HTMLElement {
  const cleanSig = sanitizeSignatureStore(opts.profile.signatureStore);
  let current: UserProfile = {
    name: opts.profile.name,
    color: HEX_COLOR_RE.test(opts.profile.color) ? opts.profile.color : '#3498db',
    avatar: sanitizeAvatarSpec(opts.profile.avatar, 0),
    ...(cleanSig ? { signatureStore: cleanSig } : {}),
  };

  const row = Object.assign(document.createElement('div'), { className: 'setup-player-row' });
  const avatarBtn = Object.assign(document.createElement('button'), {
    type: 'button' as const,
    className: 'setup-avatar-btn',
    title: opts.avatarTitle ?? 'Customize Standee',
  });
  const paintAvatar = () => {
    avatarBtn.style.borderColor = current.color;
    avatarBtn.innerHTML = '';
    avatarBtn.appendChild(createAvatarElement(current.avatar, current.color));
  };
  paintAvatar();

  const openCustomize = () =>
    opts.onEditAvatar?.(current.avatar, current.color, (nextAv) => {
      current = { ...current, avatar: nextAv };
      paintAvatar();
      opts.onChange(current);
      opts.onCommit?.(current);
    });
  avatarBtn.addEventListener('click', openCustomize);

  const nameInput = Object.assign(document.createElement('input'), {
    className: 'setup-input',
    type: 'text',
    value: current.name,
    maxLength: 18,
    placeholder: opts.placeholder ?? 'Your Name',
  });
  nameInput.addEventListener('input', () => {
    current = { ...current, name: nameInput.value.trim() || 'Guest' };
    opts.onChange(current);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && opts.onCommit) {
      e.preventDefault();
      opts.onCommit(current);
    }
  });

  const colorBtn = createColorPickerButton({
    initialColor: current.color,
    swatches: PLAYER_COLOR_SWATCHES,
    label: 'Player Color',
    title: 'Pick player color',
    onChange: (hex) => {
      current = { ...current, color: hex };
      avatarBtn.style.borderColor = hex;
      opts.onChange(current);
    },
    onCommit: (hex) => {
      current = { ...current, color: hex };
      paintAvatar();
      opts.onChange(current);
      opts.onCommit?.(current);
    },
  });

  const customBtn = Object.assign(document.createElement('button'), {
    type: 'button' as const,
    textContent: 'Customize',
  });
  customBtn.addEventListener('click', openCustomize);

  row.append(avatarBtn, nameInput, colorBtn.el, customBtn);
  if (opts.onEditSignatureStore) {
    const storeBtn = document.createElement('button');
    storeBtn.type = 'button';
    const syncStoreBtn = () => {
      storeBtn.textContent = current.signatureStore ? `★ ${current.signatureStore.name}` : '★ My Store';
      storeBtn.className = current.signatureStore ? 'signature-edit-btn is-configured' : 'signature-edit-btn';
      storeBtn.title = 'Customize your 1-per-player Signature Store';
    };
    syncStoreBtn();
    storeBtn.addEventListener('click', () =>
      opts.onEditSignatureStore!(current.signatureStore, current.color, (nextSig) => {
        const { signatureStore: _old, ...rest } = current;
        current = nextSig ? { ...rest, signatureStore: nextSig } : rest;
        syncStoreBtn();
        opts.onChange(current);
        opts.onCommit?.(current);
      })
    );
    row.appendChild(storeBtn);
  }
  if (opts.saveLabel && opts.onCommit) {
    const saveBtn = Object.assign(document.createElement('button'), {
      type: 'button' as const,
      className: 'primary',
      textContent: opts.saveLabel,
    });
    saveBtn.addEventListener('click', () => opts.onCommit?.(current));
    row.appendChild(saveBtn);
  }
  return row;
}
