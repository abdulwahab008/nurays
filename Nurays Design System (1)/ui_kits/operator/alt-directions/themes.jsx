// themes.jsx — 4 distinct design directions for Nurays Operator
// Each theme defines: palette, type stack, radius, motifs, chrome behaviors

const THEMES = {
  // ─────────────────────────────────────────────────────────
  // A. NEON BAZAAR — dark, acid lime + hot magenta, mono numerics
  // ─────────────────────────────────────────────────────────
  neon: {
    name: 'Neon Bazaar',
    tagline: 'Dark mode for the 4am kitchen',
    bg: '#0a0a0c',
    surface: '#15151a',
    surfaceAlt: '#1d1d24',
    border: '#2a2a33',
    borderHi: '#3a3a47',
    fg: '#f5f5f7',
    fgMuted: '#8e8e9a',
    fgDim: '#5a5a66',
    accent: '#caff33',          // acid lime
    accentInk: '#0a0a0c',
    accent2: '#ff2e88',         // hot magenta
    accent3: '#00d4ff',         // electric cyan
    success: '#3eff8b',
    warn: '#ffb22e',
    error: '#ff4d4d',
    radius: 2,
    radiusLg: 4,
    fontDisp: '"Space Grotesk", sans-serif',
    fontBody: '"Space Grotesk", sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    statusBarStyle: 'light',
    headerStyle: 'flat-dark',
    motif: 'glow',              // accent glows under cards
  },

  // ─────────────────────────────────────────────────────────
  // B. PAPER MARKET — cream paper, ink, tomato red, serif display
  // ─────────────────────────────────────────────────────────
  paper: {
    name: 'Paper Market',
    tagline: 'Editorial. Like a Sunday market broadsheet.',
    bg: '#f4efe6',
    surface: '#fbf7ee',
    surfaceAlt: '#ede6d6',
    border: '#1a1714',
    borderHi: '#1a1714',
    fg: '#1a1714',
    fgMuted: '#5a544a',
    fgDim: '#8a8478',
    accent: '#c8392f',          // tomato red
    accentInk: '#fbf7ee',
    accent2: '#1a1714',         // ink
    accent3: '#7a8c4a',         // herb green
    success: '#3a6b3e',
    warn: '#b8782a',
    error: '#c8392f',
    radius: 0,
    radiusLg: 0,
    fontDisp: '"Instrument Serif", "Times New Roman", serif',
    fontBody: '"Inter", sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    statusBarStyle: 'dark',
    headerStyle: 'newsprint',
    motif: 'rule',              // hairline rules everywhere, no shadows
  },

  // ─────────────────────────────────────────────────────────
  // C. THERMAL — frost blue → ember gradient, "freeze/heat" semantics
  // ─────────────────────────────────────────────────────────
  thermal: {
    name: 'Thermal',
    tagline: 'Color = temperature. Frost to fire.',
    bg: '#0c1220',
    surface: '#141b2e',
    surfaceAlt: '#1c2440',
    border: '#22305a',
    borderHi: '#3b5491',
    fg: '#e8eef9',
    fgMuted: '#8090b3',
    fgDim: '#4d5a7a',
    accent: '#ff6a3d',          // ember
    accentInk: '#0c1220',
    accent2: '#3da9ff',          // frost
    accent3: '#ffd23d',          // sun
    success: '#36e0a3',
    warn: '#ffb13a',
    error: '#ff5470',
    radius: 2,
    radiusLg: 6,
    fontDisp: '"Space Grotesk", sans-serif',
    fontBody: '"Space Grotesk", sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    statusBarStyle: 'light',
    headerStyle: 'gradient-thermal',
    motif: 'thermal-bar',        // frost-to-ember bars on data
  },

  // ─────────────────────────────────────────────────────────
  // D. BOLT — pure black, chartreuse, concrete grey, industrial
  // ─────────────────────────────────────────────────────────
  bolt: {
    name: 'Bolt',
    tagline: 'A tool, not an app. Anti-cute.',
    bg: '#e8e6e1',
    surface: '#ffffff',
    surfaceAlt: '#dad7d0',
    border: '#000000',
    borderHi: '#000000',
    fg: '#000000',
    fgMuted: '#5a5852',
    fgDim: '#8a8780',
    accent: '#d4ff00',          // chartreuse
    accentInk: '#000000',
    accent2: '#ff3300',          // hazard orange
    accent3: '#0044ff',          // signal blue
    success: '#0a8a3a',
    warn: '#ff8800',
    error: '#ff3300',
    radius: 0,
    radiusLg: 0,
    fontDisp: '"Space Grotesk", sans-serif',
    fontBody: '"Space Grotesk", sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    statusBarStyle: 'dark',
    headerStyle: 'industrial',
    motif: 'hatch',              // hatched/hard borders, hazard tape accents
  },
};

window.THEMES = THEMES;
