// screens.jsx — All 14 operator screens, factory-style.
// Each screen function takes no theme arg; uses useT() from chrome.

const { Fragment } = React;

// ──────────────────────────────────────────────────────────
// 01 LOGIN
// ──────────────────────────────────────────────────────────
function S_Login() {
  const t = useT();
  const m = t.motif;
  const inp = {
    width: '100%', minHeight: 44, padding: '12px 14px',
    border: `1px solid ${t.border}`, borderRadius: t.radius,
    background: t.surface, color: t.fg, fontSize: 14,
    fontFamily: t.fontBody, outline: 'none', boxSizing: 'border-box',
  };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.fgMuted, display: 'block', marginBottom: 6, fontFamily: t.fontBody };

  return (
    <ThemeProvider theme={t}>
      <div data-screen-label="01 Login" style={{ position: 'relative' }}>
        <IOSDevice width={402} height={874} statusBarStyle={t.statusBarStyle}>
          <div style={{ minHeight: '100%', background: t.bg, color: t.fg, fontFamily: t.fontBody, padding: '70px 24px 40px', display: 'flex', flexDirection: 'column' }}>
            {m === 'glow' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 30% 20%, ${t.accent}22 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${t.accent2}22 0%, transparent 50%)` }} />}
            {m === 'hatch' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: `repeating-linear-gradient(135deg, ${t.accent} 0 12px, ${t.fg} 12px 24px)` }} />}

            <div style={{ marginTop: 30, position: 'relative' }}>
              <div style={{ fontSize: 11, fontFamily: t.fontMono, color: t.accent, letterSpacing: '0.2em' }}>{m === 'rule' ? '— Vol. 1, No. 1 —' : 'NURAYS // V2.4'}</div>
              <div style={{ fontSize: m === 'rule' ? 56 : 40, fontFamily: t.fontDisp, fontWeight: m === 'rule' ? 400 : 800, letterSpacing: '-0.04em', marginTop: 8, lineHeight: 0.95 }}>
                {m === 'rule' ? <span style={{ fontStyle: 'italic' }}>Nurays.</span> : 'Nurays'}
              </div>
              <div style={{ fontSize: 13, color: t.fgMuted, marginTop: 8, maxWidth: 280, lineHeight: 1.4 }}>
                {t.tagline}
              </div>
            </div>

            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span style={lbl}>Email</span>
                <input style={inp} value="priya@kitchenco.in" readOnly />
              </div>
              <div>
                <span style={lbl}>Password</span>
                <input style={inp} type="password" value="••••••••" readOnly />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.fgMuted, marginTop: 4 }}>
                <span>☐ Remember me</span>
                <span style={{ color: t.accent, fontWeight: 600 }}>Forgot?</span>
              </div>
              <Button kind="primary" size="lg" full>Sign in →</Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: t.fgDim, fontSize: 10, fontFamily: t.fontMono, letterSpacing: '0.2em', margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: t.border }} /> OR <div style={{ flex: 1, height: 1, background: t.border }} />
              </div>
              <Button kind="secondary" size="lg" full>Continue with WhatsApp</Button>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 12, color: t.fgMuted, textAlign: 'center' }}>
              New here? <span style={{ color: t.accent, fontWeight: 700, textDecoration: m === 'rule' ? 'underline' : 'none' }}>Create account</span>
            </div>
          </div>
        </IOSDevice>
      </div>
    </ThemeProvider>
  );
}

// ──────────────────────────────────────────────────────────
// 02 DASHBOARD — overview
// ──────────────────────────────────────────────────────────
function S_Dashboard() {
  const t = useT();
  const m = t.motif;
  return (
    <Phone label="02 Dashboard" theme={t} tab="home">
      <Header
        title={m === 'rule' ? 'Today\'s edition' : 'Dashboard'}
        subtitle={m === 'rule' ? 'Tuesday · 6 May 2026' : 'TUE 06.05 · 09:42'}
        leading={<Avatar name="Priya Sharma" size={36} />}
        trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn dot>{ICN.bell}</IconBtn></>}
        big={m === 'rule'}
      />

      {/* Hero revenue */}
      <div style={{ padding: '14px 16px 0' }}>
        <Surface accent padded style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, color: t.fgMuted, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}>Today's revenue</div>
              <div style={{ marginTop: 6 }}><BigNum size={m === 'rule' ? 52 : 38} accent={m !== 'rule'}>₹12,450</BigNum></div>
              <div style={{ fontSize: 11, color: t.success, fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontFamily: t.fontMono }}>
                {ICN.up} +8% vs yesterday · 24 orders
              </div>
            </div>
            <Sparkline />
          </div>
        </Surface>
      </div>

      {/* Stat grid */}
      <div style={{ padding: '16px 16px 0' }}>
        <Eyebrow>Snapshot</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Mini label="Orders" v="24" delta="+12%" />
          <Mini label="Avg basket" v="₹520" delta="+₹40" />
          <Mini label="Pending" v="5" delta="−1" tone="warn" />
          <Mini label="Low stock" v="8" delta="+2" tone="error" />
        </div>
      </div>

      {/* Activity */}
      <div style={{ padding: '20px 16px 16px' }}>
        <Eyebrow action="View all">Recent activity</Eyebrow>
        <Surface padded={false}>
          {[
            { dot: t.success, msg: 'New order #ORD-001 from John Doe', time: '2m' },
            { dot: t.warn, msg: 'Low stock: Tomatoes (5 kg left)', time: '15m' },
            { dot: t.success, msg: 'Order #ORD-002 delivered', time: '1h' },
            { dot: t.accent3 || t.accent, msg: 'Product "Organic Carrots" added', time: '2h' },
          ].map((a, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <span style={{ width: 6, height: 6, borderRadius: m === 'glow' ? 9999 : 0, background: a.dot, marginTop: 7, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4, color: t.fg }}>{a.msg}</div>
              <Mono>{a.time}</Mono>
            </div>
          ))}
        </Surface>
      </div>
    </Phone>
  );
}

function Sparkline() {
  const t = useT();
  const data = [12, 15, 18, 22, 25, 28];
  return (
    <svg width="92" height="50" viewBox="0 0 92 50">
      <polyline fill="none" stroke={t.accent} strokeWidth="2" points={data.map((v, i) => `${i * 18 + 2},${46 - (v / 30) * 40}`).join(' ')} />
      <circle cx={5 * 18 + 2} cy={46 - (28 / 30) * 40} r="3" fill={t.accent} />
    </svg>
  );
}

function Mini({ label, v, delta, tone }) {
  const t = useT();
  const dColor = tone === 'warn' ? t.warn : tone === 'error' ? t.error : t.success;
  return (
    <Surface padded style={{ padding: 12 }}>
      <div style={{ fontSize: 10, color: t.fgMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ marginTop: 4 }}><BigNum size={22}>{v}</BigNum></div>
      <Mono color={dColor} size={10}>{delta}</Mono>
    </Surface>
  );
}

// ──────────────────────────────────────────────────────────
// 03 DASHBOARD — Action-first
// ──────────────────────────────────────────────────────────
function S_DashAction() {
  const t = useT();
  return (
    <Phone label="03 Action-first" theme={t} tab="home">
      <Header title="Needs your attention" subtitle="3 ITEMS · 4 DELIVERIES TODAY" leading={<Avatar name="P S" size={36} />} trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn dot>{ICN.bell}</IconBtn></>} />

      {/* Big revenue tile w/ bar chart */}
      <div style={{ padding: '14px 16px 0' }}>
        <Surface padded={false} accent>
          <div style={{ padding: 18, background: t.motif === 'glow' ? `linear-gradient(135deg, ${t.accent}11, transparent)` : 'transparent' }}>
            <Mono color={t.accent}>TODAY · LIVE</Mono>
            <div style={{ marginTop: 4 }}><BigNum size={42} accent>₹12,450</BigNum></div>
            <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 4 }}>+8% vs yesterday · 24 orders</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, padding: '0 14px 14px' }}>
            {[15, 22, 18, 25, 30, 20, 12].map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / 30) * 100}%`, background: i === 4 ? t.accent : t.border, borderRadius: t.radius }} />
            ))}
          </div>
        </Surface>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <Eyebrow action="See all">Action queue</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { tone: 'warn', count: '8', title: 'Items running low', sub: 'Tomatoes, Bread, Yogurt + 5 more', cta: 'Restock' },
            { tone: 'accent3', count: '5', title: 'Pending orders', sub: '3 awaiting confirmation', cta: 'Review' },
            { tone: 'error', count: '2', title: 'Expiring this week', sub: 'Fresh Milk, Greek Yogurt', cta: 'Discount' },
          ].map((a, i) => <ActRow key={i} {...a} />)}
        </div>
      </div>

      <div style={{ padding: '20px 16px 16px' }}>
        <Eyebrow>Today's deliveries</Eyebrow>
        <Surface padded={false}>
          {[
            { time: '11:00', name: 'Mike Wilson', addr: '789 Pine St', status: 'Delivered', tone: 'success' },
            { time: '14:00', name: 'John Smith', addr: '123 Main St', status: 'En route', tone: 'accent3' },
            { time: '16:30', name: 'Sarah Johnson', addr: '456 Oak Ave', status: 'Prep', tone: 'warn' },
          ].map((d, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center' }}>
              <Mono color={t.fg} size={13}>{d.time}</Mono>
              <div style={{ flex: 1 }}>
                <Lbl size={13}>{d.name}</Lbl>
                <div style={{ fontSize: 11, color: t.fgMuted }}>{d.addr}</div>
              </div>
              <Pill tone={d.tone} size="sm">{d.status}</Pill>
            </div>
          ))}
        </Surface>
      </div>
    </Phone>
  );
}

function ActRow({ tone, count, title, sub, cta }) {
  const t = useT();
  const c = tone === 'warn' ? t.warn : tone === 'error' ? t.error : (t.accent3 || t.accent);
  return (
    <Surface padded style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, background: t.motif === 'rule' ? 'transparent' : `${c}22`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', border: t.motif === 'rule' ? `1px solid ${c}` : 'none', borderRadius: t.radius }}>
        <BigNum size={18}>{count}</BigNum>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Lbl weight={700}>{title}</Lbl>
        <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2 }}>{sub}</div>
      </div>
      <Button kind="primary" size="sm">{cta}</Button>
    </Surface>
  );
}

// ──────────────────────────────────────────────────────────
// 04 INVENTORY
// ──────────────────────────────────────────────────────────
function S_Inventory() {
  const t = useT();
  const items = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', stock: 25.5, max: 50, unit: 'kg', exp: '20 May', status: 'in' },
    { name: 'Artisan Bread', cat: 'Bakery', stock: 8, max: 20, unit: 'loaves', exp: '17 May', status: 'low' },
    { name: 'Fresh Milk', cat: 'Dairy', stock: 0, max: 100, unit: 'L', exp: '18 May', status: 'out' },
    { name: 'Organic Apples', cat: 'Fruits', stock: 15.2, max: 30, unit: 'kg', exp: '25 May', status: 'in' },
    { name: 'Greek Yogurt', cat: 'Dairy', stock: 3, max: 40, unit: 'cups', exp: '22 May', status: 'low' },
  ];
  const sm = { in: { label: 'In stock', tone: 'success' }, low: { label: 'Low', tone: 'warn' }, out: { label: 'Out', tone: 'error' } };
  return (
    <Phone label="04 Inventory" theme={t} tab="inventory">
      <Header title="Inventory" subtitle="156 SKUS · ₹84.3K VALUE" trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn>{ICN.plus}</IconBtn></>} />

      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Mini label="In stock" v="142" delta="" />
        <Mini label="Low" v="8" delta="−2" tone="warn" />
        <Mini label="Out" v="6" delta="+1" tone="error" />
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['All', 'Vegetables', 'Bakery', 'Dairy', 'Fruits'].map((c, i) => (
          <Pill key={c} tone={i === 0 ? 'accent' : 'outline'} size="sm">{c}</Pill>
        ))}
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const pct = (it.stock / it.max) * 100;
          const s = sm[it.status];
          return (
            <Surface key={i} padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Lbl size={14} weight={700}>{it.name}</Lbl>
                  <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2 }}>{it.cat} · exp {it.exp}</div>
                </div>
                <Pill tone={s.tone} size="sm">{s.label}</Pill>
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div><BigNum size={18}>{it.stock}</BigNum> <Mono>/ {it.max} {it.unit}</Mono></div>
                <Mono color={t.fgMuted}>{Math.round(pct)}%</Mono>
              </div>
              <div style={{ marginTop: 6, height: 4, background: t.border, position: 'relative' }}>
                <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: pct === 0 ? t.error : pct < 30 ? t.warn : t.accent }} />
              </div>
            </Surface>
          );
        })}
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 05 ORDERS
// ──────────────────────────────────────────────────────────
function S_Orders() {
  const t = useT();
  const orders = [
    { id: 'ORD-001', name: 'John Smith', time: '10:30', items: 2, total: 1349, status: 'pending' },
    { id: 'ORD-002', name: 'Sarah Johnson', time: '09:15', items: 3, total: 2220, status: 'confirmed' },
    { id: 'ORD-003', name: 'Mike Wilson', time: 'Yest', items: 2, total: 2324, status: 'delivered' },
    { id: 'ORD-004', name: 'Emily Davis', time: 'Yest', items: 1, total: 1099, status: 'cancelled' },
    { id: 'ORD-005', name: 'Rahul Verma', time: 'Yest', items: 4, total: 3528, status: 'preparing' },
  ];
  const sm = {
    pending: { label: 'Pending', tone: 'warn' },
    confirmed: { label: 'Confirmed', tone: 'accent3' },
    preparing: { label: 'Preparing', tone: 'accent' },
    delivered: { label: 'Done', tone: 'success' },
    cancelled: { label: 'Cancel', tone: 'error' },
  };
  return (
    <Phone label="05 Orders" theme={t} tab="orders">
      <Header title="Orders" subtitle="24 TODAY · 5 PENDING" trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn>{ICN.filter}</IconBtn></>} />

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 0, borderBottom: `1px solid ${t.border}` }}>
        {[
          { l: 'All', n: 24, a: true }, { l: 'Pending', n: 5 }, { l: 'Prep', n: 3 }, { l: 'Ready', n: 2 }, { l: 'Done', n: 14 },
        ].map((tab, i) => (
          <div key={i} style={{ padding: '8px 10px', fontSize: 12, fontWeight: tab.a ? 700 : 500, color: tab.a ? t.accent : t.fgMuted, position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
            {tab.l} <Mono color={tab.a ? t.accent : t.fgMuted}>·{tab.n}</Mono>
            {tab.a && <span style={{ position: 'absolute', bottom: -1, left: 8, right: 8, height: 2, background: t.accent }} />}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {orders.map((o, i) => {
          const s = sm[o.status];
          return (
            <Surface key={i} padded style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <Mono color={t.accent}>{o.id}</Mono>
                  <Pill tone={s.tone} size="sm">{s.label}</Pill>
                </div>
                <Lbl size={14} weight={700}>{o.name}</Lbl>
                <div style={{ fontSize: 11, color: t.fgMuted }}>{o.time} · {o.items} items</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <BigNum size={16}>₹{o.total}</BigNum>
              </div>
              <span style={{ color: t.fgDim }}>{ICN.chev}</span>
            </Surface>
          );
        })}
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 06 ORDER DETAIL
// ──────────────────────────────────────────────────────────
function S_OrderDetail() {
  const t = useT();
  const m = t.motif;
  return (
    <Phone label="06 Order detail" theme={t}>
      <Header title="ORD-001" subtitle="₹1,349 · 2 ITEMS" leading={<IconBtn>{ICN.back}</IconBtn>} trailing={<IconBtn>{ICN.more}</IconBtn>} />

      <div style={{ padding: '14px 16px 0' }}>
        <Surface accent padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <Mono color={t.fgMuted}>STATUS</Mono>
              <div style={{ marginTop: 2 }}><Lbl size={18} weight={800} style={{ color: t.accent }}>Out for delivery</Lbl></div>
            </div>
            <Pill tone="accent" size="sm">ETA 14:00</Pill>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, gap: 0 }}>
            {['Placed', 'Confirm', 'Prep', 'Out', 'Done'].map((s, i) => {
              const done = i < 4;
              return (
                <Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 18, height: 18, background: done ? t.accent : t.border, color: t.accentInk, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: m === 'rule' ? 0 : t.radius }}>
                      {done && ICN.check}
                    </div>
                    <Mono size={9} color={done ? t.fg : t.fgDim}>{s}</Mono>
                  </div>
                  {i < 4 && <div style={{ flex: 1, height: 2, background: i < 3 ? t.accent : t.border, marginBottom: 14 }} />}
                </Fragment>
              );
            })}
          </div>
        </Surface>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <Eyebrow>Customer</Eyebrow>
        <Surface padded>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="John Smith" size={44} alt />
            <div style={{ flex: 1 }}>
              <Lbl size={14} weight={700}>John Smith</Lbl>
              <Mono>+1-555-0101</Mono>
            </div>
            <IconBtn>{ICN.bell}</IconBtn>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border}`, fontSize: 12, color: t.fgMuted }}>
            123 Main St, Bandra W, Mumbai 400050
          </div>
        </Surface>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <Eyebrow>Items · 2</Eyebrow>
        <Surface padded={false}>
          {[
            { n: 'Organic Tomatoes', q: '2 kg', p: 706 },
            { n: 'Fresh Bread', q: '1 loaf', p: 353 },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <PlaceholderImg size={36} />
              <div style={{ flex: 1 }}>
                <Lbl size={13}>{it.n}</Lbl>
                <Mono>{it.q}</Mono>
              </div>
              <BigNum size={14}>₹{it.p}</BigNum>
            </div>
          ))}
          <div style={{ padding: 14, background: t.surfaceAlt }}>
            <SummaryRow l="Subtotal" v="₹1,059" />
            <SummaryRow l="Delivery" v="₹290" />
            <SummaryRow l="Total" v="₹1,349" total />
          </div>
        </Surface>
      </div>

      <div style={{ padding: '16px 16px 24px', display: 'flex', gap: 8 }}>
        <Button kind="secondary" full>Print</Button>
        <Button kind="primary" full>Mark delivered</Button>
      </div>
    </Phone>
  );
}

function SummaryRow({ l, v, total }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: total ? 14 : 12, borderTop: total ? `1px solid ${t.border}` : 'none', marginTop: total ? 4 : 0, paddingTop: total ? 8 : 4 }}>
      <Lbl dim={!total} weight={total ? 800 : 500} size={total ? 14 : 12}>{l}</Lbl>
      <BigNum size={total ? 16 : 12} accent={total}>{v}</BigNum>
    </div>
  );
}

function PlaceholderImg({ size = 40, label }) {
  const t = useT();
  return (
    <div style={{
      width: size, height: size, borderRadius: t.radius,
      background: `repeating-linear-gradient(45deg, ${t.surfaceAlt} 0 4px, ${t.border} 4px 6px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      color: t.fgMuted, fontSize: 8, fontFamily: t.fontMono,
    }}>{label || ''}</div>
  );
}

// ──────────────────────────────────────────────────────────
// 07 PRODUCTS
// ──────────────────────────────────────────────────────────
function S_Products() {
  const t = useT();
  const products = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', price: 436, stock: 25.5, unit: 'kg', tag: 'Best', tone: 'accent' },
    { name: 'Artisan Bread', cat: 'Bakery', price: 353, stock: 8, unit: 'loaves', tag: 'Low', tone: 'warn' },
    { name: 'Greek Yogurt', cat: 'Dairy', price: 332, stock: 3, unit: 'cups', tag: 'Low', tone: 'warn' },
    { name: 'Organic Apples', cat: 'Fruits', price: 540, stock: 15.2, unit: 'kg' },
    { name: 'Fresh Milk', cat: 'Dairy', price: 311, stock: 0, unit: 'L', tag: 'Out', tone: 'error' },
    { name: 'Organic Carrots', cat: 'Vegetables', price: 290, stock: 18, unit: 'kg', tag: 'New', tone: 'accent2' },
  ];
  return (
    <Phone label="07 Products" theme={t} tab="more">
      <Header title="Products" subtitle="156 LISTED" trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn>{ICN.plus}</IconBtn></>} />

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 4, background: t.surfaceAlt, padding: 4, margin: '12px 16px 0', borderRadius: t.radius }}>
        {['Active 156', 'Drafts 4', 'Archived 12'].map((tab, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', fontSize: 12, fontWeight: 600, background: i === 0 ? t.surface : 'transparent', color: i === 0 ? t.fg : t.fgMuted, borderRadius: t.radius }}>{tab}</div>
        ))}
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {products.map((p, i) => (
          <Surface key={i} padded={false}>
            <div style={{ aspectRatio: '1.2/1', position: 'relative' }}>
              <PlaceholderImg size="100%" label="PRODUCT" />
              {p.tag && <div style={{ position: 'absolute', top: 6, left: 6 }}><Pill tone={p.tone} size="sm">{p.tag}</Pill></div>}
            </div>
            <div style={{ padding: 10 }}>
              <Mono color={t.fgMuted}>{p.cat.toUpperCase()}</Mono>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>{p.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <BigNum size={15} accent>₹{p.price}</BigNum>
                <Mono color={p.stock === 0 ? t.error : t.fgMuted}>{p.stock === 0 ? 'OUT' : `${p.stock} ${p.unit}`}</Mono>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 08 PRODUCT DETAIL
// ──────────────────────────────────────────────────────────
function S_ProductDetail() {
  const t = useT();
  return (
    <Phone label="08 Product detail" theme={t}>
      <Header title="Edit · Bread" leading={<IconBtn>{ICN.back}</IconBtn>} trailing={<IconBtn>{ICN.more}</IconBtn>} />

      <div style={{ padding: 16, paddingTop: 14 }}>
        <Surface padded={false}>
          <div style={{ aspectRatio: '1.6/1', position: 'relative' }}>
            <PlaceholderImg size="100%" label="HERO IMAGE · 1600×1000" />
            <div style={{ position: 'absolute', bottom: 8, right: 8 }}><Button kind="secondary" size="sm">Replace</Button></div>
          </div>
        </Surface>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Surface padded>
          <FieldRow label="Name" value="Artisan Bread" />
          <FieldRow label="Category" value="Bakery" arrow />
          <FieldRow label="Description" value="Hand-crafted sourdough, baked daily" last />
        </Surface>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Eyebrow>Pricing & stock</Eyebrow>
        <Surface padded>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <FieldBox label="Cost" value="₹228" />
            <FieldBox label="Sell" value="₹353" hi />
          </div>
          <div style={{ padding: '8px 10px', background: `${t.success}22`, color: t.success, fontSize: 11, display: 'flex', justifyContent: 'space-between', fontFamily: t.fontMono, fontWeight: 700 }}>
            <span>MARGIN</span><span>₹125 · 54.8%</span>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <FieldBox label="On hand" value="8" sub="loaves" />
            <FieldBox label="Min" value="5" sub="reorder" />
            <FieldBox label="Max" value="20" sub="capacity" />
          </div>
        </Surface>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Eyebrow>Vendor</Eyebrow>
        <Surface padded>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="Artisan Bakery" size={40} alt />
            <div style={{ flex: 1 }}>
              <Lbl size={13} weight={700}>Artisan Bakery Co.</Lbl>
              <Mono>★ 4.8 · 12 products</Mono>
            </div>
            <span style={{ color: t.fgDim }}>{ICN.chev}</span>
          </div>
        </Surface>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', gap: 8 }}>
        <Button kind="secondary" full>Cancel</Button>
        <Button kind="primary" full>Save</Button>
      </div>
    </Phone>
  );
}

function FieldRow({ label, value, arrow, last }) {
  const t = useT();
  return (
    <div style={{ padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${t.border}` }}>
      <Mono color={t.fgMuted}>{label.toUpperCase()}</Mono>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <Lbl size={14}>{value}</Lbl>
        {arrow && <span style={{ color: t.fgDim }}>{ICN.chev}</span>}
      </div>
    </div>
  );
}

function FieldBox({ label, value, sub, hi }) {
  const t = useT();
  return (
    <div style={{ padding: '10px 12px', background: hi ? `${t.accent}22` : t.surfaceAlt, border: hi ? `1px solid ${t.accent}` : `1px solid ${t.border}`, borderRadius: t.radius }}>
      <Mono color={t.fgMuted}>{label.toUpperCase()}</Mono>
      <div style={{ marginTop: 2 }}><BigNum size={18} accent={hi}>{value}</BigNum></div>
      {sub && <Mono>{sub}</Mono>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 09 VENDORS
// ──────────────────────────────────────────────────────────
function S_Vendors() {
  const t = useT();
  const vendors = [
    { name: 'Fresh Farm Produce', i: 'FF', rating: 4.9, products: 28, value: 145, status: 'Paid', tone: 'success' },
    { name: 'Artisan Bakery Co.', i: 'AB', rating: 4.8, products: 12, value: 86, status: 'Pending ₹12k', tone: 'warn' },
    { name: 'Dairy Fresh Ltd.', i: 'DF', rating: 4.6, products: 18, value: 102, status: 'Paid', tone: 'success' },
    { name: 'Spice Route', i: 'SR', rating: 4.5, products: 34, value: 67, status: 'Overdue', tone: 'error' },
  ];
  return (
    <Phone label="09 Vendors" theme={t} tab="more">
      <Header title="Vendors" subtitle="12 ACTIVE PARTNERS" trailing={<><IconBtn>{ICN.search}</IconBtn><IconBtn>{ICN.plus}</IconBtn></>} />

      <div style={{ padding: '14px 16px 0' }}>
        <Surface accent padded>
          <Mono color={t.fgMuted}>OUTSTANDING PAYMENTS</Mono>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
            <div>
              <BigNum size={32} accent>₹78,400</BigNum>
              <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 4 }}>across 3 vendors · 2 overdue</div>
            </div>
            <Button kind="primary" size="sm">Pay now</Button>
          </div>
        </Surface>
      </div>

      <div style={{ padding: '16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vendors.map((v, i) => (
          <Surface key={i} padded>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={v.i} size={42} alt={i % 2 === 0} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Lbl size={14} weight={700}>{v.name}</Lbl>
                  <Pill tone={v.tone} size="sm">{v.status}</Pill>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Mono color={t.warn}>★ {v.rating}</Mono>
                  <Mono>·</Mono>
                  <Mono>{v.products} skus</Mono>
                  <Mono>·</Mono>
                  <Mono color={t.fg}>₹{v.value}k</Mono>
                </div>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 10 REPORTS
// ──────────────────────────────────────────────────────────
function S_Reports() {
  const t = useT();
  return (
    <Phone label="10 Reports" theme={t} tab="reports">
      <Header title="Reports" subtitle="LAST 30 DAYS" trailing={<><Button kind="secondary" size="sm">30D ↓</Button><IconBtn>{ICN.more}</IconBtn></>} />

      <div style={{ padding: '14px 16px 0' }}>
        <Surface accent padded>
          <Mono color={t.fgMuted}>TOTAL REVENUE</Mono>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <BigNum size={34} accent>₹3,42,800</BigNum>
            <Pill tone="success" size="sm">↑ 23%</Pill>
          </div>
          <ChartLine />
        </Surface>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <Eyebrow>Key metrics</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Mini label="Orders" v="478" delta="+12% MoM" />
          <Mini label="Avg basket" v="₹717" delta="+₹40" />
          <Mini label="New customers" v="89" delta="+5" />
          <Mini label="Repeat rate" v="62%" delta="+4 pp" />
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <Eyebrow action="Export">Top products</Eyebrow>
        <Surface padded={false}>
          {[
            { rank: 1, name: 'Organic Tomatoes', units: 142, rev: 62, share: 90 },
            { rank: 2, name: 'Artisan Bread', units: 96, rev: 34, share: 70 },
            { rank: 3, name: 'Greek Yogurt', units: 84, rev: 28, share: 55 },
            { rank: 4, name: 'Organic Apples', units: 71, rev: 38, share: 45 },
          ].map((p, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <Mono color={t.fgDim} size={12}>#{p.rank}</Mono>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Lbl size={12}>{p.name}</Lbl>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 3, background: t.border }}>
                    <div style={{ width: `${p.share}%`, height: '100%', background: t.accent }} />
                  </div>
                  <Mono>{p.units}u</Mono>
                </div>
              </div>
              <BigNum size={13} accent>₹{p.rev}k</BigNum>
            </div>
          ))}
        </Surface>
      </div>

      <div style={{ padding: '20px 16px 16px' }}>
        <Eyebrow>Customer mix</Eyebrow>
        <Surface padded>
          <ChartDonut />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {[
              { c: t.accent, l: 'Returning', p: 62 },
              { c: t.accent2, l: 'New', p: 28 },
              { c: t.accent3 || t.warn, l: 'Wholesale', p: 10 },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, background: s.c }} />
                <Lbl size={12} style={{ flex: 1 }}>{s.l}</Lbl>
                <Mono color={t.fg}>{s.p}%</Mono>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </Phone>
  );
}

function ChartLine() {
  const t = useT();
  const data = [12, 15, 18, 22, 25, 28];
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const w = 320, h = 100, pad = 16;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} style={{ marginTop: 10 }}>
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line key={i} x1={pad} x2={w - pad} y1={h * p} y2={h * p} stroke={t.border} strokeDasharray="2 4" />
      ))}
      <polyline fill="none" stroke={t.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        points={data.map((v, i) => `${pad + (i * (w - 2 * pad) / (data.length - 1))},${h - (v / 30) * (h - 8)}`).join(' ')} />
      {data.map((v, i) => {
        const x = pad + (i * (w - 2 * pad) / (data.length - 1));
        const y = h - (v / 30) * (h - 8);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={i === data.length - 1 ? 5 : 2} fill={t.accent} />
            <text x={x} y={h + 14} fontSize="9" fill={t.fgMuted} textAnchor="middle" fontFamily={t.fontMono}>{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ChartDonut() {
  const t = useT();
  const segs = [{ p: 62, c: t.accent }, { p: 28, c: t.accent2 }, { p: 10, c: t.accent3 || t.warn }];
  let cum = 0;
  const r = 50, cx = 60, sw = 16;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={t.border} strokeWidth={sw} />
        {segs.map((s, i) => {
          const len = (s.p / 100) * circ;
          const off = -((cum / 100) * circ);
          cum += s.p;
          return <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.c} strokeWidth={sw} strokeDasharray={`${len} ${circ}`} strokeDashoffset={off} />;
        })}
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <BigNum size={22}>89</BigNum>
        <div><Mono>customers</Mono></div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 11 CUSTOMER / LOYALTY
// ──────────────────────────────────────────────────────────
function S_Customer() {
  const t = useT();
  const m = t.motif;
  return (
    <Phone label="11 Customer" theme={t} tab="more">
      <Header title="Customer" leading={<IconBtn>{ICN.back}</IconBtn>} trailing={<IconBtn>{ICN.more}</IconBtn>} />

      <div style={{ padding: 16 }}>
        <Surface padded style={{
          background: m === 'glow' ? `linear-gradient(135deg, ${t.accent2}, ${t.accent})` : m === 'rule' ? t.surface : m === 'thermal-bar' ? `linear-gradient(135deg, ${t.accent2}, ${t.accent})` : t.fg,
          color: m === 'rule' ? t.fg : (m === 'glow' ? t.accentInk : t.surface),
          padding: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            <span style={{ width: 5, height: 5, background: 'currentColor' }} /> Gold tier · since Jan 2024
          </div>
          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: 24, fontFamily: t.fontDisp, fontWeight: m === 'rule' ? 400 : 800, letterSpacing: '-0.02em' }}>Sarah Johnson</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, alignItems: 'flex-end' }}>
            <div>
              <Mono color="currentColor" size={9}>POINTS</Mono>
              <div><span style={{ fontSize: 30, fontFamily: t.fontMono, fontWeight: 700, letterSpacing: '-0.02em' }}>2,840</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Mono color="currentColor" size={9}>NEXT TIER</Mono>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Platinum @ 3,500</div>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ width: '81%', height: '100%', background: m === 'rule' ? t.fg : (m === 'glow' ? t.bg : t.accent3 || t.surface) }} />
          </div>
        </Surface>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Mini label="Orders" v="34" delta="" />
        <Mini label="Spent" v="₹84k" delta="" />
        <Mini label="Saved" v="₹3.2k" delta="" />
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Eyebrow action="View all">Recent orders</Eyebrow>
        <Surface padded={false}>
          {[
            { id: 'ORD-002', d: '15 Jan · 3 items', total: 2220 },
            { id: 'ORD-018', d: '8 Jan · 2 items', total: 1430 },
            { id: 'ORD-042', d: '22 Dec · 5 items', total: 3680 },
          ].map((o, i, arr) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}`, alignItems: 'center' }}>
              <div>
                <Mono color={t.accent}>{o.id}</Mono>
                <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2 }}>{o.d}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <BigNum size={14}>₹{o.total}</BigNum>
                <div><Pill tone="success" size="sm">Done</Pill></div>
              </div>
            </div>
          ))}
        </Surface>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Eyebrow>Available rewards</Eyebrow>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {[
            { off: '₹50', sub: 'Off any order', pts: 500 },
            { off: 'Free', sub: 'Delivery', pts: 1000 },
            { off: '₹200', sub: 'Off ₹1k+', pts: 2000 },
          ].map((r, i) => (
            <div key={i} style={{ minWidth: 130, padding: 12, background: i === 0 ? t.accent : t.surface, color: i === 0 ? t.accentInk : t.fg, border: `1px solid ${i === 0 ? t.accent : t.border}`, borderRadius: t.radius, flexShrink: 0 }}>
              <BigNum size={20}>{r.off}</BigNum>
              <div style={{ fontSize: 10, marginTop: 2 }}>{r.sub}</div>
              <div style={{ marginTop: 8, fontSize: 9, fontFamily: t.fontMono, fontWeight: 700, letterSpacing: '0.1em' }}>{r.pts} PTS</div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 12 NOTIFICATIONS
// ──────────────────────────────────────────────────────────
function S_Notifications() {
  const t = useT();
  const groups = [
    { title: 'Today', items: [
      { tone: 'success', t: 'New order #ORD-001', b: 'John Smith placed an order worth ₹1,349', time: '2m', un: true },
      { tone: 'warn', t: 'Low stock alert', b: 'Tomatoes running low (5 kg remaining)', time: '15m', un: true },
      { tone: 'accent3', t: 'Payment received', b: '₹26,750 from Sarah Johnson', time: '1h', un: true },
    ] },
    { title: 'Yesterday', items: [
      { tone: 'accent', t: 'Order delivered', b: 'ORD-002 marked as delivered', time: '4 May' },
      { tone: 'accent3', t: 'New customer signup', b: 'Rahul Verma joined Nurays', time: '4 May' },
    ] },
  ];
  return (
    <Phone label="12 Notifications" theme={t} tab="more">
      <Header title="Notifications" leading={<IconBtn>{ICN.back}</IconBtn>} trailing={<Button kind="ghost" size="sm">Mark all</Button>} />

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6 }}>
        {['All', 'Orders', 'Inventory', 'Payments'].map((c, i) => (
          <Pill key={c} tone={i === 0 ? 'accent' : 'outline'} size="sm">{c}</Pill>
        ))}
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '18px 16px 0' }}>
          <Eyebrow>{g.title}</Eyebrow>
          <Surface padded={false}>
            {g.items.map((n, i, arr) => {
              const c = n.tone === 'success' ? t.success : n.tone === 'warn' ? t.warn : n.tone === 'accent' ? t.accent : t.accent3 || t.accent;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}`, position: 'relative' }}>
                  {n.un && <span style={{ position: 'absolute', left: 4, top: 18, width: 4, height: 4, background: t.accent, borderRadius: 9999 }} />}
                  <div style={{ width: 32, height: 32, background: `${c}22`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: t.radius, border: t.motif === 'rule' ? `1px solid ${c}` : 'none' }}>
                    {n.tone === 'success' ? ICN.check : n.tone === 'warn' ? ICN.warn : ICN.bell}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <Lbl size={13} weight={700}>{n.t}</Lbl>
                      <Mono>{n.time}</Mono>
                    </div>
                    <div style={{ fontSize: 11, color: t.fgMuted, marginTop: 2, lineHeight: 1.4 }}>{n.b}</div>
                  </div>
                </div>
              );
            })}
          </Surface>
        </div>
      ))}
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 13 SETTINGS
// ──────────────────────────────────────────────────────────
function S_Settings() {
  const t = useT();
  const groups = [
    { title: 'Business', items: [
      { l: 'Business profile', s: 'Kitchen Co.' },
      { l: 'Payment methods', s: '3 connected' },
      { l: 'Delivery zones', s: '4 zones' },
      { l: 'Tax & invoicing', s: 'GSTIN configured' },
    ] },
    { title: 'Preferences', items: [
      { l: 'Notifications', toggle: true },
      { l: 'Language', s: 'English (India)' },
      { l: 'Currency', s: 'INR (₹)' },
      { l: 'Dark mode', toggle: false },
    ] },
    { title: 'Account', items: [
      { l: 'Security', s: '2FA enabled' },
      { l: 'Team members', s: '3 active' },
      { l: 'Help & support' },
      { l: 'Sign out', danger: true },
    ] },
  ];
  return (
    <Phone label="13 Settings" theme={t} tab="more">
      <Header title="Settings" leading={<IconBtn>{ICN.back}</IconBtn>} />

      <div style={{ padding: '14px 16px 0' }}>
        <Surface padded>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name="Priya Sharma" size={48} />
            <div style={{ flex: 1 }}>
              <Lbl size={15} weight={700}>Priya Sharma</Lbl>
              <Mono>priya@kitchenco.in</Mono>
              <div style={{ marginTop: 4 }}><Pill tone="accent" size="sm">Administrator</Pill></div>
            </div>
            <span style={{ color: t.fgDim }}>{ICN.chev}</span>
          </div>
        </Surface>
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '18px 16px 0' }}>
          <Eyebrow>{g.title}</Eyebrow>
          <Surface padded={false}>
            {g.items.map((it, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}` }}>
                <div style={{ flex: 1 }}>
                  <Lbl size={13} weight={600} style={{ color: it.danger ? t.error : undefined }}>{it.l}</Lbl>
                  {it.s && <Mono>{it.s}</Mono>}
                </div>
                {it.toggle !== undefined ? (
                  <div style={{ width: 32, height: 18, background: it.toggle ? t.accent : t.border, borderRadius: t.radius, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 2, left: it.toggle ? 16 : 2, width: 14, height: 14, background: t.surface, borderRadius: t.radius }} />
                  </div>
                ) : <span style={{ color: t.fgDim }}>{ICN.chev}</span>}
              </div>
            ))}
          </Surface>
        </div>
      ))}

      <div style={{ padding: '14px 16px 16px', textAlign: 'center' }}>
        <Mono>NURAYS · v2.4.1 · {t.name.toUpperCase()}</Mono>
      </div>
    </Phone>
  );
}

// ──────────────────────────────────────────────────────────
// 14 CHECKOUT
// ──────────────────────────────────────────────────────────
function S_Checkout() {
  const t = useT();
  return (
    <Phone label="14 Checkout" theme={t}>
      <Header title="Checkout" leading={<IconBtn>{ICN.back}</IconBtn>} />

      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 0 }}>
        {['Cart', 'Address', 'Payment', 'Review'].map((s, i) => {
          const done = i < 2; const active = i === 2;
          return (
            <Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 22, height: 22, background: done ? t.accent : active ? t.surface : t.border, color: done ? t.accentInk : active ? t.accent : t.fgMuted, border: active ? `1.5px solid ${t.accent}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, fontFamily: t.fontMono, borderRadius: t.radius }}>
                  {done ? ICN.check : i + 1}
                </div>
                <Mono size={9} color={done || active ? t.fg : t.fgDim}>{s.toUpperCase()}</Mono>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 2, background: i < 2 ? t.accent : t.border, marginBottom: 14 }} />}
            </Fragment>
          );
        })}
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Eyebrow>Items · 3</Eyebrow>
        <Surface padded={false}>
          {[
            { n: 'Artisan Cheese', q: '500 g', p: 996 },
            { n: 'Sourdough', q: '1 loaf', p: 540 },
            { n: 'Organic Milk', q: '1 L', p: 394 },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <PlaceholderImg size={36} />
              <div style={{ flex: 1 }}>
                <Lbl size={12}>{it.n}</Lbl>
                <Mono>{it.q}</Mono>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 22, height: 22, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: t.fg, borderRadius: t.radius }}>−</span>
                <Mono color={t.fg} size={12}>1</Mono>
                <span style={{ width: 22, height: 22, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: t.fg, borderRadius: t.radius }}>+</span>
              </div>
              <BigNum size={13}>₹{it.p}</BigNum>
            </div>
          ))}
        </Surface>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Eyebrow action="Change">Delivery address</Eyebrow>
        <Surface padded>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill tone="accent" size="sm">Home · default</Pill>
          </div>
          <div style={{ fontSize: 12, color: t.fg, marginTop: 6, lineHeight: 1.4 }}>456 Oak Avenue, Bandra West<br/>Mumbai 400050</div>
          <Mono>+91 98765 43210</Mono>
        </Surface>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Eyebrow>Payment</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { l: 'UPI · ****@oksbi', s: 'Recommended', sel: true },
            { l: 'Credit / Debit card', s: 'Visa ending 4242' },
            { l: 'Cash on delivery' },
          ].map((p, i) => (
            <Surface key={i} padded style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10, borderColor: p.sel ? t.accent : undefined, ...(p.sel ? { boxShadow: `0 0 0 2px ${t.accent}55` } : {}) }}>
              <div style={{ flex: 1 }}>
                <Lbl size={13} weight={700}>{p.l}</Lbl>
                {p.s && <Mono color={p.sel ? t.accent : t.fgMuted}>{p.s}</Mono>}
              </div>
              <div style={{ width: 18, height: 18, border: `1.5px solid ${p.sel ? t.accent : t.border}`, background: p.sel ? t.accent : 'transparent', color: t.accentInk, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: t.radius }}>
                {p.sel && ICN.check}
              </div>
            </Surface>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Surface padded>
          <SummaryRow l="Subtotal" v="₹1,930" />
          <SummaryRow l="Delivery" v="₹290" />
          <SummaryRow l="Loyalty" v="−₹100" />
          <SummaryRow l="Total" v="₹2,120" total />
        </Surface>
      </div>

      <div style={{ padding: '14px 16px 24px' }}>
        <Button kind="primary" size="lg" full style={{ display: 'flex', justifyContent: 'space-between', padding: '0 18px' }}>
          <span>Place order</span>
          <span style={{ fontFamily: t.fontMono, fontWeight: 800 }}>₹2,120 →</span>
        </Button>
      </div>
    </Phone>
  );
}

window.SCREENS = [
  { id: 'login', label: '01 Login', C: S_Login, w: 402, h: 874 },
  { id: 'dash', label: '02 Dashboard', C: S_Dashboard, w: 402, h: 874 },
  { id: 'dash-action', label: '03 Action-first', C: S_DashAction, w: 402, h: 874 },
  { id: 'inv', label: '04 Inventory', C: S_Inventory, w: 402, h: 874 },
  { id: 'orders', label: '05 Orders', C: S_Orders, w: 402, h: 874 },
  { id: 'order-detail', label: '06 Order detail', C: S_OrderDetail, w: 402, h: 874 },
  { id: 'products', label: '07 Products', C: S_Products, w: 402, h: 874 },
  { id: 'product-detail', label: '08 Product detail', C: S_ProductDetail, w: 402, h: 874 },
  { id: 'vendors', label: '09 Vendors', C: S_Vendors, w: 402, h: 874 },
  { id: 'reports', label: '10 Reports', C: S_Reports, w: 402, h: 874 },
  { id: 'customer', label: '11 Customer', C: S_Customer, w: 402, h: 874 },
  { id: 'notifications', label: '12 Notifications', C: S_Notifications, w: 402, h: 874 },
  { id: 'settings', label: '13 Settings', C: S_Settings, w: 402, h: 874 },
  { id: 'checkout', label: '14 Checkout', C: S_Checkout, w: 402, h: 874 },
];
