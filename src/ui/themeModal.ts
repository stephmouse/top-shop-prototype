import { PLAYER_COLORS } from '../config/balance';
import { createColorPicker } from './colorPicker';
import { getContrastInk } from './hudView';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';
import {
  applyThemePreferences,
  COLOR_BLIND_OPTIONS,
  DEFAULT_THEME_PREFERENCES,
  getActiveThemePreferences,
  getDisplayPlayerColor,
  THEME_PRESETS,
} from './themeConfig';
import type { ColorBlindMode, ThemePreferences } from './themeConfig';

export interface ThemeModalOptions {
  onThemeChange: () => void;
}

export interface ThemeModalController {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

type CustomChannel = 'customBg' | 'customPanel' | 'customAccent';

const CUSTOM_CHANNELS: ReadonlyArray<{ key: CustomChannel; label: string; swatches: readonly string[] }> = [
  {
    key: 'customBg',
    label: 'Background',
    swatches: ['#12161f', '#0b0a18', '#0f1733', '#161b22', '#1c1917', '#e9eff6', '#fbeaf1', '#f5f5f4'],
  },
  {
    key: 'customPanel',
    label: 'Panels',
    swatches: ['#1b2230', '#171430', '#1a2752', '#21262d', '#292524', '#ffffff', '#fdf2f8', '#f8fafc'],
  },
  {
    key: 'customAccent',
    label: 'Accent',
    swatches: ['#4da3ff', '#f2c94c', '#22d3ee', '#db2777', '#2563eb', '#16a34a', '#fb923c', '#a855f7'],
  },
];

/** Creates the live-preview Themes, Custom Colors & Color-Blind Accessibility modal. */
export function createThemeModal(options: ThemeModalOptions): ThemeModalController {
  let visible = false;
  let activeChannel: CustomChannel = 'customBg';
  let picker = createColorPicker({ initialColor: '#12161f', onChange: () => {} });

  const backdrop = Object.assign(mk('div', 'setup-backdrop theme-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal theme-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const close = () => {
    visible = false;
    backdrop.hidden = true;
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const commit = (patch: Partial<ThemePreferences>) => {
    const next = { ...getActiveThemePreferences(), ...patch };
    applyThemePreferences(next, true);
    render();
    options.onThemeChange();
  };

  const buildCustomPicker = (prefs: ThemePreferences) => {
    const spec = CUSTOM_CHANNELS.find((c) => c.key === activeChannel) ?? CUSTOM_CHANNELS[0]!;
    picker = createColorPicker({
      initialColor: prefs[spec.key],
      swatches: spec.swatches,
      label: `Custom ${spec.label} Color`,
      onChange: (hex) => {
        const cur = getActiveThemePreferences();
        const preset = THEME_PRESETS.find((p) => p.id === cur.presetId);
        const base = preset
          ? { customBg: preset.bg, customPanel: preset.panel, customAccent: preset.accent }
          : {};
        applyThemePreferences({ ...cur, ...base, presetId: 'custom', [spec.key]: hex }, true);
        syncCustomTabChips();
        options.onThemeChange();
      },
    });
  };

  let chipEls: Partial<Record<CustomChannel, HTMLElement>> = {};
  const syncCustomTabChips = () => {
    const cur = getActiveThemePreferences();
    const preset = THEME_PRESETS.find((p) => p.id === cur.presetId);
    const valFor = (k: CustomChannel) =>
      preset ? (k === 'customBg' ? preset.bg : k === 'customPanel' ? preset.panel : preset.accent) : cur[k];
    for (const ch of CUSTOM_CHANNELS) {
      const chip = chipEls[ch.key];
      if (chip) chip.style.backgroundColor = valFor(ch.key);
    }
  };

  const render = () => {
    modal.innerHTML = '';
    const prefs = getActiveThemePreferences();
    const activePreset = THEME_PRESETS.find((p) => p.id === prefs.presetId);

    const header = mk('div', 'setup-header');
    header.append(mk('h2', 'setup-title', '🎨 Appearance & Accessibility'), mkBtn('Close (Esc)', close));

    const body = mk('div', 'lobby-body theme-body');

    // 1. Curated Theme Presets
    const presetSec = addLobbySection('Theme Presets');
    const presetGrid = mk('div', 'theme-preset-grid');
    for (const preset of THEME_PRESETS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `theme-preset-card${prefs.presetId === preset.id ? ' is-active' : ''}`;
      const strip = mk('span', 'theme-preset-strip');
      for (const c of [preset.bg, preset.panel, preset.accent]) {
        const dot = mk('span', 'theme-preset-dot');
        dot.style.backgroundColor = c;
        strip.appendChild(dot);
      }
      card.append(strip, mk('strong', '', preset.name), mk('span', 'setup-muted', preset.tagline));
      card.addEventListener('click', () => {
        commit({
          presetId: preset.id,
          customBg: preset.bg,
          customPanel: preset.panel,
          customAccent: preset.accent,
        });
      });
      presetGrid.appendChild(card);
    }
    presetSec.appendChild(presetGrid);

    // 2. Custom Interface Colors
    const customSec = addLobbySection('Custom Interface Colors');
    const chanTabs = mk('div', 'theme-channel-tabs');
    chipEls = {};
    for (const ch of CUSTOM_CHANNELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = activeChannel === ch.key ? 'primary theme-chan-btn' : 'theme-chan-btn';
      const chip = mk('span', 'theme-chan-chip');
      chip.style.backgroundColor = activePreset
        ? ch.key === 'customBg'
          ? activePreset.bg
          : ch.key === 'customPanel'
            ? activePreset.panel
            : activePreset.accent
        : prefs[ch.key];
      chipEls[ch.key] = chip;
      btn.append(chip, mk('span', '', ch.label));
      btn.addEventListener('click', () => {
        activeChannel = ch.key;
        render();
      });
      chanTabs.appendChild(btn);
    }
    buildCustomPicker(prefs);
    customSec.append(
      mk('div', 'setup-muted', 'Text contrast, inset panels, and borders adjust automatically as you pick colors.'),
      chanTabs,
      picker.el
    );

    // 3. Color-Blind & Visual Accessibility
    const cbSec = addLobbySection('Color-Blind Mode & Board Clarity');
    const cbGrid = mk('div', 'theme-cb-grid');
    for (const opt of COLOR_BLIND_OPTIONS) {
      const btn = mkBtn(
        opt.label,
        () => {
          const patch: Partial<ThemePreferences> = { colorBlindMode: opt.id as ColorBlindMode };
          if (opt.id !== 'off') patch.showOwnerBadges = true;
          commit(patch);
        },
        prefs.colorBlindMode === opt.id ? 'primary' : ''
      );
      cbGrid.appendChild(btn);
    }
    const activeCb = COLOR_BLIND_OPTIONS.find((o) => o.id === prefs.colorBlindMode) ?? COLOR_BLIND_OPTIONS[0]!;
    const cbDesc = mk('div', 'setup-muted', activeCb.desc);

    const previewStrip = mk('div', 'theme-seat-preview');
    PLAYER_COLORS.forEach((raw, idx) => {
      const color = getDisplayPlayerColor(idx, raw);
      const pill = mk('div', 'theme-seat-pill');
      const awn = mk('div', 'theme-seat-awning tile-awning');
      awn.style.setProperty('--owner-color', color);
      awn.dataset.seatPattern = String(idx % 8);
      const tag = mk('span', 'theme-seat-label', `P${idx + 1}`);
      tag.style.backgroundColor = color;
      tag.style.color = getContrastInk(color);
      pill.append(awn, tag);
      previewStrip.appendChild(pill);
    });

    const toggleList = mk('div', 'theme-toggle-list');
    const makeToggle = (label: string, checked: boolean, onToggle: (val: boolean) => void) => {
      const lbl = document.createElement('label');
      lbl.className = 'setup-checkbox-field';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.addEventListener('change', () => onToggle(cb.checked));
      lbl.append(cb, document.createTextNode(` ${label}`));
      return lbl;
    };
    toggleList.append(
      makeToggle('Show Owner Tags (P1–P8) & Awning Patterns on Stores', prefs.showOwnerBadges, (v) =>
        commit({ showOwnerBadges: v })
      ),
      makeToggle('Color-Code $ Cash & Asset Amounts Across UI & Logs', prefs.colorCodeCash, (v) =>
        commit({ colorCodeCash: v })
      )
    );

    cbSec.append(cbGrid, cbDesc, previewStrip, toggleList);
    body.append(presetSec, customSec, cbSec);

    const footer = mk('div', 'setup-footer');
    footer.append(
      mkBtn('Reset Defaults', () => commit({ ...DEFAULT_THEME_PREFERENCES })),
      mkBtn('Done', close, 'primary')
    );

    modal.append(header, body, footer);
  };

  return {
    el: backdrop,
    open: () => {
      visible = true;
      render();
      backdrop.hidden = false;
    },
    close,
    isOpen: () => visible,
    refresh: () => {
      if (visible) render();
    },
  };
}
