// web-screens.jsx — Web screens 1-7 (Login, Dashboard, Action Dashboard, Inventory, Orders, Order Detail, Notifications)
const { WebShell, Card, Btn, StatTile, StatusPill, Sidebar, TopBar } = window;
const { I, IMG } = window;

// 01 LOGIN
function WebLogin() {
  return (
    <div data-screen-label="01 Login" style={{ width: 1440, height: 900, display: 'flex', background: '#fff' }}>
      <div style={{ flex: 1, padding: '80px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 60 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>N</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.01em' }}>Nurays</div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.03em', lineHeight: 1.1 }}>Welcome back</div>
          <div style={{ fontSize: 15, color: 'var(--gray-5)', marginTop: 8 }}>Sign in to your back-office.</div>
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-5)', marginBottom: 6 }}>Email</div>
              <div style={{ height: 48, padding: '0 16px', background: 'var(--gray-1)', border: '1px solid var(--gray-2)', borderRadius: 10, display: 'flex', alignItems: 'center', fontSize: 14 }}>priya@kitchenco.in</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-5)', marginBottom: 6 }}>Password</div>
              <div style={{ height: 48, padding: '0 16px', background: 'var(--gray-1)', border: '1px solid var(--gray-2)', borderRadius: 10, display: 'flex', alignItems: 'center', fontSize: 14, letterSpacing: '0.2em' }}>••••••••••</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--brand)' }} /> Remember me</label>
              <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Forgot?</span>
            </div>
            <button style={{ height: 50, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 8, boxShadow: '0 4px 12px -2px rgba(230, 57, 70, 0.4)' }}>Sign in</button>
          </div>
          <div style={{ marginTop: 32, fontSize: 13, color: 'var(--gray-5)' }}>New to Nurays? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>Create account</span></div>
        </div>
      </div>
      <div style={{ flex: 1, background: 'linear-gradient(135deg, #FFE5E7 0%, #FFF6F7 100%)', position: 'relative', overflow: 'hidden' }}>
        <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 60, left: 60, right: 60, color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.9 }}>NURAYS BACK-OFFICE</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', marginTop: 12, lineHeight: 1.15 }}>Run your kitchen from anywhere.</div>
        </div>
      </div>
    </div>
  );
}

// 02 DASHBOARD
function WebDashboard() {
  return (
    <WebShell label="02 Dashboard" active="dash" title="Dashboard" sub="Tuesday, 6 May 2026"
      actions={<><Btn kind="outline" icon={I.download}>Export</Btn><Btn icon={I.plus}>New order</Btn></>}>
      {/* Top stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatTile label="Revenue today" value="₹12,450" delta="+8.4%" sparkline={[15, 22, 18, 25, 30, 20, 12, 18, 24]} />
        <StatTile label="Orders" value="42" delta="+12%" sparkline={[3, 5, 4, 6, 7, 5, 3, 6, 8]} />
        <StatTile label="Avg ticket" value="₹296" delta="-2%" deltaTone="red" sparkline={[200, 220, 290, 280, 300, 296]} />
        <StatTile label="Customers" value="128" delta="+18%" sparkline={[80, 90, 100, 110, 115, 128]} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Revenue chart */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue · last 7 days</div>
              <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>Total ₹84,320</div>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--gray-1)', borderRadius: 8 }}>
              {['Day', 'Week', 'Month'].map((t, i) => (
                <span key={i} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 5, background: i === 1 ? '#fff' : 'transparent', color: i === 1 ? 'var(--ink)' : 'var(--gray-5)', boxShadow: i === 1 ? 'var(--shadow-sm)' : 'none' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200 }}>
            {[
              { d: 'Mon', v: 65 }, { d: 'Tue', v: 80 }, { d: 'Wed', v: 55 }, { d: 'Thu', v: 92 }, { d: 'Fri', v: 78 }, { d: 'Sat', v: 100 }, { d: 'Sun', v: 70 },
            ].map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: '100%', height: `${b.v}%`, background: i === 5 ? 'var(--brand)' : 'var(--gray-2)', borderRadius: 6, position: 'relative' }}>
                  {i === 5 && <span style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>₹18.4k</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>{b.d}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Active orders */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Active orders</div>
            <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--brand)' }} /> 3 LIVE
            </span>
          </div>
          {[
            { id: 'ORD-001', name: 'John Smith', img: IMG.john, status: 'En route', tone: 'red', time: '14:00' },
            { id: 'ORD-002', name: 'Sarah Johnson', img: IMG.sarah, status: 'Prep', tone: 'orange', time: '15:30' },
            { id: 'ORD-003', name: 'Mike Wilson', img: IMG.mike, status: 'Confirmed', tone: 'green', time: '16:00' },
          ].map((o, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
              <img src={o.img} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{o.name}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-5)' }}>{o.id} · {o.time}</div>
              </div>
              <StatusPill tone={o.tone} dot>{o.status}</StatusPill>
            </div>
          ))}
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Top products</div>
          {[
            { n: 'Organic Tomatoes', img: IMG.tomatoes, sold: 142, rev: '₹61,912' },
            { n: 'Artisan Bread', img: IMG.bread, sold: 98, rev: '₹34,594' },
            { n: 'Greek Yogurt', img: IMG.yogurt, sold: 76, rev: '₹25,232' },
          ].map((p, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
              <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: 'var(--gray-4)' }}>0{i + 1}</span>
              <img src={p.img} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.n}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)' }}>{p.sold} sold</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{p.rev}</div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Stock alerts</div>
            <StatusPill tone="orange">8 items</StatusPill>
          </div>
          {[
            { n: 'Tomatoes', s: '3kg / 20kg', tone: 'red' },
            { n: 'Bread', s: '8 / 50 loaves', tone: 'orange' },
            { n: 'Yogurt', s: '12 / 40 tubs', tone: 'orange' },
          ].map((it, i, a) => {
            const tones = { red: 'var(--brand)', orange: 'var(--orange)' };
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: tones[it.tone] }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{it.n}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', fontFamily: 'JetBrains Mono, monospace' }}>{it.s}</div>
                <Btn kind="outline" size="sm">Restock</Btn>
              </div>
            );
          })}
        </Card>
      </div>
    </WebShell>
  );
}

// 03 ACTION-FIRST DASHBOARD
function WebDashAction() {
  return (
    <WebShell label="03 Action Dashboard" active="dash" title="Needs your attention" sub="6 actions waiting">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { tone: 'red', count: 5, title: 'Pending orders', sub: '3 awaiting confirmation', cta: 'Review orders' },
          { tone: 'orange', count: 8, title: 'Low stock', sub: 'Tomatoes, Bread + 6 more', cta: 'Restock' },
          { tone: 'dark', count: 2, title: 'Expiring soon', sub: 'Use within 3 days', cta: 'Discount' },
        ].map((a, i) => {
          const tones = {
            red: { bg: '#FFF6F7', accent: 'var(--brand)', soft: 'var(--red-soft)' },
            orange: { bg: '#FFF8F0', accent: 'var(--orange)', soft: 'var(--orange-soft)' },
            dark: { bg: 'var(--ink)', accent: '#fff', soft: 'rgba(255,255,255,0.12)', text: '#fff' },
          };
          const c = tones[a.tone];
          return (
            <div key={i} style={{ background: c.bg, color: c.text || 'var(--ink)', borderRadius: 14, padding: 24, border: a.tone === 'dark' ? 'none' : '1px solid var(--gray-2)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: c.soft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{a.count}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 14 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: a.tone === 'dark' ? 'rgba(255,255,255,0.65)' : 'var(--gray-5)', marginTop: 4 }}>{a.sub}</div>
              <button style={{ marginTop: 20, height: 38, padding: '0 16px', borderRadius: 9, background: a.tone === 'dark' ? '#fff' : c.accent, color: a.tone === 'dark' ? 'var(--ink)' : '#fff', fontSize: 13, fontWeight: 700 }}>{a.cta} →</button>
            </div>
          );
        })}
      </div>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Today's deliveries</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--gray-2)' }}>
            <th style={th}>Time</th><th style={th}>Customer</th><th style={th}>Address</th><th style={th}>Items</th><th style={th}>Total</th><th style={th}>Status</th>
          </tr></thead>
          <tbody>
            {[
              { time: '11:00', name: 'Mike Wilson', img: IMG.mike, addr: '789 Pine St', items: 3, total: '₹540', tone: 'green', status: 'Delivered' },
              { time: '14:00', name: 'John Smith', img: IMG.john, addr: '123 Main St', items: 2, total: '₹1,349', tone: 'red', status: 'En route' },
              { time: '16:30', name: 'Sarah Johnson', img: IMG.sarah, addr: '456 Oak Ave', items: 4, total: '₹890', tone: 'orange', status: 'Prep' },
              { time: '18:00', name: 'Anna Garcia', img: IMG.priya, addr: '321 Elm St', items: 1, total: '₹240', tone: 'gray', status: 'Pending' },
            ].map((d, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--gray-2)' }}>
                <td style={td}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{d.time}</span></td>
                <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src={d.img} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} /><span style={{ fontWeight: 600 }}>{d.name}</span></div></td>
                <td style={{ ...td, color: 'var(--gray-5)' }}>{d.addr}</td>
                <td style={td}>{d.items}</td>
                <td style={{ ...td, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{d.total}</td>
                <td style={td}><StatusPill tone={d.tone} dot>{d.status}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </WebShell>
  );
}

const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-5)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td = { padding: '12px', verticalAlign: 'middle' };

// 04 INVENTORY
function WebInventory() {
  const items = [
    { n: 'Organic Tomatoes', cat: 'Vegetables', img: IMG.tomatoes, stock: 3, max: 20, unit: 'kg', status: 'Low', tone: 'red' },
    { n: 'Artisan Bread', cat: 'Bakery', img: IMG.bread, stock: 8, max: 50, unit: 'loaves', status: 'Low', tone: 'orange' },
    { n: 'Greek Yogurt', cat: 'Dairy', img: IMG.yogurt, stock: 12, max: 40, unit: 'tubs', status: 'OK', tone: 'green' },
    { n: 'Organic Apples', cat: 'Fruits', img: IMG.apples, stock: 28, max: 30, unit: 'kg', status: 'OK', tone: 'green' },
    { n: 'Fresh Milk', cat: 'Dairy', img: IMG.milk, stock: 0, max: 60, unit: 'ltr', status: 'Out', tone: 'red' },
    { n: 'Organic Carrots', cat: 'Vegetables', img: IMG.carrots, stock: 18, max: 25, unit: 'kg', status: 'OK', tone: 'green' },
  ];
  return (
    <WebShell label="04 Inventory" active="inventory" title="Inventory" sub="156 items · 8 alerts"
      actions={<><Btn kind="outline" icon={I.filter}>Filter</Btn><Btn icon={I.plus}>Add product</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatTile label="Total items" value="156" />
        <StatTile label="Low stock" value="8" delta="needs attn" deltaTone="red" />
        <StatTile label="Out of stock" value="2" delta="urgent" deltaTone="red" />
        <StatTile label="Inventory value" value="₹2.4L" delta="+4%" />
      </div>

      <Card p={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-2)', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 36, padding: '0 14px', background: 'var(--gray-1)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray-5)', fontSize: 13 }}>
            <span>{I.search}</span> Search products...
          </div>
          {['All', 'Vegetables', 'Bakery', 'Dairy', 'Fruits'].map((c, i) => (
            <span key={i} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: i === 0 ? 'var(--ink)' : 'transparent', color: i === 0 ? '#fff' : 'var(--gray-5)' }}>{c}</span>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--gray-2)' }}>
            <th style={th}>Product</th><th style={th}>Category</th><th style={th}>Stock</th><th style={th}>Status</th><th style={th}>Last updated</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => {
              const pct = it.stock / it.max;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--gray-2)' }}>
                  <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={it.img} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} /><div style={{ fontWeight: 600 }}>{it.n}</div></div></td>
                  <td style={{ ...td, color: 'var(--gray-5)' }}>{it.cat}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 80, height: 6, background: 'var(--gray-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: it.tone === 'red' ? 'var(--brand)' : it.tone === 'orange' ? 'var(--orange)' : 'var(--green)' }} />
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600 }}>{it.stock}/{it.max} {it.unit}</span>
                    </div>
                  </td>
                  <td style={td}><StatusPill tone={it.tone} dot>{it.status}</StatusPill></td>
                  <td style={{ ...td, color: 'var(--gray-5)' }}>2h ago</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.tone === 'red' || it.tone === 'orange' ? <Btn size="sm">Restock</Btn> : <span style={{ color: 'var(--gray-4)' }}>{I.more}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </WebShell>
  );
}

// 05 ORDERS
function WebOrders() {
  const orders = [
    { id: 'ORD-001', cust: 'John Smith', img: IMG.john, items: 2, total: '₹1,349', status: 'En route', tone: 'red', time: '14:00' },
    { id: 'ORD-002', cust: 'Sarah Johnson', img: IMG.sarah, items: 4, total: '₹890', status: 'Prep', tone: 'orange', time: '15:30' },
    { id: 'ORD-003', cust: 'Mike Wilson', img: IMG.mike, items: 3, total: '₹540', status: 'Delivered', tone: 'green', time: '11:00' },
    { id: 'ORD-004', cust: 'Anna Garcia', img: IMG.priya, items: 1, total: '₹240', status: 'Pending', tone: 'gray', time: '18:00' },
    { id: 'ORD-005', cust: 'David Lee', img: IMG.john, items: 5, total: '₹2,180', status: 'Delivered', tone: 'green', time: '09:30' },
    { id: 'ORD-006', cust: 'Emma Wilson', img: IMG.sarah, items: 2, total: '₹742', status: 'Confirmed', tone: 'green', time: '17:00' },
  ];
  return (
    <WebShell label="05 Orders" active="orders" title="Orders" sub="42 today"
      actions={<><Btn kind="outline" icon={I.download}>Export</Btn><Btn icon={I.plus}>New order</Btn></>}>
      <Card p={0}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-2)' }}>
          {[
            { l: 'All', n: 42, a: true },
            { l: 'Pending', n: 5 },
            { l: 'Active', n: 12 },
            { l: 'Delivered', n: 24 },
            { l: 'Cancelled', n: 1 },
          ].map((t, i) => (
            <div key={i} style={{ padding: '14px 20px', borderBottom: t.a ? '2px solid var(--brand)' : '2px solid transparent', color: t.a ? 'var(--ink)' : 'var(--gray-5)', fontSize: 13, fontWeight: t.a ? 700 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.l} <span style={{ background: t.a ? 'var(--red-soft)' : 'var(--gray-1)', color: t.a ? 'var(--brand)' : 'var(--gray-5)', fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>{t.n}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ padding: 14, display: 'flex', gap: 8 }}>
            <Btn kind="outline" size="sm" icon={I.filter}>Filter</Btn>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--gray-2)' }}>
            <th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Items</th><th style={th}>Total</th><th style={th}>Status</th><th style={th}>Time</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--gray-2)' }}>
                <td style={td}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600 }}>{o.id}</span></td>
                <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src={o.img} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} /><span style={{ fontWeight: 600 }}>{o.cust}</span></div></td>
                <td style={td}>{o.items}</td>
                <td style={{ ...td, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{o.total}</td>
                <td style={td}><StatusPill tone={o.tone} dot>{o.status}</StatusPill></td>
                <td style={{ ...td, color: 'var(--gray-5)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{o.time}</td>
                <td style={{ ...td, textAlign: 'right' }}><span style={{ color: 'var(--gray-4)' }}>{I.more}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </WebShell>
  );
}

// 06 ORDER DETAIL
function WebOrderDetail() {
  return (
    <WebShell label="06 Order Detail" active="orders" title="Order ORD-001" breadcrumb={['Orders', 'ORD-001']}
      actions={<><Btn kind="outline">Print receipt</Btn><Btn>Mark delivered</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status hero */}
          <div style={{ background: 'var(--brand)', color: '#fff', borderRadius: 14, padding: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 4, background: '#fff' }} /> LIVE STATUS
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', marginTop: 6 }}>Out for delivery</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.18)', padding: '8px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>ETA 14:00</div>
            </div>
            <div style={{ marginTop: 24, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 11, left: 11, right: 11, height: 2, background: 'rgba(255,255,255,0.25)' }} />
              <div style={{ position: 'absolute', top: 11, left: 11, width: '75%', height: 2, background: '#fff' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {['Placed', 'Confirmed', 'Prep', 'Out', 'Done'].map((s, i) => {
                  const done = i < 4;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 11, background: done ? '#fff' : 'transparent', border: done ? 'none' : '2px solid rgba(255,255,255,0.4)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m4 12 6 6L20 6"/></svg>}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: done ? '#fff' : 'rgba(255,255,255,0.55)' }}>{s}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Items */}
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Items · 2</div>
            {[
              { n: 'Organic Tomatoes', q: '2 kg', p: 706, img: IMG.tomatoes },
              { n: 'Artisan Bread', q: '1 loaf', p: 353, img: IMG.bread },
            ].map((it, i, a) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <img src={it.img} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{it.n}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-5)' }}>{it.q}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>₹{it.p}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: 14, background: 'var(--gray-1)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span style={{ color: 'var(--gray-5)' }}>Subtotal</span><span>₹1,059</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span style={{ color: 'var(--gray-5)' }}>Delivery</span><span>₹290</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--gray-2)' }}><span>Total</span><span style={{ color: 'var(--brand)', fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', fontSize: 22, fontWeight: 800 }}>₹1,349</span></div>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Customer</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={IMG.john} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>John Smith</div>
                <div style={{ fontSize: 12, color: 'var(--gray-5)' }}>+91 98765 43210</div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-2)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 700, marginBottom: 4 }}>DELIVERY ADDRESS</div>
              123 Main Street, Bandra West<br />Mumbai 400050
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Activity</div>
            {[
              { t: 'Out for delivery', when: '13:42', tone: 'red' },
              { t: 'Order packed', when: '13:15', tone: 'orange' },
              { t: 'Order confirmed', when: '12:48', tone: 'green' },
              { t: 'Payment received', when: '12:45', tone: 'green' },
            ].map((a, i, ar) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: i === ar.length - 1 ? 0 : 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: a.tone === 'red' ? 'var(--brand)' : a.tone === 'orange' ? 'var(--orange)' : 'var(--green)' }} />
                  {i !== ar.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--gray-2)', marginTop: 4, minHeight: 24 }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.t}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-5)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{a.when}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </WebShell>
  );
}

// 12 NOTIFICATIONS
function WebNotifs() {
  const items = [
    { t: 'New order received', sub: 'John Smith · ORD-001 · ₹1,349', when: '2 min ago', tone: 'red', unread: true },
    { t: 'Stock alert', sub: 'Tomatoes are running low (3kg remaining)', when: '12 min ago', tone: 'orange', unread: true },
    { t: 'Order delivered', sub: 'ORD-098 · Mike Wilson', when: '1 hour ago', tone: 'green' },
    { t: 'New 5-star review', sub: 'Sarah J. on Artisan Bread', when: '3 hours ago', tone: 'gray' },
    { t: 'Vendor request', sub: 'Green Valley wants to be your supplier', when: 'Yesterday', tone: 'gray' },
    { t: 'Weekly report ready', sub: 'Revenue up 12% this week', when: '2 days ago', tone: 'gray' },
  ];
  return (
    <WebShell label="12 Notifications" active="notifs" title="Notifications" sub="2 unread"
      actions={<Btn kind="outline">Mark all read</Btn>}>
      <Card p={0}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-2)' }}>
          {['All', 'Orders', 'Inventory', 'System'].map((t, i) => (
            <div key={i} style={{ padding: '14px 20px', borderBottom: i === 0 ? '2px solid var(--brand)' : '2px solid transparent', color: i === 0 ? 'var(--ink)' : 'var(--gray-5)', fontSize: 13, fontWeight: i === 0 ? 700 : 500 }}>{t}</div>
          ))}
        </div>
        {items.map((n, i, a) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 18, borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)', background: n.unread ? 'rgba(230, 57, 70, 0.02)' : 'transparent' }}>
            {n.unread && <span className="live-dot" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--brand)', marginTop: 6 }} />}
            {!n.unread && <span style={{ width: 8, height: 8, marginTop: 6 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{n.t}</div>
              <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>{n.sub}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-5)', fontFamily: 'JetBrains Mono, monospace' }}>{n.when}</div>
          </div>
        ))}
      </Card>
    </WebShell>
  );
}

Object.assign(window, { WebLogin, WebDashboard, WebDashAction, WebInventory, WebOrders, WebOrderDetail, WebNotifs });
