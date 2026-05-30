// Sidebar.jsx — fixed left nav, 280px, with active-pill indicator
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', glyph: '⌂' },
  { id: 'products',  label: 'Products',  glyph: '◫' },
  { id: 'vendors',   label: 'Vendors',   glyph: '◉' },
  { id: 'orders',    label: 'Orders',    glyph: '☰' },
  { id: 'inventory', label: 'Inventory', glyph: '▢' },
  { id: 'reports',   label: 'Reports',   glyph: '⌁' },
  { id: 'settings',  label: 'Settings',  glyph: '⚙' },
];

function Sidebar({ active = 'dashboard', onNavigate, user = { name: 'Priya Sharma', role: 'Administrator', initial: 'P' } }) {
  return (
    <aside style={sbStyles.sidebar}>
      <div style={sbStyles.header}>
        <a href="#" style={sbStyles.brand} onClick={(e) => { e.preventDefault(); onNavigate?.('dashboard'); }}>
          <span style={sbStyles.brandIcon}>🍽️</span>
          <span style={sbStyles.brandText}>Nurays</span>
        </a>
      </div>
      <nav style={sbStyles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <a key={item.id} href="#" onClick={(e) => { e.preventDefault(); onNavigate?.(item.id); }}
               style={{ ...sbStyles.item, ...(isActive ? sbStyles.itemActive : null) }}>
              {isActive && <span style={sbStyles.activePill} />}
              <span style={{ ...sbStyles.itemGlyph, ...(isActive ? { color: 'var(--primary-700)' } : null) }}>{item.glyph}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div style={sbStyles.footer}>
        <div style={sbStyles.userAvatar}>{user.initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sbStyles.userName}>{user.name}</div>
          <div style={sbStyles.userRole}>{user.role}</div>
        </div>
      </div>
    </aside>
  );
}

const sbStyles = {
  sidebar: { width: 280, background: 'white', borderRight: '1px solid var(--border-light)', height: '100vh', position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', zIndex: 30 },
  header: { padding: '24px', borderBottom: '1px solid var(--border-light)', background: 'var(--gradient-card)' },
  brand: { display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' },
  brandIcon: { fontSize: 24 },
  brandText: { fontSize: 20, fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  nav: { padding: 16, flex: 1, overflowY: 'auto' },
  item: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 4, borderRadius: 8, color: 'var(--fg-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 500, position: 'relative', transition: 'all 150ms ease' },
  itemActive: { background: 'var(--primary-50)', color: 'var(--primary-700)' },
  activePill: { position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: 'var(--primary-500)', borderRadius: 9999 },
  itemGlyph: { width: 20, fontSize: 16, opacity: 0.7, color: 'var(--fg-tertiary)' },
  footer: { padding: 16, borderTop: '1px solid var(--border-light)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 9999, background: 'var(--gradient-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 },
  userName: { fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' },
  userRole: { fontSize: 12, color: 'var(--fg-secondary)' },
};

window.Sidebar = Sidebar;
