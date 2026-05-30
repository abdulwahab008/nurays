// screens-2.jsx — Products, Product detail, Vendors, Reports, Customer, Notifications, Settings, Cart/Checkout

// ─────────────────────────────────────────────────────────────
// 07 PRODUCTS CATALOG (operator-side product management)
// ─────────────────────────────────────────────────────────────
function ProductsScreen() {
  const products = [
    { name: 'Organic Tomatoes', cat: 'Vegetables', price: 436, stock: 25.5, unit: 'kg', emoji: '🍅', tag: 'Bestseller', tagTone: 'primary' },
    { name: 'Artisan Bread', cat: 'Bakery', price: 353, stock: 8, unit: 'loaves', emoji: '🥖', tag: 'Low Stock', tagTone: 'warning' },
    { name: 'Greek Yogurt', cat: 'Dairy', price: 332, stock: 3, unit: 'cups', emoji: '🥣', tag: 'Low Stock', tagTone: 'warning' },
    { name: 'Organic Apples', cat: 'Fruits', price: 540, stock: 15.2, unit: 'kg', emoji: '🍎' },
    { name: 'Fresh Milk', cat: 'Dairy', price: 311, stock: 0, unit: 'L', emoji: '🥛', tag: 'Out', tagTone: 'error' },
    { name: 'Organic Carrots', cat: 'Vegetables', price: 290, stock: 18, unit: 'kg', emoji: '🥕', tag: 'New', tagTone: 'accent' },
  ];
  return (
    <Screen label="07 Products" tab="more">
      <AppHeader title="Products" subtitle="156 listed" trailing={<><IconBtn>{I.search}</IconBtn><IconBtn>{I.plus}</IconBtn></>} />

      {/* Segmented switcher */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 10, padding: 3 }}>
          {['Active', 'Drafts', 'Archived'].map((t, i) => (
            <button key={t} style={{
              flex: 1, padding: '8px 12px', border: 'none', borderRadius: 8,
              background: i === 0 ? 'white' : 'transparent',
              boxShadow: i === 0 ? 'var(--shadow-sm)' : 'none',
              fontSize: 13, fontWeight: 600,
              color: i === 0 ? 'var(--gray-900)' : 'var(--gray-500)',
              cursor: 'pointer',
            }}>{t} {i === 0 && <span style={{ color: 'var(--gray-400)', fontWeight: 500 }}>156</span>}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '14px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {products.map((p, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{
              aspectRatio: '1.2/1', background: 'linear-gradient(135deg, var(--gray-50), var(--gray-100))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, position: 'relative',
            }}>
              {p.emoji}
              {p.tag && <span style={{ position: 'absolute', top: 8, left: 8 }}><Badge tone={p.tagTone} size="sm">{p.tag}</Badge></span>}
              <button style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 9999, background: 'rgba(255,255,255,0.85)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-700)', cursor: 'pointer' }}>{I.more}</button>
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.cat}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>{p.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-700)', letterSpacing: '-0.01em' }}>₹{p.price}</span>
                <span style={{ fontSize: 11, color: p.stock === 0 ? 'var(--error-600)' : 'var(--gray-500)', fontWeight: 600 }}>
                  {p.stock === 0 ? 'Out' : `${p.stock} ${p.unit}`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// 08 PRODUCT DETAIL / EDIT
// ─────────────────────────────────────────────────────────────
function ProductDetailScreen() {
  return (
    <Screen label="08 Product Detail">
      <AppHeader title="Edit Product" leading={<IconBtn>{I.back}</IconBtn>} trailing={<IconBtn>{I.more}</IconBtn>} />

      {/* Hero image */}
      <div style={{ padding: 16, paddingTop: 0 }}>
        <div style={{
          aspectRatio: '1.6/1', borderRadius: 14, overflow: 'hidden',
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <span style={{ fontSize: 96 }}>🥖</span>
          <button style={{ position: 'absolute', bottom: 10, right: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 12, fontWeight: 600, border: 'none', backdropFilter: 'blur(8px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.75 9V5.25A2.25 2.25 0 0112 3a2.25 2.25 0 012.25 2.25V9m-7.5 1.5h10.5l1.5 9.75H4.5l1.5-9.75z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Replace
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <Card>
          <Field label="Product Name" value="Artisan Bread" />
          <Field label="Category" value="Bakery" arrow />
          <Field label="Description" value="Hand-crafted sourdough, baked daily" multi last />
        </Card>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle>Pricing & Stock</SectionTitle>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <FieldBox label="Cost Price" value="₹228" />
            <FieldBox label="Selling Price" value="₹353" highlight />
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--success-50)', borderRadius: 8, fontSize: 12, color: 'var(--success-700)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>Margin</span>
            <span style={{ fontWeight: 800 }}>₹125 (54.8%)</span>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <FieldBox label="Current" value="8" sub="loaves" />
            <FieldBox label="Min" value="5" sub="reorder at" />
            <FieldBox label="Max" value="20" sub="capacity" />
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle>Vendor</SectionTitle>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gradient-secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>AB</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Artisan Bakery Co.</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>4.8 ★ · 12 products supplied</div>
            </div>
            <span style={{ color: 'var(--gray-400)' }}>{I.chevron}</span>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, minHeight: 48, background: 'white', border: '1px solid var(--border-medium)', borderRadius: 12, fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>Cancel</button>
        <button style={{ flex: 1.6, minHeight: 48, background: 'var(--gradient-primary)', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.3)' }}>Save Changes</button>
      </div>
    </Screen>
  );
}

function Field({ label, value, arrow, multi, last }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--gray-100)' }}>
      <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', flex: 1, lineHeight: multi ? 1.4 : 1.3 }}>{value}</div>
        {arrow && <span style={{ color: 'var(--gray-400)' }}>{I.chevron}</span>}
      </div>
    </div>
  );
}

function FieldBox({ label, value, sub, highlight }) {
  return (
    <div style={{ background: highlight ? 'var(--primary-50)' : 'var(--gray-50)', border: highlight ? '1px solid var(--primary-200)' : '1px solid var(--gray-100)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? 'var(--primary-700)' : 'var(--fg-primary)', letterSpacing: '-0.01em', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 09 VENDORS LIST
// ─────────────────────────────────────────────────────────────
function VendorsScreen() {
  const vendors = [
    { name: 'Fresh Farm Produce', initials: 'FF', color: 'var(--gradient-primary)', rating: 4.9, products: 28, value: 145000, status: 'Paid', tone: 'success' },
    { name: 'Artisan Bakery Co.', initials: 'AB', color: 'var(--gradient-secondary)', rating: 4.8, products: 12, value: 86200, status: 'Pending ₹12k', tone: 'warning' },
    { name: 'Dairy Fresh Ltd.', initials: 'DF', color: 'var(--gradient-accent)', rating: 4.6, products: 18, value: 102400, status: 'Paid', tone: 'success' },
    { name: 'Spice Route Imports', initials: 'SR', color: 'linear-gradient(135deg, #a855f7, #7e22ce)', rating: 4.5, products: 34, value: 67500, status: 'Overdue', tone: 'error' },
  ];
  return (
    <Screen label="09 Vendors" tab="more">
      <AppHeader title="Vendors" subtitle="12 active partners" trailing={<><IconBtn>{I.search}</IconBtn><IconBtn>{I.plus}</IconBtn></>} />

      {/* Top summary */}
      <div style={{ padding: '12px 16px 0' }}>
        <Card style={{ padding: 16, background: 'var(--gradient-card)' }}>
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--gradient-secondary)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>OUTSTANDING PAYMENTS</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2, letterSpacing: '-0.02em' }}>₹78,400</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>across 3 vendors</div>
            </div>
            <button style={{ alignSelf: 'flex-end', padding: '8px 14px', background: 'var(--gradient-secondary)', color: 'white', border: 'none', borderRadius: 9999, fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}>Pay Now</button>
          </div>
        </Card>
      </div>

      {/* List */}
      <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vendors.map((v, i) => (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: v.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{v.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{v.name}</div>
                  <Badge tone={v.tone} size="sm">{v.status}</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--gray-500)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--warning-500)' }}>{I.star}<span style={{ color: 'var(--gray-700)', fontWeight: 600, marginLeft: 1 }}>{v.rating}</span></span>
                  <span>·</span>
                  <span>{v.products} products</span>
                  <span>·</span>
                  <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>₹{(v.value / 1000).toFixed(0)}k</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// 10 REPORTS / ANALYTICS
// ─────────────────────────────────────────────────────────────
function ReportsScreen() {
  return (
    <Screen label="10 Reports" tab="reports">
      <AppHeader title="Reports" trailing={<>
        <button style={{ padding: '6px 10px', background: 'white', border: '1px solid var(--border-light)', borderRadius: 9999, fontSize: 11, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          Last 30 days
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m19.5 8.25-7.5 7.5-7.5-7.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <IconBtn>{I.more}</IconBtn>
      </>} />

      {/* Hero metric */}
      <div style={{ padding: '12px 16px 0' }}>
        <Card style={{ padding: 18 }}>
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--gradient-text)' }} />
          <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>TOTAL REVENUE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span className="gradient-text" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>₹3,42,800</span>
            <Badge tone="success" size="sm">↑ 23%</Badge>
          </div>
          <SalesChart />
        </Card>
      </div>

      {/* KPI grid */}
      <div style={{ padding: '16px 16px 0' }}>
        <SectionTitle>Key Metrics</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KPI label="Orders" value="478" sub="↑ 12% MoM" tone="primary" />
          <KPI label="Avg Basket" value="₹717" sub="↑ ₹40" tone="info" />
          <KPI label="New Customers" value="89" sub="↑ 5" tone="accent" />
          <KPI label="Repeat Rate" value="62%" sub="↑ 4 pp" tone="primary" />
        </div>
      </div>

      {/* Top products */}
      <div style={{ padding: '20px 16px 0' }}>
        <SectionTitle action="Export">Top Products</SectionTitle>
        <Card padded={false}>
          {[
            { rank: 1, name: 'Organic Tomatoes', units: 142, revenue: 61912, share: 18 },
            { rank: 2, name: 'Artisan Bread', units: 96, revenue: 33888, share: 14 },
            { rank: 3, name: 'Greek Yogurt', units: 84, revenue: 27888, share: 11 },
            { rank: 4, name: 'Organic Apples', units: 71, revenue: 38340, share: 9 },
          ].map((p, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gray-400)', width: 16 }}>#{p.rank}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--gray-100)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ width: `${p.share * 4}%`, height: '100%', background: 'var(--gradient-primary)' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>{p.units} sold</span>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-700)', whiteSpace: 'nowrap' }}>₹{(p.revenue / 1000).toFixed(0)}k</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Customer split */}
      <div style={{ padding: '20px 16px 16px' }}>
        <SectionTitle>Customer Mix</SectionTitle>
        <Card>
          <Donut />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <Legend color="var(--primary-500)" label="Returning" pct={62} />
            <Legend color="var(--accent-500)" label="New" pct={28} />
            <Legend color="var(--secondary-500)" label="Wholesale" pct={10} />
          </div>
        </Card>
      </div>
    </Screen>
  );
}

function SalesChart() {
  const data = [12, 15, 18, 22, 25, 28];
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const max = 30;
  const w = 320, h = 110, pad = 24;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 20}`} style={{ marginTop: 10 }}>
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="var(--primary-500)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line key={i} x1={pad} x2={w - pad / 2} y1={h * p} y2={h * p} stroke="var(--gray-100)" strokeDasharray="2 4"/>
      ))}
      <polygon
        fill="url(#area)"
        points={`${pad},${h} ${data.map((v, i) => `${pad + (i * (w - pad - pad / 2) / (data.length - 1))},${h - (v / max) * (h - 10)}`).join(' ')} ${w - pad / 2},${h}`}
      />
      <polyline
        fill="none" stroke="var(--primary-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        points={data.map((v, i) => `${pad + (i * (w - pad - pad / 2) / (data.length - 1))},${h - (v / max) * (h - 10)}`).join(' ')}
      />
      {data.map((v, i) => {
        const x = pad + (i * (w - pad - pad / 2) / (data.length - 1));
        const y = h - (v / max) * (h - 10);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={i === data.length - 1 ? 5 : 0} fill="var(--primary-500)" stroke="white" strokeWidth="2"/>
            <text x={x} y={h + 16} fontSize="10" fill="var(--gray-500)" textAnchor="middle" fontWeight="500">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function KPI({ label, value, sub, tone }) {
  const bars = {
    primary: 'var(--gradient-primary)', info: 'var(--gradient-accent)',
    accent: 'var(--gradient-accent)', warning: 'var(--gradient-secondary)',
  };
  return (
    <Card style={{ padding: 14 }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: bars[tone] }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--success-600)', fontWeight: 600, marginTop: 2 }}>{sub}</div>
    </Card>
  );
}

function Donut() {
  const segs = [
    { pct: 62, color: 'var(--primary-500)' },
    { pct: 28, color: 'var(--accent-500)' },
    { pct: 10, color: 'var(--secondary-500)' },
  ];
  let cum = 0;
  const r = 56, c = 70, sw = 18;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--gray-100)" strokeWidth={sw}/>
        {segs.map((s, i) => {
          const len = (s.pct / 100) * circ;
          const off = -((cum / 100) * circ);
          cum += s.pct;
          return <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${len} ${circ}`} strokeDashoffset={off} strokeLinecap="butt"/>;
        })}
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>89</div>
        <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>customers</div>
      </div>
    </div>
  );
}

function Legend({ color, label, pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 11 CUSTOMER PROFILE / LOYALTY
// ─────────────────────────────────────────────────────────────
function CustomerScreen() {
  return (
    <Screen label="11 Customer Loyalty" tab="more">
      <AppHeader title="Customer" leading={<IconBtn>{I.back}</IconBtn>} trailing={<IconBtn>{I.more}</IconBtn>} />

      {/* Hero */}
      <div style={{ padding: 16 }}>
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 60%, #7c3aed 100%)',
          borderRadius: 18, padding: 20, color: 'white', position: 'relative', overflow: 'hidden',
          boxShadow: '0 12px 30px rgba(67,56,202,0.35)',
        }}>
          {/* shine */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 9999, background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 60%)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: '#fbbf24' }} />
                Gold Member
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: '-0.01em' }}>Sarah Johnson</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Member since Jan 2024</div>
            </div>
            <Avatar name="Sarah Johnson" size={48} color="rgba(255,255,255,0.2)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>POINTS BALANCE</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>2,840</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>NEXT TIER</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>Platinum at 3,500</div>
            </div>
          </div>
          <div style={{ marginTop: 10, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ width: '81%', height: '100%', background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <PillStatCustom label="Orders" value="34" />
        <PillStatCustom label="Spent" value="₹84k" />
        <PillStatCustom label="Saved" value="₹3.2k" tone="success" />
      </div>

      {/* Recent orders */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle action="View all">Recent Orders</SectionTitle>
        <Card padded={false}>
          {[
            { id: 'ORD-002', date: '15 Jan · 3 items', total: 2220, tone: 'success', label: 'Delivered' },
            { id: 'ORD-018', date: '8 Jan · 2 items', total: 1430, tone: 'success', label: 'Delivered' },
            { id: 'ORD-042', date: '22 Dec · 5 items', total: 3680, tone: 'success', label: 'Delivered' },
          ].map((o, i, arr) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{o.id}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{o.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>₹{o.total}</div>
                <Badge tone={o.tone} size="sm">{o.label}</Badge>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Rewards */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle>Available Rewards</SectionTitle>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 0' }}>
          {[
            { pts: 500, off: '₹50', sub: 'Off any order', color: 'var(--gradient-primary)' },
            { pts: 1000, off: 'Free', sub: 'Delivery', color: 'var(--gradient-accent)' },
            { pts: 2000, off: '₹200', sub: 'Off ₹1,000+', color: 'var(--gradient-secondary)' },
          ].map((r, i) => (
            <div key={i} style={{ minWidth: 140, padding: 14, borderRadius: 14, background: r.color, color: 'white', boxShadow: 'var(--shadow-md)', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.off}</div>
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{r.sub}</div>
              <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, padding: '4px 8px', background: 'rgba(255,255,255,0.25)', borderRadius: 9999, display: 'inline-block' }}>{r.pts} pts</div>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

function PillStatCustom({ label, value, tone }) {
  return (
    <Card style={{ padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone === 'success' ? 'var(--success-600)' : 'var(--fg-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// 12 NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
function NotificationsScreen() {
  const groups = [
    {
      title: 'Today',
      items: [
        { tone: 'success', icon: '🛒', title: 'New order #ORD-001', body: 'John Smith placed an order worth ₹1,349', time: '2 min', unread: true },
        { tone: 'warning', icon: '⚠️', title: 'Low stock alert', body: 'Tomatoes are running low (5 kg remaining)', time: '15 min', unread: true },
        { tone: 'info', icon: '💳', title: 'Payment received', body: '₹26,750 from Sarah Johnson', time: '1 hr', unread: true },
      ],
    },
    {
      title: 'Yesterday',
      items: [
        { tone: 'primary', icon: '🚚', title: 'Order delivered', body: 'ORD-002 marked as delivered', time: '4 May' },
        { tone: 'info', icon: '👤', title: 'New customer signup', body: 'Rahul Verma joined Nurays', time: '4 May' },
      ],
    },
  ];
  return (
    <Screen label="12 Notifications" tab="more">
      <AppHeader title="Notifications" leading={<IconBtn>{I.back}</IconBtn>} trailing={<button style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--primary-600)', fontWeight: 600, cursor: 'pointer' }}>Mark all</button>} />

      {/* Filter chips */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6 }}>
        {['All', 'Orders', 'Inventory', 'Payments'].map((c, i) => (
          <span key={c} style={{
            padding: '5px 12px', borderRadius: 9999,
            background: i === 0 ? 'var(--primary-500)' : 'white',
            color: i === 0 ? 'white' : 'var(--gray-700)',
            border: i === 0 ? 'none' : '1px solid var(--border-light)',
            fontSize: 12, fontWeight: 600,
          }}>{c}</span>
        ))}
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '20px 16px 0' }}>
          <SectionTitle>{g.title}</SectionTitle>
          <Card padded={false}>
            {g.items.map((n, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)', position: 'relative' }}>
                {n.unread && <span style={{ position: 'absolute', left: 6, top: 22, width: 6, height: 6, borderRadius: 9999, background: 'var(--primary-500)' }} />}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: n.tone === 'success' ? 'var(--success-50)' : n.tone === 'warning' ? 'var(--warning-50)' : n.tone === 'primary' ? 'var(--primary-50)' : 'var(--info-50)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>{n.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{n.time}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// 13 SETTINGS
// ─────────────────────────────────────────────────────────────
function SettingsScreen() {
  return (
    <Screen label="13 Settings" tab="more">
      <AppHeader title="Settings" leading={<IconBtn>{I.back}</IconBtn>} />

      {/* Profile card */}
      <div style={{ padding: '12px 16px 0' }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name="Priya Sharma" size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Priya Sharma</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>priya@kitchenco.in</div>
              <div style={{ marginTop: 4 }}><Badge tone="primary" size="sm">Administrator</Badge></div>
            </div>
            <span style={{ color: 'var(--gray-400)' }}>{I.chevron}</span>
          </div>
        </Card>
      </div>

      {/* Business */}
      <SettingsGroup title="Business" items={[
        { icon: '🏪', label: 'Business Profile', sub: 'Kitchen Co.' },
        { icon: '💳', label: 'Payment Methods', sub: '3 connected' },
        { icon: '📦', label: 'Delivery Zones', sub: '4 zones' },
        { icon: '📄', label: 'Tax & Invoicing', sub: 'GSTIN configured' },
      ]} />

      <SettingsGroup title="Preferences" items={[
        { icon: '🔔', label: 'Notifications', toggle: true },
        { icon: '🌐', label: 'Language', sub: 'English (India)' },
        { icon: '🇮🇳', label: 'Currency', sub: 'INR (₹)' },
        { icon: '🌙', label: 'Dark Mode', toggle: false, off: true },
      ]} />

      <SettingsGroup title="Account" items={[
        { icon: '🔒', label: 'Security', sub: '2FA enabled' },
        { icon: '👥', label: 'Team Members', sub: '3 active' },
        { icon: '❓', label: 'Help & Support' },
        { icon: '↩', label: 'Sign Out', danger: true },
      ]} />

      <div style={{ padding: '4px 16px 16px', textAlign: 'center', fontSize: 11, color: 'var(--gray-400)' }}>
        Nurays · v2.4.1
      </div>
    </Screen>
  );
}

function SettingsGroup({ title, items }) {
  return (
    <div style={{ padding: '20px 16px 0' }}>
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false}>
        {items.map((it, i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{it.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: it.danger ? 'var(--error-600)' : 'inherit' }}>{it.label}</div>
              {it.sub && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{it.sub}</div>}
            </div>
            {it.toggle !== undefined ? (
              <div style={{
                width: 38, height: 22, borderRadius: 9999, position: 'relative',
                background: it.toggle === false && !it.off ? 'var(--gray-200)' : it.off ? 'var(--gray-200)' : 'var(--primary-500)',
                transition: 'all 200ms',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: it.toggle && !it.off ? 18 : 2,
                  width: 18, height: 18, borderRadius: 9999, background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }} />
              </div>
            ) : (
              <span style={{ color: 'var(--gray-400)' }}>{I.chevron}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 14 CART / CHECKOUT (storefront side)
// ─────────────────────────────────────────────────────────────
function CheckoutScreen() {
  return (
    <Screen label="14 Checkout">
      <AppHeader title="Checkout" leading={<IconBtn>{I.back}</IconBtn>} />

      {/* Step indicator */}
      <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 0 }}>
        {['Cart', 'Address', 'Payment', 'Review'].map((s, i) => {
          const done = i < 2;
          const active = i === 2;
          return (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 9999,
                  background: done ? 'var(--primary-500)' : active ? 'white' : 'var(--gray-100)',
                  border: active ? '2px solid var(--primary-500)' : 'none',
                  color: done ? 'white' : active ? 'var(--primary-500)' : 'var(--gray-400)',
                  fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{done ? I.check : i + 1}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: done || active ? 'var(--gray-900)' : 'var(--gray-400)' }}>{s}</div>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 2, background: i < 2 ? 'var(--primary-500)' : 'var(--gray-200)', marginBottom: 16 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Items */}
      <div style={{ padding: '16px 16px 0' }}>
        <SectionTitle>Order Items (3)</SectionTitle>
        <Card padded={false}>
          {[
            { name: 'Artisan Cheese', qty: '500 g', price: 996, emoji: '🧀' },
            { name: 'Sourdough Bread', qty: '1 loaf', price: 540, emoji: '🥖' },
            { name: 'Organic Milk', qty: '1 L', price: 394, emoji: '🥛' },
          ].map((it, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-100)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{it.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{it.qty}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button style={qtyBtn}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>1</span>
                <button style={qtyBtn}>+</button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, minWidth: 50, textAlign: 'right' }}>₹{it.price}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Address */}
      <div style={{ padding: '16px 16px 0' }}>
        <SectionTitle action="Change">Delivery Address</SectionTitle>
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Home</div>
                <Badge tone="primary" size="sm">Default</Badge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 2, lineHeight: 1.4 }}>
                456 Oak Avenue, Bandra West<br/>Mumbai 400050 · Maharashtra
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>+91 98765 43210</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Payment */}
      <div style={{ padding: '16px 16px 0' }}>
        <SectionTitle>Payment Method</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PaymentRow icon="💳" label="UPI · ****@oksbi" sub="Recommended" selected />
          <PaymentRow icon="🏦" label="Credit / Debit Card" sub="Visa ending 4242" />
          <PaymentRow icon="💵" label="Cash on Delivery" />
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: '16px 16px 16px' }}>
        <Card>
          <SummaryRow label="Subtotal" value="₹1,930" />
          <SummaryRow label="Delivery Fee" value="₹290" />
          <SummaryRow label="Loyalty discount" value="−₹100" />
          <SummaryRow label="Total" value="₹2,120" total />
        </Card>
      </div>

      {/* Pay button */}
      <div style={{ padding: '0 16px 24px' }}>
        <button style={{
          width: '100%', minHeight: 52, background: 'var(--gradient-primary)', color: 'white', border: 'none',
          borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(34,197,94,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px',
        }}>
          <span>Place Order</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>₹2,120 →</span>
        </button>
      </div>
    </Screen>
  );
}

const qtyBtn = { width: 24, height: 24, borderRadius: 9999, border: '1px solid var(--gray-200)', background: 'white', fontSize: 14, fontWeight: 700, color: 'var(--gray-700)', cursor: 'pointer', lineHeight: 1, padding: 0 };

function PaymentRow({ icon, label, sub, selected }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12,
      border: selected ? '2px solid var(--primary-500)' : '1px solid var(--border-light)',
      padding: 12, display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: selected ? '0 0 0 3px var(--primary-50)' : 'none',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: selected ? 'var(--primary-600)' : 'var(--gray-500)', fontWeight: selected ? 600 : 400 }}>{sub}</div>}
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: 9999,
        border: selected ? 'none' : '2px solid var(--gray-300)',
        background: selected ? 'var(--primary-500)' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white',
      }}>
        {selected && I.check}
      </div>
    </div>
  );
}

Object.assign(window, {
  ProductsScreen, ProductDetailScreen, VendorsScreen, ReportsScreen,
  CustomerScreen, NotificationsScreen, SettingsScreen, CheckoutScreen,
});
