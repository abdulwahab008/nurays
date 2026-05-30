// web-shell.jsx — Web app shell: dark sidebar + top bar + content frame
// Uses same brand vars from the mobile sheet (var(--brand), --ink, --gray-*).

const I = window.I; // icons from screens-extra
const IMG = window.IMG;

function Sidebar({ active = 'dash' }) {
  const groups = [
    { title: 'OVERVIEW', items: [
      { id: 'dash', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg> },
      { id: 'reports', label: 'Reports', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></svg> },
    ]},
    { title: 'OPERATIONS', items: [
      { id: 'orders', label: 'Orders', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, badge: 8 },
      { id: 'inventory', label: 'Inventory', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg> },
      { id: 'products', label: 'Products', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 7.3 12 12 3.5 7.3"/><path d="M12 22V12"/><path d="m20 7-8 4-8-4 8-4Z"/></svg> },
      { id: 'vendors', label: 'Vendors', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    ]},
    { title: 'CUSTOMERS', items: [
      { id: 'customer', label: 'Customers', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
      { id: 'notifs', label: 'Notifications', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>, badge: 2 },
    ]},
    { title: 'ACCOUNT', items: [
      { id: 'settings', label: 'Settings', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg> },
    ]},
  ];
  return (
    <aside style={{ width: 240, background: '#0F0F10', color: '#9CA3AF', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '20px 0', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', fontSize: 14 }}>N</div>
        <div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.01em' }}>Nurays</div>
          <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, letterSpacing: '0.04em' }}>BACK-OFFICE</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ background: '#1A1A1C', borderRadius: 9, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B7280' }}>
          <span style={{ opacity: 0.6 }}>{I.search}</span>
          Search
          <span style={{ marginLeft: 'auto', background: '#0F0F10', padding: '2px 5px', borderRadius: 4, fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>⌘K</span>
        </div>
      </div>

      {/* Groups */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px' }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#4B5563', letterSpacing: '0.08em', padding: '0 8px 6px' }}>{g.title}</div>
            {g.items.map((it) => {
              const a = it.id === active;
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: a ? 'rgba(230, 57, 70, 0.12)' : 'transparent', color: a ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: a ? 600 : 500, marginBottom: 1, position: 'relative' }}>
                  {a && <span style={{ position: 'absolute', left: -12, top: 6, bottom: 6, width: 3, borderRadius: 2, background: 'var(--brand)' }} />}
                  <span style={{ color: a ? 'var(--brand)' : '#6B7280', display: 'flex' }}>{it.icon}</span>
                  <span>{it.label}</span>
                  {it.badge && <span style={{ marginLeft: 'auto', background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, minWidth: 16, textAlign: 'center' }}>{it.badge}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* User card */}
      <div style={{ margin: '0 12px', padding: 10, borderRadius: 10, background: '#1A1A1C', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={IMG.priya} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Priya Sharma</div>
          <div style={{ color: '#6B7280', fontSize: 10 }}>Owner</div>
        </div>
        <span style={{ color: '#6B7280' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
    </aside>
  );
}

function TopBar({ title, sub, breadcrumb, actions }) {
  return (
    <div style={{ borderBottom: '1px solid var(--gray-2)', padding: '20px 32px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        {breadcrumb && <div style={{ fontSize: 12, color: 'var(--gray-5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {breadcrumb.map((b, i, a) => <React.Fragment key={i}>
            <span style={{ color: i === a.length - 1 ? 'var(--ink)' : 'var(--gray-5)', fontWeight: i === a.length - 1 ? 600 : 500 }}>{b}</span>
            {i < a.length - 1 && <span style={{ color: 'var(--gray-3)' }}>/</span>}
          </React.Fragment>)}
        </div>}
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

function WebShell({ label, active, title, sub, breadcrumb, actions, children }) {
  return (
    <div data-screen-label={label} style={{ width: 1440, height: 900, display: 'flex', background: '#FAFAF9', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', overflow: 'hidden' }}>
      <Sidebar active={active} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <TopBar title={title} sub={sub} breadcrumb={breadcrumb} actions={actions} />
        <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>{children}</div>
      </main>
    </div>
  );
}

function Btn({ children, kind = 'primary', icon, size = 'md' }) {
  const h = size === 'sm' ? 32 : 38;
  const fs = size === 'sm' ? 12 : 13;
  const tones = {
    primary:   { bg: 'var(--brand)', fg: '#fff' },
    secondary: { bg: 'var(--gray-1)', fg: 'var(--ink)' },
    outline:   { bg: '#fff', fg: 'var(--ink)', border: '1px solid var(--gray-3)' },
    dark:      { bg: 'var(--ink)', fg: '#fff' },
  };
  const t = tones[kind];
  return (
    <button style={{ height: h, padding: '0 14px', borderRadius: 9, background: t.bg, color: t.fg, fontSize: fs, fontWeight: 600, border: t.border || 'none', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: kind === 'primary' ? '0 1px 2px rgba(230, 57, 70, 0.3)' : 'none' }}>
      {icon}{children}
    </button>
  );
}

function Card({ children, p = 20, style = {} }) {
  return <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 14, padding: p, boxShadow: '0 1px 2px rgba(0,0,0,0.02)', ...style }}>{children}</div>;
}

function StatTile({ label, value, delta, deltaTone = 'green', sparkline }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: 'var(--gray-5)', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
        {delta && <span style={{ fontSize: 12, fontWeight: 700, color: deltaTone === 'green' ? 'var(--green)' : 'var(--brand)' }}>{delta}</span>}
      </div>
      {sparkline && <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30, marginTop: 10 }}>
        {sparkline.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v / Math.max(...sparkline)) * 100}%`, background: i === sparkline.length - 1 ? 'var(--brand)' : 'var(--gray-2)', borderRadius: 2, minHeight: 2 }} />
        ))}
      </div>}
    </Card>
  );
}

function StatusPill({ tone, children, dot }) {
  const tones = {
    green:  { bg: 'var(--green-soft)',  fg: 'var(--green)' },
    red:    { bg: 'var(--red-soft)',    fg: 'var(--brand)' },
    orange: { bg: 'var(--orange-soft)', fg: 'var(--orange)' },
    gray:   { bg: 'var(--gray-1)',      fg: 'var(--gray-5)' },
  };
  const c = tones[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99 }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: c.fg }} />}
      {children}
    </span>
  );
}

Object.assign(window, { Sidebar, TopBar, WebShell, Btn, Card, StatTile, StatusPill });
