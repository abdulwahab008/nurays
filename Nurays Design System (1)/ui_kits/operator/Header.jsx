// Header.jsx — sticky translucent header with backdrop blur
function Header({ title = 'Dashboard', user = { name: 'Priya Sharma', role: 'Administrator', initial: 'P' } }) {
  return (
    <header style={hdStyles.header}>
      <div style={hdStyles.content}>
        <h1 style={hdStyles.title}>{title}</h1>
        <div style={hdStyles.actions}>
          <button style={hdStyles.iconBtn} aria-label="Notifications">
            <span style={{ position: 'relative' }}>
              🔔
              <span style={hdStyles.badge}>3</span>
            </span>
          </button>
          <button style={hdStyles.iconBtn} aria-label="Search">⌕</button>
          <div style={hdStyles.user}>
            <div style={hdStyles.avatar}>{user.initial}</div>
            <div>
              <div style={hdStyles.userName}>{user.name}</div>
              <div style={hdStyles.userRole}>{user.role}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

const hdStyles = {
  header: { background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-light)', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 20, boxShadow: 'var(--shadow-sm)' },
  content: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 16 },
  iconBtn: { width: 40, height: 40, border: '1px solid var(--border-light)', background: 'white', borderRadius: 8, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-secondary)' },
  badge: { position: 'absolute', top: -8, right: -8, background: 'var(--error-500)', color: 'white', borderRadius: 9999, fontSize: 10, fontWeight: 700, padding: '2px 6px', minWidth: 16, textAlign: 'center' },
  user: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' },
  avatar: { width: 32, height: 32, borderRadius: 9999, background: 'var(--gradient-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 },
  userName: { fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', margin: 0 },
  userRole: { fontSize: 11, color: 'var(--fg-secondary)', margin: 0 },
};

window.Header = Header;
