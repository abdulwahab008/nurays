// screens.jsx — All Operator mobile screens
// Loads after shared.jsx; reads BrandMark, AppHeader, TabBar, Avatar, Badge, IconBtn, SectionTitle, Card, Screen, I from window

const { useState: useS } = React;

// ─────────────────────────────────────────────────────────────
// 01 LOGIN — full hero, mirrors desktop Login.jsx for mobile
// ─────────────────────────────────────────────────────────────
function LoginScreen() {
  return (
    <div data-screen-label="01 Login" style={{ position: 'relative' }}>
      <IOSDevice width={402} height={874}>
        <div style={{
          minHeight: '100%', background: 'var(--gradient-hero)',
          padding: '70px 20px 40px', display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-sans)', position: 'relative', overflow: 'hidden',
        }}>
          {/* bokeh */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 40% 40%, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />

          {/* brand */}
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 36, color: 'white', position: 'relative' }}>
            <div style={{ display: 'inline-flex', marginBottom: 16 }}>
              <BrandMark size={64} />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Nurays</h1>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0, opacity: 0.92 }}>Run your kitchen like a pro.</p>
          </div>

          {/* card */}
          <div style={{
            background: 'white', borderRadius: 24, padding: 28,
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            position: 'relative', overflow: 'hidden',
          }}>
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--gradient-primary)' }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>Welcome back</h2>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 20px' }}>Sign in to your account</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lblS}>Email Address</label>
                <input style={inpS} value="priya@kitchenco.in" readOnly />
              </div>
              <div>
                <label style={lblS}>Password</label>
                <input style={inpS} type="password" value="••••••••" readOnly />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-600)' }}>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</a>
              </div>
              <button style={primaryBtnS}>Sign In</button>
              <div style={{ position: 'relative', textAlign: 'center', margin: '4px 0' }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--gray-200)' }} />
                <span style={{ position: 'relative', background: 'white', padding: '0 12px', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or</span>
              </div>
              <button style={ghostBtnS}>Continue with WhatsApp</button>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 24, color: 'rgba(255,255,255,0.85)', fontSize: 13, position: 'relative' }}>
            New here? <a href="#" onClick={e => e.preventDefault()} style={{ color: 'white', fontWeight: 700, textDecoration: 'none' }}>Create account</a>
          </div>
        </div>
      </IOSDevice>
    </div>
  );
}

const lblS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 };
const inpS = { width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--gray-300)', fontSize: 15, fontFamily: 'var(--font-sans)', boxSizing: 'border-box', outline: 'none', background: 'white' };
const primaryBtnS = { width: '100%', minHeight: 48, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.35)' };
const ghostBtnS = { width: '100%', minHeight: 48, background: 'white', color: 'var(--gray-700)', border: '1px solid var(--gray-300)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

// ─────────────────────────────────────────────────────────────
// 02 DASHBOARD — Variant A: Overview (KPI grid + activity feed)
// ─────────────────────────────────────────────────────────────
function DashboardOverview() {
  return (
    <Screen label="02 Dashboard · Overview" tab="home">
      {/* Hero header w/ greeting */}
      <div style={{
        background: 'var(--gradient-hero)',
        padding: '20px 16px 28px',
        marginTop: -54, paddingTop: 70,
        color: 'white', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.06) 0%, transparent 50%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={32} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Nurays</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <IconBtn dark dotCount={3}>{I.bell}</IconBtn>
            <Avatar name="Priya Sharma" size={36} color="rgba(255,255,255,0.25)" />
          </div>
        </div>
        <div style={{ marginTop: 18, position: 'relative' }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Good morning,</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>Priya 👋</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Here's how your business is doing today.</div>
        </div>
      </div>

      {/* Hero KPI floating card */}
      <div style={{ padding: '0 16px', marginTop: -16, position: 'relative' }}>
        <Card style={{ padding: 20 }}>
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--gradient-primary)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600 }}>Today's Revenue</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                ₹12,450
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--success-600)', fontSize: 12, fontWeight: 600 }}>
                {I.arrow_up} +8% vs yesterday
              </div>
            </div>
            <Sparkline />
          </div>
        </Card>
      </div>

      {/* 2x2 stat grid */}
      <div style={{ padding: '20px 16px 0' }}>
        <SectionTitle>Today's Snapshot</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <MiniStat label="Orders" value="24" change="+12%" tone="info" icon={I.bag} />
          <MiniStat label="Avg Order" value="₹520" change="+₹40" tone="primary" icon={I.rupee} />
          <MiniStat label="Pending" value="5" change="-1" tone="warning" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2" strokeLinecap="round"/></svg>} />
          <MiniStat label="Low Stock" value="8" change="-2" tone="error" icon={I.warn} negative />
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '24px 16px 0' }}>
        <SectionTitle>Quick Actions</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <QuickAction icon={I.plus} label="Add Item" bg="var(--accent-600)" />
          <QuickAction icon={I.list} label="New Order" bg="var(--primary-600)" />
          <QuickAction icon={I.chart} label="Reports" bg="var(--secondary-600)" />
          <QuickAction icon={I.cube} label="Restock" bg="var(--info-600)" />
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ padding: '24px 16px 16px' }}>
        <SectionTitle action="View all">Recent Activity</SectionTitle>
        <Card padded={false}>
          {[
            { tone: 'success', msg: <><b>New order</b> #ORD-001 from John Doe</>, time: '2 min ago' },
            { tone: 'warning', msg: <><b>Low stock:</b> Tomatoes (5 kg left)</>, time: '15 min ago' },
            { tone: 'success', msg: <>Order #ORD-002 <b>delivered</b></>, time: '1 hour ago' },
            { tone: 'info',    msg: <><b>New product</b> "Organic Carrots" added</>, time: '2 hours ago' },
          ].map((a, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, marginTop: 6, flexShrink: 0,
                background: a.tone === 'success' ? 'var(--success-500)' : a.tone === 'warning' ? 'var(--warning-500)' : 'var(--info-500)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.9)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.msg}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{a.time}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </Screen>
  );
}

function Sparkline() {
  // Mini sales sparkline — 6 monthly bars from codebase data
  const data = [12, 15, 18, 22, 25, 28]; // ₹k
  const max = 30;
  return (
    <svg width="92" height="60" viewBox="0 0 92 60">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="var(--primary-500)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline
        fill="none" stroke="var(--primary-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        points={data.map((v, i) => `${i * 18 + 2},${56 - (v / max) * 50}`).join(' ')}
      />
      <polygon
        fill="url(#spark)"
        points={`2,56 ${data.map((v, i) => `${i * 18 + 2},${56 - (v / max) * 50}`).join(' ')} ${(data.length - 1) * 18 + 2},56`}
      />
      {data.map((v, i) => (
        <circle key={i} cx={i * 18 + 2} cy={56 - (v / max) * 50} r={i === data.length - 1 ? 3 : 0} fill="var(--primary-600)" stroke="white" strokeWidth="1.5"/>
      ))}
    </svg>
  );
}

function MiniStat({ label, value, change, tone, icon, negative }) {
  const tones = {
    info: { bar: 'var(--gradient-accent)', iconBg: 'var(--accent-50)', iconFg: 'var(--accent-600)' },
    primary: { bar: 'var(--gradient-primary)', iconBg: 'var(--primary-50)', iconFg: 'var(--primary-600)' },
    warning: { bar: 'linear-gradient(135deg, #f59e0b, #d97706)', iconBg: 'var(--warning-50)', iconFg: '#b45309' },
    error: { bar: 'linear-gradient(135deg, #ef4444, #dc2626)', iconBg: 'var(--error-50)', iconFg: 'var(--error-600)' },
  };
  const t = tones[tone];
  return (
    <Card style={{ padding: 14 }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.bar }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: t.iconBg, color: t.iconFg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)' }}>{label}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: negative ? 'var(--error-600)' : 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
        {negative ? I.arrow_dn : I.arrow_up} {change}
      </div>
    </Card>
  );
}

function QuickAction({ icon, label, bg }) {
  return (
    <a href="#" onClick={e => e.preventDefault()} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      textDecoration: 'none', color: 'var(--fg-primary)',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: bg, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{label}</div>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// 03 DASHBOARD — Variant B: Action-first (focused tasks)
// ─────────────────────────────────────────────────────────────
function DashboardActionFirst() {
  return (
    <Screen label="03 Dashboard · Action-first" tab="home">
      <AppHeader
        title="Dashboard"
        subtitle="Tuesday, 6 May"
        leading={<Avatar name="Priya Sharma" size={36} />}
        trailing={<><IconBtn>{I.search}</IconBtn><IconBtn dotCount={3}>{I.bell}</IconBtn></>}
      />

      {/* Big revenue tile w/ chart */}
      <div style={{ padding: '16px 16px 0' }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 20, background: 'var(--gradient-primary)', color: 'white' }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>TODAY'S REVENUE</div>
            <div style={{ fontSize: 36, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>₹12,450</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{I.arrow_up} +8%</span>
              <span style={{ opacity: 0.8 }}>vs yesterday • 24 orders</span>
            </div>
          </div>
          <div style={{ padding: 16, display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {[15, 22, 18, 25, 30, 20, 12].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%', height: `${(v / 30) * 100}%`,
                    background: i === 4 ? 'var(--gradient-primary)' : 'var(--gray-200)',
                    borderRadius: '6px 6px 2px 2px',
                    transition: 'all 250ms',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>{['M','T','W','T','F','S','S'][i]}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Things needing attention */}
      <div style={{ padding: '20px 16px 0' }}>
        <SectionTitle action="See all">Needs your attention</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ActionCard
            tone="warning" icon={I.warn} count="8"
            title="Items running low"
            sub="Tomatoes, Bread, Yogurt + 5 more"
            cta="Restock"
          />
          <ActionCard
            tone="info" icon={I.bag} count="5"
            title="Pending orders"
            sub="3 awaiting confirmation"
            cta="Review"
          />
          <ActionCard
            tone="error" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>} count="2"
            title="Expiring this week"
            sub="Fresh Milk, Greek Yogurt"
            cta="Discount"
          />
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ padding: '20px 16px 0' }}>
        <SectionTitle>Today's Deliveries</SectionTitle>
        <Card padded={false}>
          {[
            { time: '11:00', name: 'Mike Wilson', addr: '789 Pine St', n: 2, tone: 'success', label: 'Delivered' },
            { time: '14:00', name: 'John Smith', addr: '123 Main St', n: 2, tone: 'info', label: 'Out for delivery' },
            { time: '16:30', name: 'Sarah Johnson', addr: '456 Oak Ave', n: 3, tone: 'warning', label: 'Preparing' },
          ].map((d, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', minWidth: 46 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{d.time.split(':')[0]}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>:{d.time.split(':')[1]}</div>
              </div>
              <div style={{ width: 1, height: 32, background: 'var(--gray-200)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {I.truck} {d.n} items • {d.addr}
                </div>
              </div>
              <Badge tone={d.tone} size="sm">{d.label}</Badge>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ padding: '20px 16px 16px' }}>
        <SectionTitle>Performance</SectionTitle>
        <Card>
          <PerfBar label="Order Fulfillment" value={94} suffix="%" />
          <PerfBar label="Customer Satisfaction" value={88} suffix="%" rawLabel="4.4/5" />
          <PerfBar label="Inventory Turnover" value={76} suffix="%" last />
        </Card>
      </div>
    </Screen>
  );
}

function ActionCard({ tone, icon, count, title, sub, cta }) {
  const tones = {
    warning: { bg: 'var(--warning-50)', fg: '#b45309', border: '#fbbf24' },
    info:    { bg: 'var(--info-50)',    fg: 'var(--info-700)', border: 'var(--info-300)' },
    error:   { bg: 'var(--error-50)',   fg: 'var(--error-700)', border: 'var(--error-300)' },
  };
  const t = tones[tone];
  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border-light)', padding: 14, display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
        {icon}
        <span style={{ position: 'absolute', top: -4, right: -4, background: t.fg, color: 'white', borderRadius: 9999, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 16, textAlign: 'center', boxShadow: '0 0 0 2px white' }}>{count}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 1 }}>{sub}</div>
      </div>
      <button style={{ padding: '8px 14px', borderRadius: 9999, border: 'none', background: 'var(--gray-900)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{cta}</button>
    </div>
  );
}

function PerfBar({ label, value, suffix, rawLabel, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--gray-700)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{rawLabel || `${value}${suffix}`}</span>
      </div>
      <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: 'var(--gradient-primary)' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 04 INVENTORY LIST
// ─────────────────────────────────────────────────────────────
function InventoryScreen() {
  const items = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', stock: 25.5, max: 50, unit: 'kg', vendor: 'Fresh Farm Produce', status: 'in', expiry: '20 May' },
    { name: 'Artisan Bread', cat: 'Bakery', stock: 8, max: 20, unit: 'loaves', vendor: 'Artisan Bakery Co.', status: 'low', expiry: '17 May' },
    { name: 'Fresh Milk', cat: 'Dairy', stock: 0, max: 100, unit: 'L', vendor: 'Dairy Fresh Ltd.', status: 'out', expiry: '18 May' },
    { name: 'Organic Apples', cat: 'Fruits', stock: 15.2, max: 30, unit: 'kg', vendor: 'Fresh Farm Produce', status: 'in', expiry: '25 May' },
    { name: 'Greek Yogurt', cat: 'Dairy', stock: 3, max: 40, unit: 'cups', vendor: 'Dairy Fresh Ltd.', status: 'low', expiry: '22 May' },
  ];
  const statusMap = {
    in:  { label: 'In Stock',     tone: 'success' },
    low: { label: 'Low Stock',    tone: 'warning' },
    out: { label: 'Out of Stock', tone: 'error' },
  };
  return (
    <Screen label="04 Inventory" tab="inventory">
      <AppHeader title="Inventory" subtitle="156 items • ₹84,320 value" trailing={<><IconBtn>{I.search}</IconBtn><IconBtn>{I.plus}</IconBtn></>} />

      {/* Quick stats strip */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <PillStat label="In Stock" value="142" tone="success" />
        <PillStat label="Low" value="8" tone="warning" />
        <PillStat label="Out" value="6" tone="error" />
      </div>

      {/* Filter chips */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['All', 'Vegetables', 'Bakery', 'Dairy', 'Fruits', 'Spices'].map((c, i) => (
          <span key={c} style={{
            padding: '6px 12px', borderRadius: 9999,
            background: i === 0 ? 'var(--gray-900)' : 'white',
            color: i === 0 ? 'white' : 'var(--gray-700)',
            border: i === 0 ? 'none' : '1px solid var(--border-light)',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{c}</span>
        ))}
      </div>

      {/* Items list */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const pct = (it.stock / it.max) * 100;
          const s = statusMap[it.status];
          return (
            <Card key={i} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{it.name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ padding: '1px 6px', background: 'var(--gray-100)', borderRadius: 4, fontWeight: 600, color: 'var(--gray-700)' }}>{it.cat}</span>
                    <span>·</span>
                    <span>{it.vendor}</span>
                  </div>
                </div>
                <Badge tone={s.tone} size="sm">{s.label}</Badge>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{it.stock} <span style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 500 }}>/ {it.max} {it.unit}</span></span>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Exp {it.expiry}</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(pct, 2)}%`, height: '100%',
                    background: pct === 0 ? 'var(--error-500)' : pct < 30 ? 'var(--warning-500)' : 'var(--gradient-primary)',
                  }} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}

function PillStat({ label, value, tone }) {
  const colors = {
    success: 'var(--success-600)', warning: '#b45309', error: 'var(--error-600)',
  };
  return (
    <Card style={{ padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors[tone], letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray-600)', fontWeight: 600, marginTop: 4 }}>{label}</div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 05 ORDERS LIST
// ─────────────────────────────────────────────────────────────
function OrdersScreen() {
  const orders = [
    { id: 'ORD-001', name: 'John Smith', time: '10:30 AM', items: 2, total: 16.25, status: 'pending' },
    { id: 'ORD-002', name: 'Sarah Johnson', time: '9:15 AM', items: 3, total: 26.75, status: 'confirmed' },
    { id: 'ORD-003', name: 'Mike Wilson', time: 'Yesterday', items: 2, total: 28.00, status: 'delivered' },
    { id: 'ORD-004', name: 'Emily Davis', time: 'Yesterday', items: 1, total: 13.25, status: 'cancelled' },
    { id: 'ORD-005', name: 'Rahul Verma', time: 'Yesterday', items: 4, total: 42.50, status: 'preparing' },
    { id: 'ORD-006', name: 'Anita Patel', time: '2 days', items: 2, total: 19.00, status: 'delivered' },
  ];
  const statusMap = {
    pending: { label: 'Pending', tone: 'warning' },
    confirmed: { label: 'Confirmed', tone: 'info' },
    preparing: { label: 'Preparing', tone: 'accent' },
    delivered: { label: 'Delivered', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'error' },
  };
  return (
    <Screen label="05 Orders" tab="orders">
      <AppHeader title="Orders" subtitle="24 today • 5 pending" trailing={<><IconBtn>{I.search}</IconBtn><IconBtn>{I.filter}</IconBtn></>} />

      {/* Tab strip */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 0, borderBottom: '1px solid var(--border-light)' }}>
        {[
          { l: 'All', n: 24, a: true },
          { l: 'Pending', n: 5 },
          { l: 'Preparing', n: 3 },
          { l: 'Ready', n: 2 },
          { l: 'Delivered', n: 14 },
        ].map((t, i) => (
          <button key={i} style={{
            background: 'transparent', border: 'none', padding: '8px 12px',
            fontSize: 13, fontWeight: t.a ? 700 : 500,
            color: t.a ? 'var(--primary-600)' : 'var(--gray-500)',
            position: 'relative', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {t.l}
            <span style={{ background: t.a ? 'var(--primary-100)' : 'var(--gray-100)', color: t.a ? 'var(--primary-700)' : 'var(--gray-600)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999 }}>{t.n}</span>
            {t.a && <span style={{ position: 'absolute', bottom: -1, left: 12, right: 12, height: 2, background: 'var(--primary-500)', borderRadius: 2 }} />}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orders.map((o, i) => {
          const s = statusMap[o.status];
          return (
            <Card key={i} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '1px 6px', borderRadius: 4 }}>{o.id}</span>
                    <Badge tone={s.tone} size="sm">{s.label}</Badge>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{o.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{o.time} • {o.items} items</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>₹{(o.total * 83).toFixed(0)}</div>
                  <div style={{ color: 'var(--gray-400)', marginTop: 4 }}>{I.chevron}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// 06 ORDER DETAIL
// ─────────────────────────────────────────────────────────────
function OrderDetailScreen() {
  return (
    <Screen label="06 Order Detail">
      <AppHeader title="Order ORD-001" leading={<IconBtn>{I.back}</IconBtn>} trailing={<IconBtn>{I.more}</IconBtn>} />

      {/* Status timeline */}
      <div style={{ padding: '16px' }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>STATUS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-700)', marginTop: 2 }}>Out for Delivery</div>
            </div>
            <Badge tone="info">ETA 14:00</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {['Placed', 'Confirmed', 'Preparing', 'Out', 'Delivered'].map((step, i) => {
              const done = i < 4;
              const active = i === 3;
              return (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 9999,
                      background: done ? 'var(--primary-500)' : 'var(--gray-200)',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: active ? '0 0 0 4px var(--primary-100)' : 'none',
                    }}>{done ? I.check : <span style={{ width: 6, height: 6, background: 'var(--gray-400)', borderRadius: 9999 }} />}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: done ? 'var(--gray-700)' : 'var(--gray-400)' }}>{step}</div>
                  </div>
                  {i < 4 && <div style={{ flex: 1, height: 2, background: i < 3 ? 'var(--primary-500)' : 'var(--gray-200)' }} />}
                </React.Fragment>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Customer */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle>Customer</SectionTitle>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="John Smith" size={48} color="var(--gradient-accent)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>John Smith</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>+1-555-0101 · john.smith@email.com</div>
            </div>
            <button style={{ ...iconCircle, background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-100)', fontSize: 12, color: 'var(--gray-700)', display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--gray-400)' }}>📍</span>
            123 Main St, Bandra West, Mumbai 400050
          </div>
        </Card>
      </div>

      {/* Items */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle>Items (2)</SectionTitle>
        <Card padded={false}>
          {[
            { name: 'Organic Tomatoes', qty: '2 kg', price: 706 },
            { name: 'Fresh Bread', qty: '1 loaf', price: 353 },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🥕</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{it.qty}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>₹{it.price}</div>
            </div>
          ))}
          <div style={{ padding: 16, background: 'var(--gray-50)', borderTop: '1px solid var(--gray-100)' }}>
            <SummaryRow label="Subtotal" value="₹1,059" />
            <SummaryRow label="Delivery Fee" value="₹290" />
            <SummaryRow label="Total" value="₹1,349" total />
          </div>
        </Card>
      </div>

      {/* Action */}
      <div style={{ padding: '0 16px 24px', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, minHeight: 48, background: 'white', border: '1px solid var(--border-medium)', borderRadius: 12, fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>Print Receipt</button>
        <button style={{ flex: 1.4, minHeight: 48, background: 'var(--gradient-primary)', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.3)' }}>Mark as Delivered</button>
      </div>
    </Screen>
  );
}

const iconCircle = { width: 36, height: 36, borderRadius: 9999, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

function SummaryRow({ label, value, total }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: total ? 15 : 13, fontWeight: total ? 800 : 500, color: total ? 'var(--fg-primary)' : 'var(--gray-600)', borderTop: total ? '1px dashed var(--gray-300)' : 'none', marginTop: total ? 6 : 0, paddingTop: total ? 8 : 4 }}>
      <span>{label}</span>
      <span style={{ color: total ? 'var(--primary-700)' : 'inherit' }}>{value}</span>
    </div>
  );
}

Object.assign(window, {
  LoginScreen, DashboardOverview, DashboardActionFirst, InventoryScreen, OrdersScreen, OrderDetailScreen,
});
