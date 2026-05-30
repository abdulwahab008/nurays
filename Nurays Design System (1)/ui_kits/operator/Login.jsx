// Login.jsx — full-page hero login (recreated from Login.js + Login.css)
function Login({ onLogin }) {
  const [email, setEmail] = React.useState('priya@kitchenco.in');
  const [password, setPassword] = React.useState('demo1234');
  const [loading, setLoading] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin?.({ email }); }, 500);
  };

  return (
    <div style={lgStyles.container}>
      <div style={lgStyles.bokeh} />
      <div style={lgStyles.card}>
        <span style={lgStyles.bar} />
        <div style={lgStyles.header}>
          <div style={lgStyles.brandIcon}>🍽️</div>
          <h1 style={lgStyles.title}>Nurays</h1>
          <p style={lgStyles.subtitle}>Sign in to your account</p>
        </div>
        <form onSubmit={submit} style={lgStyles.form}>
          <div style={lgStyles.field}>
            <label style={lgStyles.label}>Email Address</label>
            <input style={lgStyles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required />
          </div>
          <div style={lgStyles.field}>
            <label style={lgStyles.label}>Password</label>
            <input style={lgStyles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
          </div>
          <button type="submit" disabled={loading} style={{ ...lgStyles.button, ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <div style={lgStyles.helpRow}>
            <a href="#" style={lgStyles.link}>Forgot password?</a>
            <span style={lgStyles.helpText}>New here? <a href="#" style={lgStyles.link}>Create account</a></span>
          </div>
        </form>
      </div>
    </div>
  );
}

const lgStyles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gradient-hero)', padding: 16, position: 'relative', overflow: 'hidden' },
  bokeh: { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 50%), radial-gradient(circle at 40% 40%, rgba(255,255,255,0.08) 0%, transparent 50%)', pointerEvents: 'none' },
  card: { background: 'white', borderRadius: 24, boxShadow: 'var(--shadow-2xl)', padding: 40, width: '100%', maxWidth: 420, position: 'relative', overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--gradient-primary)' },
  header: { textAlign: 'center', marginBottom: 32 },
  brandIcon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 36, fontWeight: 800, margin: '0 0 6px', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  subtitle: { color: 'var(--fg-secondary)', margin: 0, fontSize: 16, fontWeight: 500 },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' },
  input: { minHeight: 44, padding: '12px 16px', border: '1px solid var(--border-medium)', borderRadius: 8, fontSize: 16, fontFamily: 'var(--font-sans)', color: 'var(--fg-primary)', background: 'white', outline: 'none' },
  button: { width: '100%', minHeight: 52, fontSize: 18, fontWeight: 600, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 12, boxShadow: 'var(--shadow-lg)', cursor: 'pointer', marginTop: 4 },
  helpRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 },
  link: { color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 500 },
  helpText: { color: 'var(--fg-secondary)' },
};

window.Login = Login;
