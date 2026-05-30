// desktop-screens.jsx — All Operator desktop/laptop screens
// Reuses existing Sidebar, Header, ActivityFeed, PageHeading, Login from the kit.
// Loads after them, plus shared mobile primitives (Avatar, Badge, IconBtn, etc — reused from /screens/shared.jsx).

const { useState: useDS } = React;

// ─────────────────────────────────────────────────────────────
// AppShell — Sidebar + Header + content slot. The desktop chassis.
// ─────────────────────────────────────────────────────────────
function AppShell({ active, title, subtitle, headerExtras, children, scrollable = true }) {
  const [a, setA] = useDS(active || 'dashboard');
  return (
    <div style={{ display: 'flex', minHeight: '100%', background: 'var(--bg-secondary)', fontFamily: 'var(--font-sans)' }}>
      {/* Inline sidebar (not fixed — fits inside the browser window) */}
      <DSidebar active={a} onNavigate={setA} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <DHeader title={title} subtitle={subtitle} extras={headerExtras} />
        <div style={{ flex: 1, padding: '24px 32px 48px', overflow: scrollable ? 'auto' : 'visible' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

// Inline sidebar (not position:fixed; works inside artboard)
const NAV = [
  { id: 'dashboard',     label: 'Dashboard',     icon: I.home  },
  { id: 'orders',        label: 'Orders',        icon: I.list  },
  { id: 'inventory',     label: 'Inventory',     icon: I.cube  },
  { id: 'products',      label: 'Products',      icon: I.bag   },
  { id: 'vendors',       label: 'Vendors',       icon: I.truck },
  { id: 'reports',       label: 'Reports',       icon: I.chart },
  { id: 'customers',     label: 'Customers',     icon: I.user  },
  { id: 'notifications', label: 'Notifications', icon: I.bell  },
  { id: 'settings',      label: 'Settings',      icon: I.cog   },
];

function DSidebar({ active, onNavigate }) {
  return (
    <aside style={{
      width: 244, background: 'white', borderRight: '1px solid var(--border-light)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 20px', borderBottom: '1px solid var(--border-light)', background: 'var(--gradient-card)' }}>
        <a href="#" onClick={e => { e.preventDefault(); onNavigate?.('dashboard'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <BrandMark size={32} />
          <span style={{ fontSize: 18, fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.01em' }}>Nurays</span>
        </a>
      </div>
      <nav style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
        {NAV.map(n => {
          const a = n.id === active;
          return (
            <a key={n.id} href="#" onClick={e => { e.preventDefault(); onNavigate?.(n.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', marginBottom: 2, borderRadius: 8,
                color: a ? 'var(--primary-700)' : 'var(--gray-600)',
                background: a ? 'var(--primary-50)' : 'transparent',
                textDecoration: 'none', fontSize: 14, fontWeight: a ? 600 : 500,
                position: 'relative',
              }}>
              {a && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, background: 'var(--primary-500)', borderRadius: 9999 }} />}
              <span style={{ width: 18, height: 18, display: 'inline-flex', color: a ? 'var(--primary-600)' : 'var(--gray-400)' }}>{n.icon}</span>
              <span>{n.label}</span>
            </a>
          );
        })}
      </nav>
      <div style={{ padding: 12, borderTop: '1px solid var(--border-light)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name="Priya Sharma" size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)' }}>Priya Sharma</div>
          <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>Administrator</div>
        </div>
      </div>
    </aside>
  );
}

function DHeader({ title, subtitle, extras }) {
  return (
    <header style={{
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-light)',
      padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 16,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 1 }}>{subtitle}</div>}
      </div>
      {/* Search bar */}
      <div style={{
        flex: 1, maxWidth: 360, height: 36, borderRadius: 9999,
        background: 'var(--gray-100)', border: '1px solid transparent',
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
      }}>
        <span style={{ color: 'var(--gray-500)' }}>{I.search}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--gray-500)' }}>Search orders, products, vendors…</span>
        <span style={{ fontSize: 10, padding: '2px 6px', background: 'white', border: '1px solid var(--border-light)', borderRadius: 4, color: 'var(--gray-500)', fontFamily: 'var(--font-mono)' }}>⌘K</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {extras}
        <IconBtn dotCount={3}>{I.bell}</IconBtn>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// 01 LOGIN (desktop) — split hero
// ─────────────────────────────────────────────────────────────
function LoginDesktop() {
  return (
    <div data-screen-label="01 Login" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', minHeight: '100%', background: 'white', fontFamily: 'var(--font-sans)' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--gradient-hero)', padding: 60, color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 40% 40%, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <BrandMark size={40} />
          <span style={{ fontSize: 20, fontWeight: 800 }}>Nurays</span>
        </div>
        <div style={{ marginTop: 'auto', position: 'relative' }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 16 }}>
            Run your kitchen<br/>like a <span style={{ background: 'linear-gradient(90deg, #fde68a, #fcd34d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>pro.</span>
          </div>
          <div style={{ fontSize: 16, opacity: 0.9, lineHeight: 1.5, maxWidth: 380 }}>
            Manage products, orders, inventory and vendors — all from a single, beautiful operator workspace.
          </div>
          <div style={{ marginTop: 32, display: 'flex', gap: 24, fontSize: 13 }}>
            {['Trusted by 1,200+ kitchens', '99.9% uptime', '24/7 support'].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.7)' }} />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: 'var(--gray-500)', margin: '0 0 28px' }}>Sign in to your operator account</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DField label="Email Address" value="priya@kitchenco.in" />
            <DField label="Password" value="••••••••" type="password" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-600)' }}>
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</a>
            </div>
            <button style={{ width: '100%', minHeight: 48, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.35)' }}>Sign In</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DField({ label, value, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>{label}</label>
      <input type={type} defaultValue={value} style={{ width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--gray-300)', fontSize: 14, fontFamily: 'var(--font-sans)', boxSizing: 'border-box', outline: 'none', background: 'white' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 02 DASHBOARD (desktop) — KPI grid + hero chart + activity
// ─────────────────────────────────────────────────────────────
function DashboardDesktop() {
  return (
    <div data-screen-label="02 Dashboard">
      <AppShell active="dashboard" title="Dashboard" subtitle="Tuesday, May 6 · Welcome back, Priya">
        {/* Hero: revenue + chart */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sales Trend · 6 months</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>₹1,20,000</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 2 }}>{I.arrow_up} +12% vs prev</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--gray-100)', borderRadius: 9999 }}>
                {['1M', '3M', '6M', '1Y'].map((t, i) => (
                  <button key={t} style={{ padding: '6px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: i === 2 ? 'white' : 'transparent', color: i === 2 ? 'var(--gray-900)' : 'var(--gray-500)', boxShadow: i === 2 ? 'var(--shadow-xs)' : 'none' }}>{t}</button>
                ))}
              </div>
            </div>
            <BigChart />
          </Card>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: 'var(--gradient-primary)', color: 'white' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.9 }}>TODAY</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>₹12,450</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>24 orders · ₹520 avg</div>
            </div>
            <div style={{ padding: 20 }}>
              <DonutGoal />
            </div>
          </Card>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <DStat title="Today's Orders"  value="24"   change="+12%" tone="info"    icon={I.bag}   />
          <DStat title="Total Products"  value="156"  change="+3"   tone="primary" icon={I.cube}  />
          <DStat title="Total Customers" value="89"   change="+5"   tone="info"    icon={I.user}  />
          <DStat title="Low Stock"       value="8"    change="-2"   tone="error"   icon={I.warn} negative />
        </div>

        {/* Two-col: Activity + Performance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          <Card padded={false}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Activity</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>Latest updates and notifications</div>
              </div>
              <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}>View all →</a>
            </div>
            {[
              { tone: 'success', msg: <><b>New order</b> #ORD-001 received from John Doe</>, time: '2 minutes ago' },
              { tone: 'warning', msg: <><b>Low stock alert:</b> Tomatoes (5kg remaining)</>, time: '15 minutes ago' },
              { tone: 'success', msg: <>Order #ORD-002 <b>delivered successfully</b></>, time: '1 hour ago' },
              { tone: 'info',    msg: <>New product <b>"Organic Carrots"</b> added</>, time: '2 hours ago' },
              { tone: 'success', msg: <>Payment processed for <b>Fresh Farms Ltd</b></>, time: '3 hours ago' },
            ].map((a, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, marginTop: 6, flexShrink: 0,
                  background: a.tone === 'success' ? 'var(--success-500)' : a.tone === 'warning' ? 'var(--warning-500)' : 'var(--info-500)',
                  boxShadow: '0 0 0 3px rgba(255,255,255,0.9)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.msg}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Performance</div>
              <Badge tone="success" size="sm">All on track</Badge>
            </div>
            <PerfBar label="Order Fulfillment" value={94} suffix="%" />
            <PerfBar label="Customer Satisfaction" value={88} suffix="%" rawLabel="4.4/5" />
            <PerfBar label="Inventory Turnover" value={76} suffix="%" />
            <PerfBar label="On-time Delivery" value={91} suffix="%" last />
            <button style={{ width: '100%', marginTop: 16, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'white', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>Open full reports →</button>
          </Card>
        </div>
      </AppShell>
    </div>
  );
}

function DStat({ title, value, change, tone, icon, negative }) {
  const tones = {
    info:    { bar: 'var(--gradient-accent)',   bg: 'var(--accent-50)',   fg: 'var(--accent-600)' },
    primary: { bar: 'var(--gradient-primary)',  bg: 'var(--primary-50)',  fg: 'var(--primary-600)' },
    error:   { bar: 'linear-gradient(135deg,#ef4444,#dc2626)', bg: 'var(--error-50)', fg: 'var(--error-600)' },
  };
  const t = tones[tone];
  return (
    <Card style={{ padding: 18 }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.bar }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>{value}</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: negative ? 'var(--error-600)' : 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 2 }}>
            {negative ? I.arrow_dn : I.arrow_up} {change}
          </div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      </div>
    </Card>
  );
}

function BigChart() {
  const data = [12, 15, 18, 22, 25, 28];
  const max = 30;
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return (
    <div style={{ padding: 20, height: 220 }}>
      <svg viewBox="0 0 600 180" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="bigchart" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="var(--primary-500)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map(i => (
          <line key={i} x1="0" y1={i * 45 + 15} x2="600" y2={i * 45 + 15} stroke="var(--gray-100)" strokeWidth="1" strokeDasharray="2,4" />
        ))}
        <polygon
          fill="url(#bigchart)"
          points={`30,165 ${data.map((v, i) => `${30 + i * 108},${160 - (v / max) * 140}`).join(' ')} ${30 + (data.length - 1) * 108},165`}
        />
        <polyline
          fill="none" stroke="var(--primary-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          points={data.map((v, i) => `${30 + i * 108},${160 - (v / max) * 140}`).join(' ')}
        />
        {data.map((v, i) => (
          <g key={i}>
            <circle cx={30 + i * 108} cy={160 - (v / max) * 140} r={i === data.length - 1 ? 6 : 4} fill="white" stroke="var(--primary-600)" strokeWidth="2.5"/>
            <text x={30 + i * 108} y="178" textAnchor="middle" fontSize="11" fill="var(--gray-500)" fontWeight="600">{labels[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DonutGoal() {
  const pct = 78;
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="donut" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary-500)"/>
            <stop offset="100%" stopColor="var(--primary-700)"/>
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--gray-100)" strokeWidth="14" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="url(#donut)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 70 70)" />
        <text x="70" y="70" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="800" fill="var(--gray-900)" letterSpacing="-0.02em">{pct}%</text>
        <text x="70" y="92" textAnchor="middle" fontSize="10" fill="var(--gray-500)" fontWeight="600">of goal</text>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Monthly Goal</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>₹2,80,000</div>
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>of ₹3,60,000</div>
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--success-600)' }}>On track · 6 days left</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 03 ORDERS (desktop) — table + filters
// ─────────────────────────────────────────────────────────────
function OrdersDesktop() {
  const orders = [
    { id: 'ORD-001', name: 'John Smith',   email: 'john.smith@email.com',  status: 'pending',   date: '15 May 10:30', items: 2, total: 1349 },
    { id: 'ORD-002', name: 'Sarah Johnson',email: 'sarah.j@email.com',     status: 'confirmed', date: '15 May 09:15', items: 3, total: 2220 },
    { id: 'ORD-003', name: 'Mike Wilson',  email: 'mike.w@email.com',      status: 'delivered', date: '14 May 14:20', items: 2, total: 2324 },
    { id: 'ORD-004', name: 'Emily Davis',  email: 'emily.d@email.com',     status: 'cancelled', date: '14 May 16:45', items: 1, total: 1100 },
    { id: 'ORD-005', name: 'Rahul Verma',  email: 'rahul.v@email.com',     status: 'preparing', date: '14 May 12:10', items: 4, total: 3528 },
    { id: 'ORD-006', name: 'Anita Patel',  email: 'anita.p@email.com',     status: 'delivered', date: '13 May 18:00', items: 2, total: 1577 },
    { id: 'ORD-007', name: 'David Lee',    email: 'david.l@email.com',     status: 'ready',     date: '13 May 15:30', items: 3, total: 1985 },
  ];
  const status = {
    pending:   { label: 'Pending',   tone: 'warning' },
    confirmed: { label: 'Confirmed', tone: 'info' },
    preparing: { label: 'Preparing', tone: 'accent' },
    ready:     { label: 'Ready',     tone: 'primary' },
    delivered: { label: 'Delivered', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'error' },
  };
  return (
    <div data-screen-label="03 Orders">
      <AppShell active="orders" title="Order Management" subtitle="Track and manage customer orders" headerExtras={<button style={primaryDBtnStyle}><span style={{fontSize:14,fontWeight:800}}>+</span> New Order</button>}>
        {/* Stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          <DStat title="Total Orders" value="24" change="+4 today" tone="info" icon={I.bag} />
          <DStat title="Pending"      value="5"  change="+2"       tone="primary" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2" strokeLinecap="round"/></svg>} />
          <DStat title="Preparing"    value="3"  change="+1"       tone="primary" icon={I.cube} />
          <DStat title="Delivered"    value="14" change="+12%"     tone="info"    icon={I.truck} />
          <DStat title="Revenue"      value="₹38,420" change="+8%" tone="primary" icon={I.rupee} />
        </div>

        {/* Table */}
        <Card padded={false}>
          {/* toolbar */}
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--gray-100)' }}>
            <div style={{ flex: 1, height: 36, padding: '0 12px', borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360 }}>
              <span style={{ color: 'var(--gray-500)' }}>{I.search}</span>
              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Search by Order ID, customer name, or email…</span>
            </div>
            <select style={selectStyle}><option>All Status</option></select>
            <select style={selectStyle}><option>Last 7 days</option></select>
            <button style={ghostDBtnStyle}><span style={{ display: 'inline-flex', marginRight: 6 }}>{I.filter}</span>More filters</button>
            <button style={ghostDBtnStyle}>Export</button>
          </div>
          {/* table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                  {['Order ID', 'Customer', 'Status', 'Order Date', 'Items', 'Total', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const s = status[o.status];
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 8px', borderRadius: 4 }}>{o.id}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={o.name} size={32} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{o.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{o.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}><Badge tone={s.tone} size="sm">{s.label}</Badge></td>
                      <td style={{ padding: '14px 16px', color: 'var(--gray-600)' }}>{o.date}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--gray-600)' }}>{o.items}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700 }}>₹{o.total.toLocaleString()}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button style={{ ...iconCircleD, background: 'var(--gray-50)', color: 'var(--gray-600)' }}>{I.more}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* footer */}
          <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--gray-500)' }}>
            <span>Showing 1–7 of 24 orders</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['‹', '1', '2', '3', '4', '›'].map((p, i) => (
                <button key={i} style={{ minWidth: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-light)', background: i === 1 ? 'var(--primary-500)' : 'white', color: i === 1 ? 'white' : 'var(--gray-700)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          </div>
        </Card>
      </AppShell>
    </div>
  );
}

const primaryDBtnStyle = { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--gradient-primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(34,197,94,0.3)' };
const ghostDBtnStyle = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'white', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };
const selectStyle = { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'white', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' };
const iconCircleD = { width: 28, height: 28, borderRadius: 6, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

// ─────────────────────────────────────────────────────────────
// 04 INVENTORY (desktop) — card grid + filters
// ─────────────────────────────────────────────────────────────
function InventoryDesktop() {
  const items = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', stock: 25.5, max: 50, unit: 'kg', vendor: 'Fresh Farm Produce', status: 'in', expiry: '20 May', cost: 290, sell: 435, emoji: '🍅' },
    { name: 'Artisan Bread',    cat: 'Bakery',     stock: 8,    max: 20, unit: 'loaves', vendor: 'Artisan Bakery Co.', status: 'low', expiry: '17 May', cost: 228, sell: 353, emoji: '🥖' },
    { name: 'Fresh Milk',       cat: 'Dairy',      stock: 0,    max: 100,unit: 'L',     vendor: 'Dairy Fresh Ltd.',  status: 'out', expiry: '18 May', cost: 187, sell: 311, emoji: '🥛' },
    { name: 'Organic Apples',   cat: 'Fruits',     stock: 15.2, max: 30, unit: 'kg',    vendor: 'Fresh Farm Produce',status: 'in', expiry: '25 May', cost: 332, sell: 540, emoji: '🍎' },
    { name: 'Greek Yogurt',     cat: 'Dairy',      stock: 3,    max: 40, unit: 'cups',  vendor: 'Dairy Fresh Ltd.',  status: 'low', expiry: '22 May', cost: 207, sell: 332, emoji: '🥣' },
    { name: 'Wild Honey',       cat: 'Pantry',     stock: 22,   max: 30, unit: 'jars',  vendor: 'Bee & Co.',         status: 'in', expiry: '01 Sep', cost: 600, sell: 950, emoji: '🍯' },
  ];
  const sm = {
    in: { l: 'In Stock', t: 'success' },
    low: { l: 'Low Stock', t: 'warning' },
    out: { l: 'Out of Stock', t: 'error' },
  };
  return (
    <div data-screen-label="04 Inventory">
      <AppShell active="inventory" title="Inventory Management" subtitle="Track stock levels and manage your inventory" headerExtras={<button style={primaryDBtnStyle}><span style={{fontSize:14,fontWeight:800}}>+</span> Add New Item</button>}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          <DStat title="Total Items"  value="156"      change="+3"   tone="primary" icon={I.cube} />
          <DStat title="In Stock"     value="142"      change="91%"  tone="info"    icon={I.check} />
          <DStat title="Low Stock"    value="8"        change="-2"   tone="error"   icon={I.warn} negative />
          <DStat title="Out of Stock" value="6"        change="+1"   tone="error"   icon={I.warn} negative />
          <DStat title="Total Value"  value="₹84,320"  change="+₹3.2K" tone="primary" icon={I.rupee} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ flex: 1, maxWidth: 360, height: 36, padding: '0 12px', borderRadius: 8, background: 'white', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--gray-500)' }}>{I.search}</span>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Search by name or vendor…</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['All', 'Vegetables', 'Bakery', 'Dairy', 'Fruits', 'Pantry'].map((c, i) => (
              <span key={c} style={{
                padding: '6px 12px', borderRadius: 9999,
                background: i === 0 ? 'var(--gray-900)' : 'white',
                color: i === 0 ? 'white' : 'var(--gray-700)',
                border: i === 0 ? 'none' : '1px solid var(--border-light)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>{c}</span>
            ))}
          </div>
        </div>

        {/* Card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {items.map((it, i) => {
            const pct = (it.stock / it.max) * 100;
            const s = sm[it.status];
            return (
              <Card key={i} style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{it.emoji}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{it.name}</div>
                      <span style={{ display: 'inline-block', padding: '1px 8px', background: 'var(--gray-100)', borderRadius: 4, fontSize: 10, fontWeight: 600, color: 'var(--gray-700)', marginTop: 3 }}>{it.cat}</span>
                    </div>
                  </div>
                  <Badge tone={s.t} size="sm">{s.l}</Badge>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{it.stock}<span style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 500 }}>/{it.max} {it.unit}</span></span>
                    <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Exp {it.expiry}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(pct, 2)}%`, height: '100%',
                      background: pct === 0 ? 'var(--error-500)' : pct < 30 ? 'var(--warning-500)' : 'var(--gradient-primary)',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: 'var(--gray-600)' }}>
                  <div><span style={{ color: 'var(--gray-400)' }}>Vendor:</span><br /><span style={{ color: 'var(--gray-800)', fontWeight: 600 }}>{it.vendor}</span></div>
                  <div><span style={{ color: 'var(--gray-400)' }}>Margin:</span><br /><span style={{ color: 'var(--success-700)', fontWeight: 700 }}>₹{it.sell - it.cost} ({Math.round(((it.sell - it.cost) / it.cost) * 100)}%)</span></div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-100)' }}>
                  <button style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'white', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>Edit</button>
                  <button style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--primary-50)', color: 'var(--primary-700)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Restock</button>
                </div>
              </Card>
            );
          })}
        </div>
      </AppShell>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 05 PRODUCTS (desktop) — image grid
// ─────────────────────────────────────────────────────────────
function ProductsDesktop() {
  const products = [
    { name: 'Butter Chicken Bowl', cat: 'Mains',     price: 320, stock: 24, rating: 4.8, sales: 142, color: '#fbbf24', emoji: '🍛' },
    { name: 'Paneer Tikka Wrap',   cat: 'Mains',     price: 240, stock: 18, rating: 4.6, sales: 98,  color: '#fde68a', emoji: '🌯' },
    { name: 'Veg Biryani',         cat: 'Mains',     price: 280, stock: 32, rating: 4.7, sales: 156, color: '#fed7aa', emoji: '🍚' },
    { name: 'Mango Lassi',         cat: 'Beverages', price: 120, stock: 45, rating: 4.5, sales: 87,  color: '#fef9c3', emoji: '🥭' },
    { name: 'Gulab Jamun (4pc)',   cat: 'Desserts',  price: 140, stock: 28, rating: 4.9, sales: 64,  color: '#fed7aa', emoji: '🍮' },
    { name: 'Masala Chai',         cat: 'Beverages', price:  60, stock: 99, rating: 4.4, sales: 234, color: '#fde68a', emoji: '🍵' },
    { name: 'Samosa Platter',      cat: 'Starters',  price: 160, stock: 12, rating: 4.6, sales: 78,  color: '#fcd34d', emoji: '🥟' },
    { name: 'Dal Makhani',         cat: 'Mains',     price: 220, stock: 0,  rating: 4.7, sales: 110, color: '#fed7aa', emoji: '🍲' },
  ];
  return (
    <div data-screen-label="05 Products">
      <AppShell active="products" title="Products" subtitle={`${products.length} items · ${products.filter(p => p.stock > 0).length} active`} headerExtras={<><button style={ghostDBtnStyle}>Import</button><button style={primaryDBtnStyle}><span style={{fontSize:14,fontWeight:800}}>+</span> Add Product</button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {products.map((p, i) => (
            <Card key={i} padded={false} style={{ overflow: 'hidden' }}>
              {/* image area */}
              <div style={{
                aspectRatio: '4 / 3', background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56,
                position: 'relative',
              }}>
                {p.emoji}
                {p.stock === 0 && <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', background: 'var(--error-600)', color: 'white', borderRadius: 9999, fontSize: 10, fontWeight: 700 }}>OUT OF STOCK</span>}
                <button style={{ position: 'absolute', top: 8, right: 8, ...iconCircleD, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}>{I.heart}</button>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>{p.cat}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, letterSpacing: '-0.01em' }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>₹{p.price}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, color: 'var(--gray-500)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: '#f59e0b' }}>{I.star}</span>{p.rating} · {p.sales} sold
                  </span>
                  <span>Stock {p.stock}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AppShell>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 06 VENDORS (desktop)
// ─────────────────────────────────────────────────────────────
function VendorsDesktop() {
  const vendors = [
    { name: 'Fresh Farm Produce', contact: 'Rajesh Kumar',  cat: 'Vegetables', items: 24, due: 18500, status: 'paid',     rating: 4.8, color: 'var(--gradient-primary)' },
    { name: 'Artisan Bakery Co.', contact: 'Priya Mehta',   cat: 'Bakery',     items: 12, due: 6200,  status: 'pending',  rating: 4.6, color: 'var(--gradient-accent)' },
    { name: 'Dairy Fresh Ltd.',   contact: 'Suresh Patel',  cat: 'Dairy',      items: 18, due: 24800, status: 'overdue',  rating: 4.5, color: 'var(--gradient-secondary)' },
    { name: 'Bee & Co.',          contact: 'Anita Desai',   cat: 'Pantry',     items: 8,  due: 0,     status: 'paid',     rating: 4.9, color: 'var(--gradient-primary)' },
    { name: 'Sunrise Spices',     contact: 'Vikram Joshi',  cat: 'Spices',     items: 36, due: 12300, status: 'pending',  rating: 4.7, color: 'var(--gradient-accent)' },
    { name: 'Coastal Seafood',    contact: 'Kavita Rao',    cat: 'Seafood',    items: 14, due: 32400, status: 'pending',  rating: 4.4, color: 'var(--gradient-secondary)' },
  ];
  const sm = { paid: { l: 'Paid',    t: 'success' }, pending: { l: 'Pending', t: 'warning' }, overdue: { l: 'Overdue', t: 'error' } };
  return (
    <div data-screen-label="06 Vendors">
      <AppShell active="vendors" title="Vendors" subtitle="Manage suppliers and payments" headerExtras={<button style={primaryDBtnStyle}><span style={{fontSize:14,fontWeight:800}}>+</span> Add Vendor</button>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <DStat title="Total Vendors"   value="32"      change="+2"   tone="primary" icon={I.truck} />
          <DStat title="Active"          value="28"      change="88%"  tone="info"    icon={I.check} />
          <DStat title="Outstanding"     value="₹94,200" change="6 due"tone="error"   icon={I.warn} negative />
          <DStat title="This Month Spend" value="₹3.2L"  change="+12%" tone="primary" icon={I.rupee} />
        </div>

        <Card padded={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                {['Vendor', 'Contact', 'Category', 'Items Supplied', 'Outstanding', 'Status', 'Rating', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v, i) => {
                const s = sm[v.status];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={v.name} size={36} color={v.color} />
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--gray-700)' }}>{v.contact}</td>
                    <td style={{ padding: '14px 16px' }}><span style={{ padding: '2px 8px', background: 'var(--gray-100)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--gray-700)' }}>{v.cat}</span></td>
                    <td style={{ padding: '14px 16px', color: 'var(--gray-700)' }}>{v.items}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: v.due === 0 ? 'var(--gray-400)' : v.status === 'overdue' ? 'var(--error-600)' : 'var(--gray-900)' }}>
                      {v.due === 0 ? '—' : `₹${v.due.toLocaleString()}`}
                    </td>
                    <td style={{ padding: '14px 16px' }}><Badge tone={s.t} size="sm">{s.l}</Badge></td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                        <span style={{ color: '#f59e0b' }}>{I.star}</span>{v.rating}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button style={{ ...iconCircleD, background: 'var(--gray-50)', color: 'var(--gray-600)' }}>{I.more}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </AppShell>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 07 REPORTS (desktop)
// ─────────────────────────────────────────────────────────────
function ReportsDesktop() {
  return (
    <div data-screen-label="07 Reports">
      <AppShell active="reports" title="Reports & Analytics" subtitle="Insights into your business performance" headerExtras={<><select style={selectStyle}><option>This month</option></select><button style={primaryDBtnStyle}>Export PDF</button></>}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <DStat title="Revenue (MTD)"   value="₹3,24,500" change="+18%" tone="primary" icon={I.rupee} />
          <DStat title="Orders"          value="478"       change="+12%" tone="info"    icon={I.bag} />
          <DStat title="Avg Order Value" value="₹679"      change="+₹40" tone="primary" icon={I.chart} />
          <DStat title="Repeat Rate"     value="42%"       change="+3pp" tone="info"    icon={I.heart} />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Breakdown</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Last 6 months · ₹ thousands</div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 600 }}>
                {[
                  { l: 'Mains', c: 'var(--primary-500)' },
                  { l: 'Beverages', c: 'var(--accent-500)' },
                  { l: 'Desserts', c: 'var(--secondary-500)' },
                ].map(s => (
                  <span key={s.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: s.c }} /> {s.l}
                  </span>
                ))}
              </div>
            </div>
            <StackedBars />
          </Card>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Category Mix</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 14 }}>Share of revenue</div>
            <CategoryDonut />
          </Card>
        </div>

        {/* Top products */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card padded={false}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-100)', fontSize: 14, fontWeight: 700 }}>Top Products</div>
            {[
              { name: 'Butter Chicken Bowl', sales: 142, rev: 45440 },
              { name: 'Veg Biryani',         sales: 156, rev: 43680 },
              { name: 'Masala Chai',         sales: 234, rev: 14040 },
              { name: 'Paneer Tikka Wrap',   sales: 98,  rev: 23520 },
              { name: 'Dal Makhani',         sales: 110, rev: 24200 },
            ].map((p, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: i === 0 ? 'var(--gradient-primary)' : 'var(--gray-100)', color: i === 0 ? 'white' : 'var(--gray-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>{p.sales} sold</div>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>₹{p.rev.toLocaleString()}</div>
              </div>
            ))}
          </Card>
          <Card padded={false}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-100)', fontSize: 14, fontWeight: 700 }}>Customer Cohorts</div>
            <div style={{ padding: 20 }}>
              <PerfBar label="New Customers"     value={24}  rawLabel="24" />
              <PerfBar label="Returning"         value={62}  rawLabel="62" />
              <PerfBar label="VIP (5+ orders)"   value={14}  rawLabel="14" last />
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: 12, fontSize: 11, color: 'var(--gray-500)' }}>
              <span>Total customers: <b style={{ color: 'var(--gray-900)' }}>89</b></span>
              <span>·</span>
              <span>Active this month: <b style={{ color: 'var(--gray-900)' }}>62</b></span>
            </div>
          </Card>
        </div>
      </AppShell>
    </div>
  );
}

function StackedBars() {
  const data = [
    { l: 'Jan', a: 80, b: 30, c: 20 },
    { l: 'Feb', a: 95, b: 35, c: 22 },
    { l: 'Mar', a: 110, b: 45, c: 28 },
    { l: 'Apr', a: 130, b: 50, c: 30 },
    { l: 'May', a: 155, b: 60, c: 35 },
    { l: 'Jun', a: 175, b: 70, c: 38 },
  ];
  const max = 300;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, paddingTop: 10 }}>
      {data.map((d, i) => {
        const total = d.a + d.b + d.c;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
              <div style={{ height: `${(d.c / max) * 100}%`, background: 'var(--secondary-500)' }} />
              <div style={{ height: `${(d.b / max) * 100}%`, background: 'var(--accent-500)' }} />
              <div style={{ height: `${(d.a / max) * 100}%`, background: 'var(--primary-500)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>{d.l}</div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 700, marginTop: -4 }}>₹{total}k</div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryDonut() {
  const slices = [
    { l: 'Mains', v: 58, c: 'var(--primary-500)' },
    { l: 'Beverages', v: 22, c: 'var(--accent-500)' },
    { l: 'Desserts', v: 12, c: 'var(--secondary-500)' },
    { l: 'Starters', v: 8, c: 'var(--info-500)' },
  ];
  const r = 60, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--gray-100)" strokeWidth="14" />
        {slices.map((s, i) => {
          const len = (c * s.v) / 100;
          const dasharray = `${len} ${c - len}`;
          const dashoffset = -((c * acc) / 100);
          acc += s.v;
          return (
            <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={s.c} strokeWidth="14"
              strokeDasharray={dasharray} strokeDashoffset={dashoffset} transform="rotate(-90 80 80)" strokeLinecap="butt" />
          );
        })}
        <text x="80" y="80" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="800" fill="var(--gray-900)">₹3.2L</text>
        <text x="80" y="100" textAnchor="middle" fontSize="10" fill="var(--gray-500)" fontWeight="600">total revenue</text>
      </svg>
      <div style={{ marginTop: 16, width: '100%' }}>
        {slices.map(s => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.c }} />
            <span style={{ flex: 1, color: 'var(--gray-700)', fontWeight: 600 }}>{s.l}</span>
            <span style={{ fontWeight: 700 }}>{s.v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 08 SETTINGS (desktop) — settings layout
// ─────────────────────────────────────────────────────────────
function SettingsDesktop() {
  return (
    <div data-screen-label="08 Settings">
      <AppShell active="settings" title="Settings" subtitle="Manage your business and account preferences">
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Settings nav */}
          <div style={{ background: 'white', border: '1px solid var(--border-light)', borderRadius: 12, padding: 8, position: 'sticky', top: 80 }}>
            {[
              { label: 'Business Profile', a: true },
              { label: 'Team & Permissions' },
              { label: 'Payment Methods' },
              { label: 'Tax & Compliance' },
              { label: 'Notifications' },
              { label: 'Integrations' },
              { label: 'API & Webhooks' },
              { label: 'Billing' },
            ].map(s => (
              <a key={s.label} href="#" onClick={e => e.preventDefault()} style={{
                display: 'block', padding: '10px 14px', borderRadius: 8,
                background: s.a ? 'var(--primary-50)' : 'transparent',
                color: s.a ? 'var(--primary-700)' : 'var(--gray-700)',
                fontSize: 13, fontWeight: s.a ? 600 : 500, textDecoration: 'none',
              }}>{s.label}</a>
            ))}
          </div>
          {/* Settings content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Business Profile</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>Public information about your kitchen</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'var(--bg-tertiary)', borderRadius: 10, marginBottom: 18 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 24, fontWeight: 800 }}>K</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Logo</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>PNG or JPG · max 2MB · square recommended</div>
                </div>
                <button style={ghostDBtnStyle}>Upload</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <DField label="Business Name" value="Priya's Kitchen Co." />
                <DField label="Tagline" value="Home-cooked, delivered fresh" />
                <DField label="Email" value="hello@kitchenco.in" />
                <DField label="Phone" value="+91 98200 12345" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <DField label="Address" value="Plot 12, Linking Road, Bandra West, Mumbai 400050" />
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Operating Hours</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>When orders can be placed</div>
                </div>
                <Badge tone="success">Open now</Badge>
              </div>
              {[
                { d: 'Monday',    h: '09:00 – 22:00', open: true },
                { d: 'Tuesday',   h: '09:00 – 22:00', open: true },
                { d: 'Wednesday', h: '09:00 – 22:00', open: true },
                { d: 'Thursday',  h: '09:00 – 22:00', open: true },
                { d: 'Friday',    h: '09:00 – 23:00', open: true },
                { d: 'Saturday',  h: '10:00 – 23:00', open: true },
                { d: 'Sunday',    h: 'Closed',        open: false },
              ].map(d => (
                <div key={d.d} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ width: 100, fontSize: 13, fontWeight: 600 }}>{d.d}</span>
                  <span style={{ flex: 1, fontSize: 13, color: d.open ? 'var(--gray-700)' : 'var(--gray-400)' }}>{d.h}</span>
                  <span style={{ width: 36, height: 20, borderRadius: 9999, background: d.open ? 'var(--primary-500)' : 'var(--gray-200)', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 2, left: d.open ? 18 : 2, width: 16, height: 16, borderRadius: 9999, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'all 200ms' }} />
                  </span>
                </div>
              ))}
            </Card>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={ghostDBtnStyle}>Cancel</button>
              <button style={primaryDBtnStyle}>Save Changes</button>
            </div>
          </div>
        </div>
      </AppShell>
    </div>
  );
}

Object.assign(window, {
  AppShell, LoginDesktop, DashboardDesktop, OrdersDesktop, InventoryDesktop, ProductsDesktop, VendorsDesktop, ReportsDesktop, SettingsDesktop,
});
