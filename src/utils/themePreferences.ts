import {
  AppSettings,
  FontFamilyId,
  MeasurementUnits,
  ThemeMode,
  ThemePresetId,
  ThemeSetting,
} from '../types/psi';

export interface ThemePaletteTokens {
  bg: string;
  fg: string;
  surface: string;
  border: string;
  accent: string;
  accentFg: string;
}

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  description: string;
  swatchHex: string;
  light: ThemePaletteTokens;
  dark: ThemePaletteTokens;
}

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'monochrome-default',
    name: 'Monochrome Default',
    description: 'Clean neutral zinc & graphite scientific palette',
    swatchHex: '#18181B',
    light: {
      bg: '#F3F4F6',
      fg: '#18181B',
      surface: '#FFFFFF',
      border: '#E4E4E7',
      accent: '#18181B',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#09090B',
      fg: '#FAFAFA',
      surface: '#121215',
      border: '#27272A',
      accent: '#FAFAFA',
      accentFg: '#09090B',
    },
  },
  {
    id: 'obsidian-amber',
    name: 'Obsidian Amber',
    description: 'Warm combustion gold paired with deep charcoal',
    swatchHex: '#D97706',
    light: {
      bg: '#FAF8F5',
      fg: '#1C1917',
      surface: '#FFFFFF',
      border: '#E7E5E4',
      accent: '#B45309',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#0C0A09',
      fg: '#FAFAF9',
      surface: '#171412',
      border: '#292524',
      accent: '#F59E0B',
      accentFg: '#0C0A09',
    },
  },
  {
    id: 'deep-ocean-teal',
    name: 'Deep Ocean Teal',
    description: 'Crisp marine teal accents for calm telemetry review',
    swatchHex: '#0D9488',
    light: {
      bg: '#F2F7F6',
      fg: '#0F172A',
      surface: '#FFFFFF',
      border: '#DCE7E5',
      accent: '#0F766E',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#071113',
      fg: '#F0FDFA',
      surface: '#0D1C1F',
      border: '#1E3438',
      accent: '#14B8A6',
      accentFg: '#042F2E',
    },
  },
  {
    id: 'slate-cobalt',
    name: 'Slate Cobalt',
    description: 'Cool titanium slate paired with deep cobalt',
    swatchHex: '#1D4ED8',
    light: {
      bg: '#F4F6FA',
      fg: '#0F172A',
      surface: '#FFFFFF',
      border: '#DCE3EE',
      accent: '#1E40AF',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#090D16',
      fg: '#F8FAFC',
      surface: '#111827',
      border: '#1E293B',
      accent: '#60A5FA',
      accentFg: '#090D16',
    },
  },
  {
    id: 'forest-emerald',
    name: 'Forest Emerald',
    description: 'Clean botanical green highlighting safe quench margins',
    swatchHex: '#059669',
    light: {
      bg: '#F3F7F4',
      fg: '#14221B',
      surface: '#FFFFFF',
      border: '#DCE6DF',
      accent: '#047857',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#07110C',
      fg: '#ECFDF5',
      surface: '#0E1C15',
      border: '#1C3327',
      accent: '#10B981',
      accentFg: '#052E16',
    },
  },
  {
    id: 'warm-paper-sand',
    name: 'Warm Paper Sand',
    description: 'Low-glare warm parchment ideal for extended reading',
    swatchHex: '#A16207',
    light: {
      bg: '#F7F3EA',
      fg: '#292524',
      surface: '#FDFBF7',
      border: '#E6DEC8',
      accent: '#854D0E',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#14110D',
      fg: '#F5EFE6',
      surface: '#1F1A14',
      border: '#352D22',
      accent: '#EAB308',
      accentFg: '#14110D',
    },
  },
  {
    id: 'arctic-ice-blue',
    name: 'Arctic Ice',
    description: 'Daylight studio canvas with crisp cyan-slate highlights',
    swatchHex: '#0284C7',
    light: {
      bg: '#F1F6FA',
      fg: '#0C1A24',
      surface: '#FFFFFF',
      border: '#DAE7F0',
      accent: '#0369A1',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#081018',
      fg: '#F0F9FF',
      surface: '#0F1A24',
      border: '#1E3142',
      accent: '#38BDF8',
      accentFg: '#081018',
    },
  },
  {
    id: 'solarized-dusk',
    name: 'Solarized Dusk',
    description: 'Balanced classic eye-care palette tuned for clarity',
    swatchHex: '#2AA198',
    light: {
      bg: '#FDF6E3',
      fg: '#073642',
      surface: '#FFFBF0',
      border: '#EEE8D5',
      accent: '#2AA198',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#002B36',
      fg: '#FDF6E3',
      surface: '#073642',
      border: '#124653',
      accent: '#2AA198',
      accentFg: '#002B36',
    },
  },
  {
    id: 'crimson-lab',
    name: 'Crimson Instrumentation',
    description: 'High-alert flight test rose accent on clean stone',
    swatchHex: '#DC2626',
    light: {
      bg: '#F7F4F4',
      fg: '#1C1414',
      surface: '#FFFFFF',
      border: '#E9DFDF',
      accent: '#B91C1C',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#120A0A',
      fg: '#FEF2F2',
      surface: '#1C1111',
      border: '#331E1E',
      accent: '#EF4444',
      accentFg: '#120A0A',
    },
  },
  {
    id: 'high-contrast-carbon',
    name: 'High-Contrast Carbon',
    description: 'Pure crisp black and paper white contrast framing',
    swatchHex: '#000000',
    light: {
      bg: '#FFFFFF',
      fg: '#000000',
      surface: '#FAFAFA',
      border: '#D4D4D8',
      accent: '#000000',
      accentFg: '#FFFFFF',
    },
    dark: {
      bg: '#000000',
      fg: '#FFFFFF',
      surface: '#0A0A0A',
      border: '#3F3F46',
      accent: '#FFFFFF',
      accentFg: '#000000',
    },
  },
];

export interface FontFamilyOption {
  id: FontFamilyId;
  label: string;
  subtitle: string;
  sansStack: string;
  displayStack: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    subtitle: 'Default clean scientific UI sans',
    sansStack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    displayStack:
      "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    subtitle: 'Geometric aerospace technical grotesk',
    sansStack:
      "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    displayStack:
      "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    subtitle: 'Engineered lab notebook readability',
    sansStack:
      "'IBM Plex Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    displayStack:
      "'IBM Plex Sans', 'Space Grotesk', -apple-system, sans-serif",
  },
  {
    id: 'opendyslexic-atkinson',
    label: 'OpenDyslexic / Atkinson Hyperlegible',
    subtitle: 'Weighted-bottom & hyperlegible accessibility type',
    sansStack:
      "'OpenDyslexicRegular', 'OpenDyslexic', 'Atkinson Hyperlegible', 'Inter', sans-serif",
    displayStack:
      "'Atkinson Hyperlegible', 'OpenDyslexicRegular', 'OpenDyslexic', 'Space Grotesk', sans-serif",
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    subtitle: 'Uniform tabular monospace across UI',
    sansStack:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    displayStack:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  units: 'spacecraft',
  defaultWorkspace: 'overview',
  defaultExportFormat: 'pdf',
  themeSetting: 'normal',
  contrast: 'default',
  fontFamily: 'inter',
  fontSizePx: 14,
  presetId: 'monochrome-default',
  customColors: {},
};

export function getPresetDefinition(presetId: ThemePresetId): ThemePresetDefinition {
  return (
    THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0]
  );
}

export function resolveThemePolarity(themeSetting: ThemeSetting): ThemeMode {
  if (themeSetting === 'system') {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }
  return themeSetting;
}

export function getResolvedPaletteTokens(
  settings: AppSettings,
  resolvedTheme: ThemeMode
): ThemePaletteTokens {
  const preset = getPresetDefinition(settings.presetId);
  const base = resolvedTheme === 'dark' ? preset.dark : preset.light;
  const effectiveBg =
    settings.presetId === 'monochrome-default' && resolvedTheme === 'light'
      ? '#FFFFFF'
      : base.bg;
  return {
    bg: settings.customColors.background || effectiveBg,
    fg: settings.customColors.foreground || base.fg,
    surface: base.surface,
    border: base.border,
    accent: settings.customColors.accent || base.accent,
    accentFg: base.accentFg,
  };
}

export function applyAppearanceSettings(
  settings: AppSettings,
  resolvedTheme: ThemeMode
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const fontMeta =
    FONT_FAMILY_OPTIONS.find((f) => f.id === settings.fontFamily) ??
    FONT_FAMILY_OPTIONS[0];
  root.style.setProperty('--font-sans', fontMeta.sansStack);
  root.style.setProperty('--font-display', fontMeta.displayStack);
  root.style.fontSize = `${settings.fontSizePx}px`;

  if (settings.contrast === 'strong') {
    root.setAttribute('data-contrast', 'strong');
  } else {
    root.removeAttribute('data-contrast');
  }

  const hasCustomOverride =
    settings.presetId !== 'monochrome-default' ||
    Boolean(settings.customColors.background) ||
    Boolean(settings.customColors.foreground) ||
    Boolean(settings.customColors.accent);

  const tokens = getResolvedPaletteTokens(settings, resolvedTheme);
  root.style.setProperty('--psi-bg', tokens.bg);
  root.style.setProperty('--psi-fg', tokens.fg);
  root.style.setProperty('--psi-surface', tokens.surface);
  root.style.setProperty('--psi-border', tokens.border);
  root.style.setProperty('--psi-accent', tokens.accent);
  root.style.setProperty('--psi-accent-fg', tokens.accentFg);

  if (hasCustomOverride) {
    root.setAttribute('data-theme-customized', 'true');
  } else {
    root.removeAttribute('data-theme-customized');
  }
}

export function normalizeHexColor(value: string): string | null {
  const cleaned = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return null;
}

/* ---------- Measurement Unit Conversion & Formatting Utilities ---------- */

export function convertPressureFromPsi(
  psi: number,
  units: MeasurementUnits
): number {
  return units === 'metric-si' ? psi * 6.89476 : psi;
}

export function formatPressureUnit(units: MeasurementUnits): string {
  return units === 'metric-si' ? 'kPa' : 'psi';
}

export function formatPressure(
  psi: number,
  units: MeasurementUnits
): string {
  if (units === 'metric-si') {
    return `${(psi * 6.89476).toFixed(1)} kPa`;
  }
  return `${psi.toFixed(1)} psi`;
}

export function formatTemperatureUnit(units: MeasurementUnits): string {
  return units === 'metric-si' ? '°C' : 'K';
}

export function formatTemperature(
  tempK: number,
  units: MeasurementUnits
): string {
  if (units === 'metric-si') {
    return `${Math.round(tempK - 273.15)} °C`;
  }
  return `${Math.round(tempK)} K`;
}

export function formatSpreadUnit(units: MeasurementUnits): string {
  return units === 'metric-si' ? 'cm/s' : 'mm/s';
}

export function formatFlameSpreadValue(
  mms: number,
  units: MeasurementUnits
): string {
  return units === 'metric-si' ? (mms / 10).toFixed(3) : mms.toFixed(2);
}

export function formatFlameSpread(
  mms: number,
  units: MeasurementUnits
): string {
  return `${formatFlameSpreadValue(mms, units)} ${formatSpreadUnit(units)}`;
}

export function formatAirflowUnit(units: MeasurementUnits): string {
  return units === 'metric-si' ? 'cm/s' : 'm/s';
}

export function formatAirflowValue(
  ms: number,
  units: MeasurementUnits
): string {
  return units === 'metric-si' ? (ms * 100).toFixed(1) : ms.toFixed(2);
}

export function formatAirflow(
  ms: number,
  units: MeasurementUnits
): string {
  return `${formatAirflowValue(ms, units)} ${formatAirflowUnit(units)}`;
}

export function formatPressureRiseKpa(
  deltaKpa: number,
  units: MeasurementUnits
): string {
  if (units === 'metric-si') {
    return `+${deltaKpa.toFixed(2)} kPa`;
  }
  return `+${(deltaKpa / 6.89476).toFixed(2)} psi`;
}
