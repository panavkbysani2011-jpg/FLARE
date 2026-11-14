import { EnvironmentPreset } from '../types/psi';

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'orbital',
    label: '0g Orbital',
    shortGravity: '0.00g',
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.14,
    g_eff: 0.0,
    Thickness_mm: 1.5,
    description:
      'Standard orbital station cabin (21% O2, 14.7 psi, forced ventilation 0.14 m/s)',
  },
  {
    id: 'lunar',
    label: '0.166g Lunar',
    shortGravity: '0.166g',
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
    description:
      'Exploration atmosphere (34% O2, 8.2 psi reduced cabin pressure, 0.166g lunar gravity)',
  },
  {
    id: 'martian',
    label: '0.38g Martian',
    shortGravity: '0.38g',
    O2_pct: 26.5,
    P_psi: 10.2,
    Flow_ms: 0.18,
    g_eff: 0.38,
    Thickness_mm: 2.5,
    description:
      'Martian surface habitat nominal cabin (26.5% O2, 10.2 psi, 0.38g partial gravity)',
  },
  {
    id: 'terrestrial',
    label: '1.0g Terrestrial',
    shortGravity: '1.00g',
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.25,
    g_eff: 1.0,
    Thickness_mm: 3.0,
    description:
      '1g sea-level laboratory baseline with natural buoyant convection',
  },
];
