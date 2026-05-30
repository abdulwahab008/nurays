// PageHeading.jsx — page title in a gradient-bar card
function PageHeading({ title, subtitle, gradientText = true }) {
  return (
    <div style={phStyles.heading}>
      <span style={phStyles.bar} />
      <h1 style={{ ...phStyles.title, ...(gradientText ? phStyles.gradientText : {}) }}>{title}</h1>
      {subtitle && <p style={phStyles.subtitle}>{subtitle}</p>}
    </div>
  );
}

const phStyles = {
  heading: { marginBottom: 24, padding: '28px 32px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-light)', position: 'relative', overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))' },
  title: { fontSize: 30, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' },
  gradientText: { background: 'var(--gradient-text)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  subtitle: { fontSize: 16, color: 'var(--fg-secondary)', margin: 0, fontWeight: 500 },
};

// StatCard.jsx — KPI tile with top gradient bar
function StatCard({ title, value, change, changeType = 'increase', icon, color = 'var(--accent-500)', barGradient = 'var(--gradient-primary)' }) {
  return (
    <div style={scStyles.card}>
      <span style={{ ...scStyles.bar, background: barGradient }} />
      <div style={scStyles.row}>
        <div>
          <p style={scStyles.title}>{title}</p>
          <p style={scStyles.value}>{value}</p>
          {change && (
            <div style={{ ...scStyles.change, color: changeType === 'increase' ? 'var(--success-600)' : 'var(--error-600)' }}>
              {changeType === 'increase' ? '↑' : '↓'} {change}
            </div>
          )}
        </div>
        <div style={{ ...scStyles.icon, background: color }}>{icon}</div>
      </div>
    </div>
  );
}

const scStyles = {
  card: { position: 'relative', background: 'white', border: '1px solid var(--border-light)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-sm)', overflow: 'hidden', transition: 'all 250ms ease' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  title: { fontSize: 13, color: 'var(--fg-secondary)', fontWeight: 500, margin: '0 0 6px' },
  value: { fontSize: 30, fontWeight: 800, color: 'var(--fg-primary)', margin: 0, lineHeight: 1.1 },
  change: { display: 'flex', gap: 4, alignItems: 'center', marginTop: 8, fontSize: 13, fontWeight: 600 },
  icon: { width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 22, fontWeight: 700 },
};

window.PageHeading = PageHeading;
window.StatCard = StatCard;
