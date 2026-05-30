// chrome.jsx — Themed primitives. All screens compose from these.
// Reads `theme` from a TS context. Each direction renders the same components
// but with wildly different visual language driven by motif/headerStyle/etc.

const ThemeCtx = React.createContext(null);
const useT = () => React.useContext(ThemeCtx);

function ThemeProvider({ theme, children }) {
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

// Inline icons (24px, stroke 1.5)
const ICN = {
  home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12 12 4l9 8M5 10v10h4v-6h6v6h4V10" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cube: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 7.5 12 3 3 7.5 12 12l9-4.5ZM3 7.5v9L12 21M21 7.5v9L12 21M12 12v9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bag: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h18l-1.5 13H4.5L3 7Zm5 0V5a4 4 0 0 1 8 0v2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round"/></svg>,
  chart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" strokeLinecap="round"/></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" strokeLinejoin="round"/></svg>,
  chev: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  back: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  more: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
  up: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  dn: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  warn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M3 19l9-15 9 15H3Z" strokeLinejoin="round" strokeLinecap="round"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m4 12 6 6L20 6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cog: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" strokeLinejoin="round" strokeLinecap="round"/></svg>,
  flame: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4 5 6 5 11a5 5 0 1 1-10 0c0-3 2-3 2-7 2 1 3 0 3-4Z"/></svg>,
  snow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" strokeLinecap="round"/></svg>,
};

// ──────────────────────────────────────────────────────────
// Surface — themed card / panel with motif-driven decoration
// ──────────────────────────────────────────────────────────
function Surface({ children, padded = true, accent, style = {}, hatched }) {
  const t = useT();
  const motif = t.motif;
  const padding = padded ? (motif === 'rule' ? '14px 16px' : 14) : 0;

  let s = {
    background: t.surface,
    color: t.fg,
    padding,
    borderRadius: t.radius,
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  if (motif === 'glow') {
    s.border = `1px solid ${t.border}`;
    if (accent) {
      s.boxShadow = `0 0 0 1px ${t.accent}33, 0 8px 24px -6px ${t.accent}55`;
      s.borderColor = `${t.accent}55`;
    }
  } else if (motif === 'rule') {
    s.border = `1px solid ${t.border}`;
    s.borderRadius = 0;
  } else if (motif === 'thermal-bar') {
    s.border = `1px solid ${t.border}`;
  } else if (motif === 'hatch') {
    s.border = `1.5px solid ${t.border}`;
    s.borderRadius = 0;
  }

  return <div style={s}>{children}{accent && motif === 'thermal-bar' && (
    <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${t.accent2}, ${t.accent})` }} />
  )}{hatched && motif === 'hatch' && <HazardStripe />}</div>;
}

function HazardStripe({ side = 'top' }) {
  const t = useT();
  const stripe = `repeating-linear-gradient(135deg, ${t.accent} 0 8px, ${t.fg} 8px 16px)`;
  return <span style={{ position: 'absolute', [side]: 0, left: 0, right: 0, height: 8, background: stripe }} />;
}

// ──────────────────────────────────────────────────────────
// Header — full-width app header, themed
// ──────────────────────────────────────────────────────────
function Header({ title, subtitle, leading, trailing, big }) {
  const t = useT();
  const style = t.headerStyle;

  if (style === 'newsprint') {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: t.surface,
        borderBottom: `2px solid ${t.fg}`,
        padding: '14px 16px 12px',
        fontFamily: t.fontBody,
        color: t.fg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {leading}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.fgMuted, fontWeight: 600 }}>NURAYS · OPERATOR</div>
            <div style={{ fontSize: big ? 32 : 24, fontFamily: t.fontDisp, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 2 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 6, fontStyle: 'italic' }}>{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>{trailing}</div>
        </div>
      </div>
    );
  }

  if (style === 'gradient-thermal') {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: `linear-gradient(180deg, ${t.surfaceAlt} 0%, ${t.bg} 100%)`,
        borderBottom: `1px solid ${t.border}`,
        padding: '14px 16px 14px',
        color: t.fg, fontFamily: t.fontBody,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {leading}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2, fontFamily: t.fontMono }}>{subtitle}</div>}
          </div>
          {trailing}
        </div>
      </div>
    );
  }

  if (style === 'industrial') {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: t.fg, color: t.surface,
        padding: '12px 16px', fontFamily: t.fontBody,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {leading}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', color: t.accent, fontWeight: 700, fontFamily: t.fontMono }}>NURAYS // OPERATOR</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, marginTop: 2, textTransform: 'uppercase' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, fontFamily: t.fontMono, letterSpacing: '0.04em' }}>{subtitle}</div>}
          </div>
          {trailing}
        </div>
      </div>
    );
  }

  // flat-dark (Neon)
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      background: t.bg, borderBottom: `1px solid ${t.border}`,
      padding: '14px 16px', color: t.fg, fontFamily: t.fontBody,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: t.accent, marginTop: 3, fontFamily: t.fontMono, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{subtitle}</div>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// IconBtn (themed)
// ──────────────────────────────────────────────────────────
function IconBtn({ children, dot, alt }) {
  const t = useT();
  const m = t.motif;
  let s = {
    width: 36, height: 36, position: 'relative', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: 'none',
    color: alt ? t.surface : t.fg,
    background: alt ? 'transparent' : (m === 'rule' ? 'transparent' : t.surface),
    borderRadius: t.radius,
  };
  if (m === 'rule') s.border = `1px solid ${t.border}`;
  if (m === 'glow') s.border = `1px solid ${t.border}`;
  if (m === 'thermal-bar') s.border = `1px solid ${t.border}`;
  if (m === 'hatch') s.border = `1.5px solid ${alt ? t.surface : t.fg}`;

  return (
    <button style={s}>
      {children}
      {dot && <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: t.accent2 || t.accent, borderRadius: 9999 }} />}
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Tab bar
// ──────────────────────────────────────────────────────────
function TabBar({ active = 'home' }) {
  const t = useT();
  const tabs = [
    { id: 'home', label: 'Home', icon: ICN.home },
    { id: 'orders', label: 'Orders', icon: ICN.list },
    { id: 'inventory', label: 'Stock', icon: ICN.cube },
    { id: 'reports', label: 'Reports', icon: ICN.chart },
    { id: 'more', label: 'More', icon: ICN.cog },
  ];

  const m = t.motif;
  let bg = t.surface;
  let border = `1px solid ${t.border}`;
  if (m === 'rule') { bg = t.surface; border = `2px solid ${t.fg}`; }
  if (m === 'hatch') { bg = t.fg; }

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingBottom: 30, paddingTop: 8, paddingInline: 4,
      background: bg, borderTop: border,
      display: 'flex', justifyContent: 'space-around',
      fontFamily: t.fontBody,
    }}>
      {tabs.map(tb => {
        const a = tb.id === active;
        const fg = m === 'hatch' ? (a ? t.accent : '#888') : (a ? t.accent : t.fgMuted);
        return (
          <div key={tb.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: fg, padding: '4px 2px', position: 'relative',
          }}>
            {a && m === 'glow' && <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 24, height: 2, background: t.accent, boxShadow: `0 0 8px ${t.accent}` }} />}
            {a && m === 'rule' && <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, background: t.accent, borderRadius: 9999 }} />}
            {a && m === 'hatch' && <span style={{ position: 'absolute', top: -8, left: 12, right: 12, height: 3, background: t.accent }} />}
            {a && m === 'thermal-bar' && <span style={{ position: 'absolute', top: -8, left: '30%', right: '30%', height: 2, background: `linear-gradient(90deg, ${t.accent2}, ${t.accent})` }} />}
            {tb.icon}
            <span style={{ fontSize: 9, fontWeight: a ? 700 : 500, letterSpacing: m === 'hatch' ? '0.08em' : 'normal', textTransform: m === 'hatch' ? 'uppercase' : 'none' }}>{tb.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Eyebrow / Section title
// ──────────────────────────────────────────────────────────
function Eyebrow({ children, action }) {
  const t = useT();
  const m = t.motif;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 16px', marginBottom: 8, fontFamily: t.fontBody }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: m === 'rule' ? '0.18em' : '0.12em',
        textTransform: 'uppercase', color: m === 'rule' ? t.fg : t.fgMuted,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {m === 'rule' && <span style={{ width: 16, height: 1, background: t.fg }} />}
        {children}
        {m === 'rule' && <span style={{ flex: 1 }} />}
      </div>
      {action && <span style={{ fontSize: 11, color: t.accent, fontWeight: 600, fontFamily: t.fontBody, textDecoration: m === 'rule' ? 'underline' : 'none' }}>{action}</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Badge
// ──────────────────────────────────────────────────────────
function Pill({ children, tone = 'default', size = 'md' }) {
  const t = useT();
  const m = t.motif;
  const tones = {
    default: { bg: t.surfaceAlt, fg: t.fg },
    accent:  { bg: t.accent, fg: t.accentInk },
    accent2: { bg: t.accent2, fg: m === 'paper' ? t.surface : '#fff' },
    accent3: { bg: t.accent3, fg: m === 'rule' ? t.surface : t.bg },
    success: { bg: m === 'glow' ? `${t.success}22` : (m === 'rule' ? 'transparent' : `${t.success}22`), fg: t.success },
    warn:    { bg: m === 'rule' ? 'transparent' : `${t.warn}22`, fg: t.warn },
    error:   { bg: m === 'rule' ? 'transparent' : `${t.error}22`, fg: t.error },
    outline: { bg: 'transparent', fg: t.fg },
  };
  const c = tones[tone] || tones.default;
  const py = size === 'sm' ? 1 : 3;
  const px = size === 'sm' ? 6 : 8;
  const fs = size === 'sm' ? 9 : 10;
  let s = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: c.bg, color: c.fg,
    padding: `${py}px ${px}px`,
    fontSize: fs, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap',
    fontFamily: m === 'rule' ? t.fontBody : t.fontMono,
    letterSpacing: m === 'rule' ? '0.08em' : '0.04em',
    textTransform: 'uppercase',
    borderRadius: m === 'glow' ? 2 : (m === 'thermal-bar' ? 2 : 0),
  };
  if (m === 'rule' || tone === 'outline') s.border = `1px solid ${c.fg}`;
  if (m === 'hatch' && tone !== 'accent' && tone !== 'accent2') s.border = `1.5px solid ${t.fg}`;
  return <span style={s}>{children}</span>;
}

// ──────────────────────────────────────────────────────────
// Themed Button
// ──────────────────────────────────────────────────────────
function Button({ children, kind = 'primary', size = 'md', full, style = {} }) {
  const t = useT();
  const m = t.motif;
  const h = size === 'lg' ? 50 : size === 'sm' ? 32 : 42;
  const fs = size === 'lg' ? 15 : size === 'sm' ? 12 : 14;
  const px = size === 'lg' ? 18 : size === 'sm' ? 10 : 14;

  let s = {
    minHeight: h, padding: `0 ${px}px`,
    fontSize: fs, fontWeight: 700, fontFamily: t.fontBody,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, width: full ? '100%' : 'auto',
    borderRadius: t.radius, border: 'none',
    letterSpacing: m === 'hatch' ? '0.06em' : 'normal',
    textTransform: m === 'hatch' ? 'uppercase' : 'none',
    ...style,
  };

  if (kind === 'primary') {
    s.background = t.accent;
    s.color = t.accentInk;
    if (m === 'glow') s.boxShadow = `0 0 24px ${t.accent}66`;
    if (m === 'rule') { s.background = t.fg; s.color = t.surface; }
  } else if (kind === 'secondary') {
    s.background = 'transparent';
    s.color = t.fg;
    s.border = `1px solid ${t.fg}`;
    if (m === 'hatch') s.border = `1.5px solid ${t.fg}`;
  } else if (kind === 'ghost') {
    s.background = 'transparent';
    s.color = t.fgMuted;
  } else if (kind === 'danger') {
    s.background = t.error; s.color = '#fff';
  }
  return <button style={s}>{children}</button>;
}

// ──────────────────────────────────────────────────────────
// Avatar — initials block, themed
// ──────────────────────────────────────────────────────────
function Avatar({ name = 'Priya Sharma', size = 36, alt }) {
  const t = useT();
  const m = t.motif;
  const initial = name.split(' ').map(n => n[0]).slice(0, 2).join('');
  let bg = alt ? t.accent2 : t.accent;
  let fg = m === 'paper' ? t.surface : t.accentInk;
  if (m === 'rule') { bg = t.fg; fg = t.surface; }
  return (
    <div style={{
      width: size, height: size, borderRadius: t.radius,
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.36,
      fontFamily: t.fontBody, flexShrink: 0,
      letterSpacing: '-0.02em',
    }}>{initial}</div>
  );
}

// ──────────────────────────────────────────────────────────
// Big numeric — themed display number
// ──────────────────────────────────────────────────────────
function BigNum({ children, size = 32, accent }) {
  const t = useT();
  const m = t.motif;
  let s = {
    fontFamily: m === 'rule' ? t.fontDisp : t.fontBody,
    fontSize: size, fontWeight: m === 'rule' ? 400 : 700,
    letterSpacing: m === 'rule' ? '-0.03em' : '-0.04em',
    lineHeight: 0.95,
    color: accent ? t.accent : t.fg,
    fontVariantNumeric: 'tabular-nums',
  };
  if (m === 'glow' && accent) s.textShadow = `0 0 20px ${t.accent}88`;
  return <span style={s}>{children}</span>;
}

// ──────────────────────────────────────────────────────────
// Mono caption (for code-like data: order ids, timestamps)
// ──────────────────────────────────────────────────────────
function Mono({ children, color, size = 11 }) {
  const t = useT();
  return <span style={{ fontFamily: t.fontMono, fontSize: size, color: color || t.fgMuted, letterSpacing: '0.02em' }}>{children}</span>;
}

// ──────────────────────────────────────────────────────────
// Body label (regular text)
// ──────────────────────────────────────────────────────────
function Lbl({ children, dim, weight = 600, size = 13, style = {} }) {
  const t = useT();
  return <span style={{ fontSize: size, color: dim ? t.fgMuted : t.fg, fontWeight: weight, fontFamily: t.fontBody, ...style }}>{children}</span>;
}

// ──────────────────────────────────────────────────────────
// Phone wrapper
// ──────────────────────────────────────────────────────────
function Phone({ label, theme, children, tab }) {
  return (
    <ThemeProvider theme={theme}>
      <div data-screen-label={label} style={{ position: 'relative' }}>
        <IOSDevice width={402} height={874} statusBarStyle={theme.statusBarStyle}>
          <div style={{
            minHeight: '100%', paddingTop: 54, paddingBottom: tab ? 88 : 34,
            background: theme.bg, color: theme.fg,
            fontFamily: theme.fontBody,
          }}>
            {children}
          </div>
          {tab && <TabBar active={tab} />}
        </IOSDevice>
      </div>
    </ThemeProvider>
  );
}

Object.assign(window, {
  ThemeCtx, ThemeProvider, useT, ICN,
  Surface, HazardStripe, Header, IconBtn, TabBar, Eyebrow, Pill, Button, Avatar, BigNum, Mono, Lbl, Phone,
});
