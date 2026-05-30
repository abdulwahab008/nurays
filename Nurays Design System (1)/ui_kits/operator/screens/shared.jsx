// shared.jsx — Mobile chrome shared across all Operator screens
// AppHeader (sticky translucent), TabBar (bottom nav), StatPill, Avatar, Badge, Section

const { useState } = React;

// Tiny inline icons (Heroicons outline, 24px, stroke 1.5)
const I = {
  home:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.25 12L12 2.25 21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875a1.125 1.125 0 0 1 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125a1.125 1.125 0 0 0 1.125-1.125V9.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cube:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 7.5 12 3 3 7.5m18 0L12 12m9-4.5v9L12 21M3 7.5 12 12m-9-4.5v9L12 21m0-9v9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bag:     <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356 11.25h-15.21a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.66 7.5h12.68c.576 0 1.058.435 1.12 1.007l1.264 12a1.125 1.125 0 0 1-1.12 1.243Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  list:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chart:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  bell:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  filter:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevron: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m8.25 4.5 7.5 7.5-7.5 7.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  back:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15.75 19.5 8.25 12l7.5-7.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  more:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="6" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18" r="1.4" fill="currentColor"/></svg>,
  arrow_up: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 19.5V4.5m0 0L5.25 11.25M12 4.5l6.75 6.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrow_dn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 4.5v15m0 0 6.75-6.75M12 19.5l-6.75-6.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  warn:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m4.5 12.75 6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  rupee:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12M6 8h12M9.5 13H6l9 8M9.5 13h.5a4.5 4.5 0 0 0 0-9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cog:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  user:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  truck:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.07-1.123a11.7 11.7 0 0 0-1.156-3.99l-3.66-7.32a1.125 1.125 0 0 0-1.006-.622H14.25M2.25 14.25v-3.375c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125v3.375m0 0c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 0 1-1.125-1.125m9.75 0v-3.375c0-.621.504-1.125 1.125-1.125h.375M14.25 9.75h.375" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  heart:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  star:    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .32-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"/></svg>,
  close:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// Brand mark — leaf monogram replacement for 🍽️ emoji (better than placeholder)
function BrandMark({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: 'var(--gradient-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(34,197,94,0.35)',
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M5 19c0-7 6-14 14-14 0 8-6 14-14 14Z" fill="white" opacity="0.95"/>
        <path d="M5 19C9 15 13 11 17 7" stroke="rgba(34,197,94,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// Sticky app header — translucent, mirrors the desktop Header.jsx pattern
function AppHeader({ title, subtitle, leading, trailing, gradient = false }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      background: gradient ? 'var(--gradient-hero)' : 'rgba(255,255,255,0.86)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderBottom: gradient ? 'none' : '1px solid var(--border-light)',
      padding: '12px 16px',
      color: gradient ? 'white' : 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36 }}>
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, opacity: gradient ? 0.85 : 0.6, marginTop: 2, lineHeight: 1.2 }}>{subtitle}</div>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

// Bottom tab bar — 5 tabs, primary green active state
function TabBar({ active = 'home', onChange }) {
  const tabs = [
    { id: 'home',      label: 'Home',     icon: I.home  },
    { id: 'orders',    label: 'Orders',   icon: I.list  },
    { id: 'inventory', label: 'Stock',    icon: I.cube  },
    { id: 'reports',   label: 'Reports',  icon: I.chart },
    { id: 'more',      label: 'More',     icon: I.cog   },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      paddingBottom: 30, paddingTop: 8, paddingLeft: 8, paddingRight: 8,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border-light)',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => {
        const a = t.id === active;
        return (
          <button key={t.id} onClick={() => onChange?.(t.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            background: 'transparent', border: 'none', padding: '6px 4px', cursor: 'pointer',
            color: a ? 'var(--primary-600)' : 'var(--gray-500)',
          }}>
            {t.icon}
            <span style={{ fontSize: 10, fontWeight: a ? 700 : 500 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Avatar circle — gradient w/ initials fallback
function Avatar({ name = 'Priya Sharma', size = 36, color = 'var(--gradient-primary)' }) {
  const initial = name.split(' ').map(n => n[0]).slice(0, 2).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: 9999,
      background: color, color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38,
      boxShadow: '0 2px 4px rgba(0,0,0,0.08)', flexShrink: 0,
    }}>{initial}</div>
  );
}

// Status badge w/ semantic ramp
function Badge({ children, tone = 'neutral', size = 'md' }) {
  const tones = {
    neutral: { bg: 'var(--gray-100)',    fg: 'var(--gray-700)' },
    success: { bg: 'var(--success-50)',  fg: 'var(--success-700)' },
    warning: { bg: 'var(--warning-50)',  fg: '#92400E' },
    error:   { bg: 'var(--error-50)',    fg: 'var(--error-700)' },
    info:    { bg: 'var(--info-50)',     fg: 'var(--info-700)' },
    primary: { bg: 'var(--primary-50)',  fg: 'var(--primary-700)' },
    accent:  { bg: 'var(--accent-50)',   fg: 'var(--accent-700)' },
  };
  const t = tones[tone] || tones.neutral;
  const padY = size === 'sm' ? 2 : 4;
  const padX = size === 'sm' ? 6 : 8;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: t.bg, color: t.fg,
      padding: `${padY}px ${padX}px`, borderRadius: 9999,
      fontSize: size === 'sm' ? 10 : 11, fontWeight: 600,
      lineHeight: 1.2, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// IconBtn — circular button for header actions
function IconBtn({ children, onClick, dotCount, dark, size = 36 }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: 9999,
      background: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.7)',
      border: dark ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border-light)',
      color: dark ? 'white' : 'var(--gray-700)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative', flexShrink: 0,
    }}>
      {children}
      {dotCount && <span style={{
        position: 'absolute', top: -2, right: -2,
        background: 'var(--error-500)', color: 'white',
        fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 9999,
        minWidth: 14, textAlign: 'center', lineHeight: 1.3,
        boxShadow: '0 0 0 2px white',
      }}>{dotCount}</span>}
    </button>
  );
}

// Section title block
function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 16px', marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{children}</h3>
      {action && <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}>{action}</a>}
    </div>
  );
}

// Card surface
function Card({ children, style = {}, padded = true, gradient = false }) {
  return (
    <div style={{
      background: gradient ? 'var(--gradient-card)' : 'white',
      border: '1px solid var(--border-light)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-sm)',
      padding: padded ? 16 : 0,
      position: 'relative', overflow: 'hidden',
      ...style,
    }}>{children}</div>
  );
}

// Phone wrapper — IOSDevice + content area + tab bar overlay (when needed)
function Screen({ label, children, tab, onTab, headerGradient }) {
  return (
    <div data-screen-label={label} style={{ position: 'relative' }}>
      <IOSDevice width={402} height={874}>
        <div style={{
          minHeight: '100%', paddingTop: 54, paddingBottom: tab ? 88 : 34,
          background: 'var(--bg-secondary)',
          fontFamily: 'var(--font-sans)', color: 'var(--fg-primary)',
        }}>
          {children}
        </div>
        {tab && <TabBar active={tab} onChange={onTab} />}
      </IOSDevice>
    </div>
  );
}

Object.assign(window, {
  I, BrandMark, AppHeader, TabBar, Avatar, Badge, IconBtn, SectionTitle, Card, Screen,
});
