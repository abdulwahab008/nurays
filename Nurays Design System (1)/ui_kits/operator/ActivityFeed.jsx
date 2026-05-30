// ActivityFeed.jsx & QuickActions.jsx
function ActivityFeed({ items }) {
  const dotColor = (status) => ({
    success: 'var(--success-500)',
    warning: 'var(--warning-500)',
    info: 'var(--info-500)',
    error: 'var(--error-500)',
  }[status] || 'var(--gray-400)');

  return (
    <div style={afStyles.card}>
      <div style={afStyles.header}>
        <h3 style={afStyles.title}>Recent Activity</h3>
        <a href="#" style={afStyles.link}>View all</a>
      </div>
      <div style={afStyles.body}>
        {items.map((item) => (
          <div key={item.id} style={afStyles.item}>
            <span style={{ ...afStyles.dot, background: dotColor(item.status) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={afStyles.message}>{item.message}</div>
              <div style={afStyles.time}>{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const afStyles = {
  card: { background: 'white', border: '1px solid var(--border-light)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' },
  header: { padding: '20px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--gradient-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 600, color: 'var(--fg-primary)', margin: 0 },
  link: { fontSize: 13, color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 500 },
  body: { padding: '8px 0' },
  item: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 24px' },
  dot: { width: 8, height: 8, borderRadius: 9999, marginTop: 7, flexShrink: 0, boxShadow: '0 0 0 3px rgba(255,255,255,0.8)' },
  message: { fontSize: 14, color: 'var(--fg-primary)', lineHeight: 1.4 },
  time: { fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 },
};

function QuickActions({ actions }) {
  return (
    <div style={qaStyles.grid}>
      {actions.map((a) => (
        <a key={a.title} href="#" style={qaStyles.action} onClick={(e) => { e.preventDefault(); a.onClick?.(); }}>
          <div style={{ ...qaStyles.icon, background: a.bg }}>{a.icon}</div>
          <span style={qaStyles.label}>{a.title}</span>
        </a>
      ))}
    </div>
  );
}

const qaStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  action: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 16px', background: 'white', border: '1px solid var(--border-light)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', textDecoration: 'none', color: 'var(--fg-primary)', transition: 'all 250ms ease' },
  icon: { width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22, fontWeight: 700 },
  label: { fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' },
};

window.ActivityFeed = ActivityFeed;
window.QuickActions = QuickActions;
