// screens-extra.jsx — Remaining 11 screens for Operator Clean direction
// Reads window.IMG, window.I (icons), window.Phone, window.SectionTitle from the host

const { IMG, I, Phone, SectionTitle, StatCard, ActiveOrder, ProductTile } = window;

// ============================================================
// 01 — LOGIN
// ============================================================
function Login() {
  return (
    <div data-screen-label="01 Login" style={{ position: 'relative' }}>
      <window.IOSDevice width={402} height={874} statusBarStyle="dark">
        <div style={{ minHeight: '100%', background: '#fff', display: 'flex', flexDirection: 'column', padding: '70px 24px 40px' }}>
          {/* Hero illustration area */}
          <div style={{ aspectRatio: '1.2/1', background: 'linear-gradient(135deg, #FFE5E7 0%, #FFF6F7 100%)', borderRadius: 28, position: 'relative', overflow: 'hidden', marginTop: 20 }}>
            <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.92 }} />
            <div style={{ position: 'absolute', top: 16, left: 16, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '5px 11px', borderRadius: 99, letterSpacing: '0.04em' }}>NURAYS</div>
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Welcome back 👋</div>
            <div style={{ fontSize: 14, color: 'var(--gray-5)', marginTop: 6 }}>Sign in to manage your kitchen.</div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Email" value="priya@kitchenco.in" />
            <Field label="Password" value="••••••••••" type="password" hasIcon />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 6 6L20 6"/></svg>
                </span>
                Remember me
              </label>
              <button style={{ color: 'var(--brand)', fontWeight: 600 }}>Forgot?</button>
            </div>

            <button style={{ marginTop: 8, height: 54, borderRadius: 16, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 6px 16px -4px rgba(230, 57, 70, 0.4)' }}>Sign in</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--gray-4)', fontSize: 11, fontWeight: 600, margin: '6px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--gray-2)' }} /> OR <div style={{ flex: 1, height: 1, background: 'var(--gray-2)' }} />
            </div>

            <button style={{ height: 50, borderRadius: 16, background: 'var(--gray-1)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>W</span>
              Continue with WhatsApp
            </button>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 13, color: 'var(--gray-5)', textAlign: 'center' }}>
            New to Nurays? <button style={{ color: 'var(--brand)', fontWeight: 700 }}>Create account</button>
          </div>
        </div>
      </window.IOSDevice>
    </div>
  );
}

function Field({ label, value, type, hasIcon }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-5)', marginBottom: 6, marginLeft: 4 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input type={type === 'password' ? 'password' : 'text'} defaultValue={value} style={{
          width: '100%', height: 52, padding: '0 16px',
          paddingRight: hasIcon ? 48 : 16,
          background: 'var(--gray-1)', border: '1px solid var(--gray-2)', borderRadius: 16,
          fontSize: 15, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
          boxSizing: 'border-box',
        }} />
        {hasIcon && <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-4)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </span>}
      </div>
    </div>
  );
}

// ============================================================
// 03 — ACTION-FIRST DASHBOARD
// ============================================================
function DashAction() {
  return (
    <Phone label="03 Action-first" tab="home" fab>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontSize: 12, color: 'var(--gray-5)', fontWeight: 500 }}>Tuesday · 6 May</div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 2, lineHeight: 1.1 }}>
          Needs your attention
        </div>
      </div>

      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ActionCard
          tone="orange"
          icon={I.alert}
          count={8}
          title="Items running low"
          sub="Tomatoes, Bread, Yogurt + 5 more"
          cta="Restock"
        />
        <ActionCard
          tone="red"
          icon={I.bag}
          count={5}
          title="Pending orders"
          sub="3 awaiting your confirmation"
          cta="Review"
        />
        <ActionCard
          tone="dark"
          icon={I.alert}
          count={2}
          title="Expiring this week"
          sub="Fresh Milk, Greek Yogurt"
          cta="Discount"
        />
      </div>

      <div style={{ padding: '24px 20px 0' }}>
        <SectionTitle action="See all">Today's deliveries</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 20, padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {[
            { time: '11:00', name: 'Mike Wilson', img: IMG.mike, addr: '789 Pine St', tone: 'green', label: 'Delivered' },
            { time: '14:00', name: 'John Smith', img: IMG.john, addr: '123 Main St', tone: 'red', label: 'En route' },
            { time: '16:30', name: 'Sarah Johnson', img: IMG.sarah, addr: '456 Oak Ave', tone: 'orange', label: 'Prep' },
          ].map((d, i, arr) => {
            const tones = { green: { bg: 'var(--green-soft)', fg: 'var(--green)' }, red: { bg: 'var(--red-soft)', fg: 'var(--brand)' }, orange: { bg: 'var(--orange-soft)', fg: 'var(--orange)' } };
            const c = tones[d.tone];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <div style={{ width: 48, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{d.time}</div>
                <img src={d.img} alt="" style={{ width: 36, height: 36, borderRadius: 12, objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 1 }}>{d.addr}</div>
                </div>
                <span style={{ background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 99 }}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '24px 20px 24px' }}>
        <SectionTitle>Today's progress</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 20, padding: 18, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>Revenue today</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 4 }}>₹12,450</div>
            </div>
            <span style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>+8.4%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70, marginTop: 14 }}>
            {[15, 22, 18, 25, 30, 20, 12].map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / 30) * 100}%`, background: i === 4 ? 'var(--brand)' : 'var(--gray-2)', borderRadius: 6, minHeight: 6 }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--gray-4)', fontWeight: 600 }}>
            <span>9am</span><span>11</span><span>1pm</span><span>3</span><span>5pm</span><span>7</span><span>9pm</span>
          </div>
        </div>
      </div>
    </Phone>
  );
}

function ActionCard({ tone, icon, count, title, sub, cta }) {
  const tones = {
    orange: { bg: '#FFF8F0', accent: 'var(--orange)', soft: 'var(--orange-soft)' },
    red:    { bg: '#FFF6F7', accent: 'var(--brand)',  soft: 'var(--red-soft)' },
    dark:   { bg: '#1F1F1F', accent: '#fff', text: '#fff', soft: 'rgba(255,255,255,0.12)', dark: true },
  };
  const c = tones[tone];
  return (
    <div style={{
      background: c.bg, color: c.text || 'var(--ink)',
      borderRadius: 20, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14,
      border: c.dark ? 'none' : '1px solid var(--gray-2)',
      boxShadow: c.dark ? '0 8px 20px -6px rgba(15,20,25,0.25)' : 'var(--shadow-sm)',
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: c.soft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>
        {count}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text || 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 12, color: c.dark ? 'rgba(255,255,255,0.65)' : 'var(--gray-5)', marginTop: 2 }}>{sub}</div>
      </div>
      <button style={{
        background: c.dark ? '#fff' : c.accent, color: c.dark ? 'var(--ink)' : '#fff',
        fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 12,
      }}>{cta}</button>
    </div>
  );
}

// ============================================================
// 06 — ORDER DETAIL
// ============================================================
function OrderDetail() {
  return (
    <Phone label="06 Order detail">
      {/* Header */}
      <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>{I.back}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>ORD-001 · 2 items</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>Order details</div>
        </div>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>{I.more}</button>
      </div>

      {/* Status hero */}
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{
          background: 'var(--brand)', color: '#fff', borderRadius: 22, padding: 18,
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 24px -6px rgba(230, 57, 70, 0.4)',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 4, background: '#fff', display: 'inline-block' }} />
                LIVE STATUS
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', marginTop: 6 }}>Out for delivery</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.18)', padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
              ETA 14:00
            </div>
          </div>

          {/* Progress */}
          <div style={{ marginTop: 20, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 11, left: 11, right: 11, height: 2, background: 'rgba(255,255,255,0.25)' }} />
            <div style={{ position: 'absolute', top: 11, left: 11, width: 'calc(75% - 11px)', height: 2, background: '#fff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {['Placed', 'Confirmed', 'Prep', 'Out', 'Done'].map((s, i) => {
                const done = i < 4;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: done ? '#fff' : 'transparent',
                      border: done ? 'none' : '2px solid rgba(255,255,255,0.4)',
                      color: 'var(--brand)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 6 6L20 6"/></svg>}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: done ? '#fff' : 'rgba(255,255,255,0.55)' }}>{s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ padding: '20px 20px 0' }}>
        <SectionTitle>Customer</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 20, padding: 14, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={IMG.john} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>John Smith</div>
              <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>+91 98765 43210</div>
            </div>
            <button style={{ background: 'var(--green)', color: '#fff', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5c0-1 1-2 2-2h3l2 5-3 1c1 3 3 5 6 6l1-3 5 2v3c0 1-1 2-2 2C9 19 5 15 3 5Z"/></svg>
            </button>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: 'var(--brand)', marginTop: 2 }}>📍</span>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>123 Main Street, Bandra West<br />Mumbai 400050</div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: '20px 20px 0' }}>
        <SectionTitle>Items · 2</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 20, padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {[
            { n: 'Organic Tomatoes', q: '2 kg', p: 706, img: IMG.tomatoes },
            { n: 'Artisan Bread', q: '1 loaf', p: 353, img: IMG.bread },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
              <img src={it.img} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{it.n}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>{it.q}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)' }}>₹{it.p}</div>
            </div>
          ))}
          <div style={{ padding: '12px 14px', background: 'var(--gray-1)', borderRadius: 16, margin: 4 }}>
            <Row l="Subtotal" v="₹1,059" />
            <Row l="Delivery" v="₹290" />
            <Row l="Total" v="₹1,349" total />
          </div>
        </div>
      </div>

      {/* Bottom action sheet */}
      <div style={{ padding: '20px 20px 24px', display: 'flex', gap: 10 }}>
        <button style={{ flex: 1, height: 52, borderRadius: 16, background: '#fff', border: '1px solid var(--gray-3)', color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>Print receipt</button>
        <button style={{ flex: 1, height: 52, borderRadius: 16, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 6px 16px -4px rgba(230, 57, 70, 0.4)' }}>Mark delivered</button>
      </div>
    </Phone>
  );
}

function Row({ l, v, total }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: total ? 15 : 13, borderTop: total ? '1px solid var(--gray-2)' : 'none', marginTop: total ? 6 : 0, paddingTop: total ? 10 : 4 }}>
      <span style={{ color: total ? 'var(--ink)' : 'var(--gray-5)', fontWeight: total ? 700 : 500 }}>{l}</span>
      <span style={{ color: total ? 'var(--brand)' : 'var(--ink)', fontWeight: total ? 800 : 600, fontFamily: total ? 'Plus Jakarta Sans, Inter, sans-serif' : 'inherit' }}>{v}</span>
    </div>
  );
}

// ============================================================
// 07 — PRODUCTS
// ============================================================
function Products() {
  const products = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', price: 436, sold: 42, img: IMG.tomatoes, badge: '🔥 Hot' },
    { name: 'Artisan Bread', cat: 'Bakery', price: 353, sold: 28, img: IMG.bread, badge: 'Low' },
    { name: 'Greek Yogurt', cat: 'Dairy', price: 332, sold: 22, img: IMG.yogurt, badge: 'Low' },
    { name: 'Organic Apples', cat: 'Fruits', price: 540, sold: 35, img: IMG.apples },
    { name: 'Fresh Milk', cat: 'Dairy', price: 311, sold: 0, img: IMG.milk, badge: 'Out' },
    { name: 'Organic Carrots', cat: 'Vegetables', price: 290, sold: 18, img: IMG.carrots, badge: 'New' },
  ];
  const badgeTone = (b) => {
    if (b === '🔥 Hot' || b === 'New') return { bg: '#fff', fg: 'var(--ink)' };
    if (b === 'Low') return { bg: 'var(--orange)', fg: '#fff' };
    if (b === 'Out') return { bg: 'var(--brand)', fg: '#fff' };
    return { bg: '#fff', fg: 'var(--ink)' };
  };
  return (
    <Phone label="07 Products" tab="more" fab>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Products</div>
            <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>156 listed · 4 drafts</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.search}</button>
          </div>
        </div>
      </div>

      {/* Pills tab */}
      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 4, background: 'var(--gray-1)', margin: '14px 20px 0', borderRadius: 14, padding: 4 }}>
        {[{ l: 'Active', n: 156, a: true }, { l: 'Drafts', n: 4 }, { l: 'Archived', n: 12 }].map((tab, i) => (
          <button key={i} style={{
            flex: 1, padding: '10px 8px', borderRadius: 10,
            background: tab.a ? '#fff' : 'transparent',
            color: tab.a ? 'var(--ink)' : 'var(--gray-5)',
            fontSize: 13, fontWeight: tab.a ? 700 : 600,
            boxShadow: tab.a ? 'var(--shadow-sm)' : 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {tab.l}
            <span style={{ fontSize: 11, color: tab.a ? 'var(--gray-4)' : 'var(--gray-4)', fontWeight: 600 }}>{tab.n}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: '16px 20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {products.map((p, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ position: 'relative', aspectRatio: '1.05/1' }}>
              <img src={p.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {p.badge && (() => {
                const t = badgeTone(p.badge);
                return <div style={{ position: 'absolute', top: 8, left: 8, background: t.bg, color: t.fg, fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 99, boxShadow: 'var(--shadow-sm)' }}>{p.badge}</div>;
              })()}
              <button style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.92)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.more}</button>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.cat}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 2, lineHeight: 1.2 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)' }}>₹{p.price}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)' }}>{p.sold} sold</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ============================================================
// 08 — PRODUCT DETAIL
// ============================================================
function ProductDetail() {
  return (
    <Phone label="08 Product detail">
      {/* Hero image */}
      <div style={{ position: 'relative', height: 280, marginTop: -50 }}>
        <img src={IMG.bread} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 60, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
          <button style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.back}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.more}</button>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
          <span style={{ background: 'var(--orange)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '5px 11px', borderRadius: 99 }}>Low stock · 8 loaves</span>
        </div>
      </div>

      {/* Content sheet (slides up over image) */}
      <div style={{ background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, padding: '20px 20px 0', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bakery</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 4 }}>Artisan Bread</div>
            <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--orange)' }}>{I.star}</span>
              <span style={{ color: 'var(--ink)', fontWeight: 700 }}>4.8</span>
              <span>· 142 reviews</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)', letterSpacing: '-0.02em' }}>₹353</div>
            <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>per loaf</div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Hand-crafted sourdough, baked fresh daily with organic flour and a 24-hour fermentation.
        </div>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 18 }}>
          {[
            { l: 'On hand', v: '8', sub: 'loaves' },
            { l: 'Sold today', v: '24', sub: 'units' },
            { l: 'Margin', v: '54%', sub: '₹125' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--gray-1)', borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>{s.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 2, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: 'var(--gray-5)', marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Vendor */}
        <SectionTitle>Vendor</SectionTitle>
        <div style={{ background: 'var(--gray-1)', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>AB</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Artisan Bakery Co.</div>
            <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--orange)' }}>{I.star}</span> 4.9 · 12 products
            </div>
          </div>
          <span style={{ color: 'var(--gray-4)' }}>{I.chev}</span>
        </div>
      </div>

      {/* Bottom action */}
      <div style={{ padding: '14px 20px 24px', background: '#fff', display: 'flex', gap: 10 }}>
        <button style={{ height: 52, padding: '0 18px', borderRadius: 16, background: '#fff', border: '1px solid var(--gray-3)', color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>Edit</button>
        <button style={{ flex: 1, height: 52, borderRadius: 16, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 6px 16px -4px rgba(230, 57, 70, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
          <span>Restock now</span>
          <span>+12 loaves</span>
        </button>
      </div>
    </Phone>
  );
}

window.LoginScreen = Login;
window.DashAction = DashAction;
window.OrderDetail = OrderDetail;
window.Products = Products;
window.ProductDetail = ProductDetail;
