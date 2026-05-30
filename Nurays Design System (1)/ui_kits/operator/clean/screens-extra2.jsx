// screens-extra2.jsx — Final 6 screens (Vendors, Reports, Customer, Notifications, Settings, Checkout)

const { IMG, I, Phone, SectionTitle } = window;

// ============================================================
// 09 — VENDORS
// ============================================================
function Vendors() {
  const vendors = [
    { name: 'Fresh Farm Co.', cat: 'Vegetables · Fruits', rating: 4.9, products: 24, img: IMG.tomatoes, status: 'active' },
    { name: 'Artisan Bakery', cat: 'Bakery', rating: 4.8, products: 12, img: IMG.bread, status: 'active' },
    { name: 'Dairy Delights', cat: 'Dairy', rating: 4.6, products: 18, img: IMG.milk, status: 'active' },
    { name: 'Green Valley', cat: 'Organics', rating: 4.7, products: 31, img: IMG.apples, status: 'pending' },
    { name: 'City Spices Ltd', cat: 'Spices · Pantry', rating: 4.5, products: 42, img: IMG.carrots, status: 'active' },
  ];
  return (
    <Phone label="09 Vendors" tab="more" fab>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Vendors</div>
        <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>5 active · 1 pending review</div>
      </div>

      {/* Top spend card */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: 'var(--ink)', color: '#fff', borderRadius: 22, padding: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>SPEND THIS MONTH</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', marginTop: 4 }}>₹84,200</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[42, 28, 18, 12].map((pct, i) => (
              <div key={i} style={{ flex: pct, height: 6, borderRadius: 3, background: i === 0 ? 'var(--brand)' : i === 1 ? 'var(--orange)' : i === 2 ? '#fff' : 'rgba(255,255,255,0.3)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.85 }}>
            <span>Fresh Farm 42%</span>
            <span>Bakery 28%</span>
            <span>Others 30%</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 20px 24px' }}>
        <SectionTitle action="Filter">All vendors</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vendors.map((v, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
              <img src={v.img} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{v.name}</span>
                  {v.status === 'pending' && <span style={{ background: 'var(--orange-soft)', color: 'var(--orange)', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>PENDING</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2 }}>{v.cat}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--gray-5)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--orange)' }}>{I.star}</span><b style={{ color: 'var(--ink)' }}>{v.rating}</b></span>
                  <span>·</span>
                  <span>{v.products} products</span>
                </div>
              </div>
              <span style={{ color: 'var(--gray-4)' }}>{I.chev}</span>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// ============================================================
// 10 — REPORTS
// ============================================================
function Reports() {
  const bars = [12, 18, 15, 22, 28, 19, 24, 32, 28, 35, 30, 38];
  return (
    <Phone label="10 Reports" tab="more">
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Reports</div>
            <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>Last 12 weeks</div>
          </div>
          <button style={{ height: 36, padding: '0 12px', borderRadius: 12, background: 'var(--gray-1)', color: 'var(--ink)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            Q2 2025 {I.chev}
          </button>
        </div>
      </div>

      {/* Big total card */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 22, padding: 18, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>TOTAL REVENUE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)' }}>₹4,82,650</div>
            <span style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>+24%</span>
          </div>

          {/* Bar chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110, marginTop: 18 }}>
            {bars.map((v, i) => (
              <div key={i} style={{ flex: 1, height: `${(v / 38) * 100}%`, borderRadius: 5, minHeight: 4, background: i === bars.length - 1 ? 'var(--brand)' : i >= bars.length - 4 ? '#FFB3B8' : 'var(--gray-2)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: 'var(--gray-4)', fontWeight: 600 }}>
            <span>W1</span><span>W3</span><span>W5</span><span>W7</span><span>W9</span><span>W11</span>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ padding: '14px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { l: 'Orders', v: '1,284', d: '+12%', tone: 'green' },
          { l: 'Avg ticket', v: '₹376', d: '+4%', tone: 'green' },
          { l: 'Returns', v: '2.1%', d: '-0.4%', tone: 'green' },
          { l: 'New customers', v: '142', d: '+18%', tone: 'green' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 4 }}>{s.v}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>{s.d}</div>
          </div>
        ))}
      </div>

      {/* Top products */}
      <div style={{ padding: '20px 20px 24px' }}>
        <SectionTitle>Top products</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {[
            { n: 'Organic Tomatoes', img: IMG.tomatoes, sold: 142, rev: '₹61,912' },
            { n: 'Artisan Bread', img: IMG.bread, sold: 98, rev: '₹34,594' },
            { n: 'Greek Yogurt', img: IMG.yogurt, sold: 76, rev: '₹25,232' },
          ].map((p, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
              <div style={{ width: 24, fontSize: 12, fontWeight: 800, color: 'var(--gray-4)', fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>0{i + 1}</div>
              <img src={p.img} alt="" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.n}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2 }}>{p.sold} sold</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)' }}>{p.rev}</div>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

// ============================================================
// 11 — CUSTOMER
// ============================================================
function Customer() {
  return (
    <Phone label="11 Customer">
      {/* Header w/ back */}
      <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.back}</button>
        <div style={{ flex: 1 }} />
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.more}</button>
      </div>

      {/* Profile hero */}
      <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <img src={IMG.john} alt="" style={{ width: 88, height: 88, borderRadius: 24, objectFit: 'cover', boxShadow: 'var(--shadow-md)' }} />
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 12 }}>John Smith</div>
        <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>Customer since Jan 2024</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 99, marginTop: 10, letterSpacing: '0.04em' }}>
          ⭐ VIP CUSTOMER
        </div>
      </div>

      {/* Action row */}
      <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { l: 'Call', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5c0-1 1-2 2-2h3l2 5-3 1c1 3 3 5 6 6l1-3 5 2v3c0 1-1 2-2 2C9 19 5 15 3 5Z"/></svg>, tone: 'green' },
          { l: 'Message', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, tone: 'red' },
          { l: 'Email', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1 0 2 1 2 2v12c0 1-1 2-2 2H4c-1 0-2-1-2-2V6c0-1 1-2 2-2Z"/><path d="m22 6-10 7L2 6"/></svg>, tone: 'gray' },
        ].map((a, i) => {
          const tones = { green: { bg: 'var(--green)', fg: '#fff' }, red: { bg: 'var(--brand)', fg: '#fff' }, gray: { bg: 'var(--gray-1)', fg: 'var(--ink)' } };
          const c = tones[a.tone];
          return (
            <button key={i} style={{ background: c.bg, color: c.fg, height: 64, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}>
              {a.icon}<span>{a.l}</span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, margin: '20px', boxShadow: 'var(--shadow-sm)' }}>
        {[
          { l: 'Orders', v: '24' },
          { l: 'Spent', v: '₹18.4k' },
          { l: 'Avg', v: '₹767' },
        ].map((s, i, arr) => (
          <div key={i} style={{ padding: '16px 8px', textAlign: 'center', borderRight: i === arr.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.v}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2, fontWeight: 600 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ padding: '0 20px 24px' }}>
        <SectionTitle action="See all">Recent orders</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {[
            { id: 'ORD-001', date: 'Today, 12:30', total: '₹1,349', status: 'En route', tone: 'red' },
            { id: 'ORD-098', date: '3 May', total: '₹742', status: 'Delivered', tone: 'green' },
            { id: 'ORD-094', date: '1 May', total: '₹2,180', status: 'Delivered', tone: 'green' },
          ].map((o, i, arr) => {
            const tones = { red: { bg: 'var(--red-soft)', fg: 'var(--brand)' }, green: { bg: 'var(--green-soft)', fg: 'var(--green)' } };
            const c = tones[o.tone];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{o.id}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2 }}>{o.date}</div>
                </div>
                <span style={{ background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 99 }}>{o.status}</span>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)', minWidth: 60, textAlign: 'right' }}>{o.total}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Phone>
  );
}

// ============================================================
// 12 — NOTIFICATIONS
// ============================================================
function Notifications() {
  const items = [
    { t: 'New order', sub: 'John Smith · ₹1,349 · 2 items', when: '2m ago', tone: 'red', icon: I.bag, unread: true },
    { t: 'Stock alert', sub: 'Tomatoes are running low (3kg left)', when: '12m ago', tone: 'orange', icon: I.alert, unread: true },
    { t: 'Order delivered', sub: 'ORD-098 · Mike Wilson', when: '1h ago', tone: 'green', icon: I.bag },
    { t: 'New review', sub: 'Sarah J. left a 5-star review on Bread', when: '3h ago', tone: 'gray', icon: I.star },
    { t: 'Vendor request', sub: 'Green Valley wants to be your supplier', when: 'Yesterday', tone: 'gray', icon: I.users },
    { t: 'Weekly report ready', sub: 'Revenue up 12% this week', when: '2d ago', tone: 'gray', icon: I.chart },
  ];
  return (
    <Phone label="12 Notifications">
      <div style={{ padding: '14px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Notifications</div>
          <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 2 }}>2 unread</div>
        </div>
        <button style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>Mark all read</button>
      </div>

      {/* Tabs */}
      <div style={{ padding: 4, background: 'var(--gray-1)', margin: '14px 20px 0', borderRadius: 14, display: 'flex', gap: 4 }}>
        {['All', 'Orders', 'Inventory', 'System'].map((t, i) => (
          <button key={t} style={{ flex: 1, padding: '10px 6px', borderRadius: 10, background: i === 0 ? '#fff' : 'transparent', color: i === 0 ? 'var(--ink)' : 'var(--gray-5)', fontSize: 12, fontWeight: i === 0 ? 700 : 600, boxShadow: i === 0 ? 'var(--shadow-sm)' : 'none' }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((n, i) => {
          const tones = {
            red:    { bg: 'var(--red-soft)',    fg: 'var(--brand)' },
            orange: { bg: 'var(--orange-soft)', fg: 'var(--orange)' },
            green:  { bg: 'var(--green-soft)',  fg: 'var(--green)' },
            gray:   { bg: 'var(--gray-1)',      fg: 'var(--gray-5)' },
          };
          const c = tones[n.tone];
          return (
            <div key={i} style={{ background: '#fff', border: `1px solid ${n.unread ? 'rgba(230, 57, 70, 0.2)' : 'var(--gray-2)'}`, borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: n.unread ? '0 4px 12px -2px rgba(230, 57, 70, 0.12)' : 'none', position: 'relative' }}>
              {n.unread && <span style={{ position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4, background: 'var(--brand)' }} className="live-dot" />}
              <div style={{ width: 40, height: 40, borderRadius: 12, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n.icon}</div>
              <div style={{ flex: 1, minWidth: 0, paddingRight: n.unread ? 14 : 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{n.t}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>{n.sub}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-4)', marginTop: 4, fontWeight: 600 }}>{n.when}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Phone>
  );
}

// ============================================================
// 13 — SETTINGS
// ============================================================
function Settings() {
  const Section = ({ title, children }) => (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gray-5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 4 }}>{title}</div>
      <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 4, boxShadow: 'var(--shadow-sm)' }}>{children}</div>
    </div>
  );
  const Row = ({ icon, label, value, toggle, danger, last }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderBottom: last ? 'none' : '1px solid var(--gray-2)' }}>
      {icon && <div style={{ width: 36, height: 36, borderRadius: 10, background: danger ? 'var(--red-soft)' : 'var(--gray-1)', color: danger ? 'var(--brand)' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>}
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: danger ? 'var(--brand)' : 'var(--ink)' }}>{label}</div>
      {value && <div style={{ fontSize: 12, color: 'var(--gray-5)', fontWeight: 600 }}>{value}</div>}
      {toggle !== undefined && (
        <div style={{ width: 38, height: 22, borderRadius: 11, background: toggle ? 'var(--brand)' : 'var(--gray-3)', position: 'relative', transition: 'background .2s' }}>
          <div style={{ position: 'absolute', top: 2, left: toggle ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s' }} />
        </div>
      )}
      {!toggle && !value && <span style={{ color: 'var(--gray-4)' }}>{I.chev}</span>}
    </div>
  );
  return (
    <Phone label="13 Settings" tab="more">
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>Settings</div>
      </div>

      {/* Profile card */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: 'linear-gradient(135deg, #FFE5E7 0%, #FFF6F7 100%)', borderRadius: 22, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={IMG.priya} alt="" style={{ width: 56, height: 56, borderRadius: 18, objectFit: 'cover', boxShadow: 'var(--shadow-sm)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)' }}>Priya Sharma</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>Kitchen Co. · Owner</div>
          </div>
          <button style={{ background: '#fff', color: 'var(--ink)', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>Edit</button>
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <Section title="Business">
          <Row icon={I.bag} label="Business profile" />
          <Row icon={I.users} label="Team & roles" value="3 members" />
          <Row icon={I.chart} label="Operating hours" last />
        </Section>
        <Section title="Preferences">
          <Row icon={I.bell} label="Push notifications" toggle={true} />
          <Row icon={I.bell} label="Order alerts (sound)" toggle={true} />
          <Row icon={I.search} label="Dark mode" toggle={false} last />
        </Section>
        <Section title="Account">
          <Row icon={I.users} label="Personal details" />
          <Row icon={I.alert} label="Security & privacy" />
          <Row label="Sign out" danger last />
        </Section>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--gray-4)', marginTop: 18 }}>Nurays · v2.1.0</div>
      </div>
    </Phone>
  );
}

// ============================================================
// 14 — CHECKOUT
// ============================================================
function Checkout() {
  return (
    <Phone label="14 Checkout">
      <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gray-1)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.back}</button>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--ink)' }}>Checkout</div>
      </div>

      {/* Items collapsed */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 14, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>3 items</div>
            <button style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>Edit</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[IMG.tomatoes, IMG.bread, IMG.yogurt].map((img, i) => (
              <img key={i} src={img} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Address */}
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle action="Change">Deliver to</SectionTitle>
        <div style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--red-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📍</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Home</div>
            <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2, lineHeight: 1.4 }}>123 Main Street, Bandra West<br />Mumbai 400050</div>
          </div>
        </div>
      </div>

      {/* Payment options */}
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle>Payment</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { name: 'UPI · Priya@oksbi', sub: 'Pay via any UPI app', selected: true, icon: <div style={{ background: 'var(--brand)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>UPI</div> },
            { name: 'Visa ··4521', sub: 'Expires 09/27', selected: false, icon: <div style={{ background: 'var(--ink)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>VISA</div> },
            { name: 'Cash on delivery', sub: '+₹20 fee', selected: false, icon: <div style={{ background: 'var(--green)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💵</div> },
          ].map((p, i) => (
            <div key={i} style={{ background: '#fff', border: `1.5px solid ${p.selected ? 'var(--brand)' : 'var(--gray-2)'}`, borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 12, boxShadow: p.selected ? '0 0 0 4px rgba(230, 57, 70, 0.06)' : 'none' }}>
              {p.icon}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2 }}>{p.sub}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${p.selected ? 'var(--brand)' : 'var(--gray-3)'}`, background: p.selected ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.selected && <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bill summary */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: 'var(--gray-1)', borderRadius: 18, padding: 16 }}>
          {[
            { l: 'Subtotal', v: '₹1,059' },
            { l: 'Delivery', v: '₹49' },
            { l: 'Discount', v: '-₹100', d: true },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--gray-5)' }}>{r.l}</span>
              <span style={{ color: r.d ? 'var(--green)' : 'var(--ink)', fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 8, borderTop: '1px solid var(--gray-2)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)', letterSpacing: '-0.02em' }}>₹1,008</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '20px 20px 24px' }}>
        <button style={{ width: '100%', height: 56, borderRadius: 18, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 800, boxShadow: '0 8px 20px -4px rgba(230, 57, 70, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px' }}>
            <span>Place order</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ₹1,008
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </span>
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--gray-5)', marginTop: 10 }}>By placing order, you agree to our <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Terms</span></div>
      </div>
    </Phone>
  );
}

window.Vendors = Vendors;
window.Reports = Reports;
window.Customer = Customer;
window.Notifications = Notifications;
window.Settings = Settings;
window.Checkout = Checkout;
