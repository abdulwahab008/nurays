// web-screens2.jsx — Products, Product Detail, Vendors, Reports, Customer, Settings, Checkout
const { WebShell, Card, Btn, StatTile, StatusPill } = window;
const { I, IMG } = window;

const th2 = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-5)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td2 = { padding: '12px', verticalAlign: 'middle' };

// 07 PRODUCTS
function WebProducts() {
  const products = [
    { n: 'Organic Tomatoes', img: IMG.tomatoes, cat: 'Vegetables', price: '₹436/kg', stock: '3 kg', rating: 4.8, sold: 142 },
    { n: 'Artisan Bread', img: IMG.bread, cat: 'Bakery', price: '₹353', stock: '8', rating: 4.9, sold: 98 },
    { n: 'Greek Yogurt', img: IMG.yogurt, cat: 'Dairy', price: '₹332', stock: '12', rating: 4.7, sold: 76 },
    { n: 'Organic Apples', img: IMG.apples, cat: 'Fruits', price: '₹290/kg', stock: '28 kg', rating: 4.6, sold: 64 },
    { n: 'Fresh Milk', img: IMG.milk, cat: 'Dairy', price: '₹185/L', stock: '0', rating: 4.5, sold: 52 },
    { n: 'Organic Carrots', img: IMG.carrots, cat: 'Vegetables', price: '₹210/kg', stock: '18 kg', rating: 4.7, sold: 48 },
  ];
  return (
    <WebShell label="07 Products" active="products" title="Products" sub="156 items in catalog"
      actions={<><Btn kind="outline" icon={I.filter}>Filter</Btn><Btn icon={I.plus}>Add product</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {products.map((p, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--gray-2)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ position: 'relative', height: 160, background: 'var(--gray-1)' }}>
              <img src={p.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.95)', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{p.cat}</span>
              {p.stock === '0' && <span style={{ position: 'absolute', top: 12, right: 12, background: 'var(--brand)', color: '#fff', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Out</span>}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{p.n}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-5)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <span style={{ color: 'var(--orange)' }}>{I.star}</span> {p.rating} · {p.sold} sold
                  </div>
                </div>
                <span style={{ color: 'var(--gray-4)' }}>{I.more}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)' }}>{p.price}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', fontFamily: 'JetBrains Mono, monospace' }}>{p.stock} in stock</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </WebShell>
  );
}

// 08 PRODUCT DETAIL
function WebProductDetail() {
  return (
    <WebShell label="08 Product Detail" active="products" title="Organic Tomatoes" breadcrumb={['Products', 'Organic Tomatoes']}
      actions={<><Btn kind="outline" icon={I.edit}>Edit</Btn><Btn>Restock</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--gray-1)' }}>
            <img src={IMG.tomatoes} alt="" style={{ width: '100%', height: 420, objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[IMG.tomatoes, IMG.apples, IMG.carrots, IMG.bread].map((src, i) => (
              <div key={i} style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: i === 0 ? '2px solid var(--brand)' : '1px solid var(--gray-2)' }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusPill tone="green" dot>In stock</StatusPill>
            <span style={{ fontSize: 12, color: 'var(--gray-5)' }}>SKU-2453</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', letterSpacing: '-0.02em', marginTop: 10 }}>Organic Tomatoes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 13, color: 'var(--gray-5)' }}>
            <span style={{ color: 'var(--orange)', display: 'inline-flex', gap: 2 }}>{I.star}{I.star}{I.star}{I.star}{I.star}</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>4.8</span>
            <span>· 124 reviews · 142 sold</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 24 }}>
            <span style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)', letterSpacing: '-0.02em' }}>₹436</span>
            <span style={{ fontSize: 16, color: 'var(--gray-4)', textDecoration: 'line-through' }}>₹520</span>
            <span style={{ background: 'var(--green-soft)', color: 'var(--green)', padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>16% OFF</span>
          </div>

          <div style={{ marginTop: 24, fontSize: 14, color: 'var(--gray-5)', lineHeight: 1.6 }}>
            Premium farm-fresh organic tomatoes. Hand-picked from certified organic farms. Rich in antioxidants and vitamins.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24 }}>
            {[
              { l: 'Stock', v: '3 kg', tone: 'red' },
              { l: 'Vendor', v: 'Green Valley' },
              { l: 'Origin', v: 'Nashik, MH' },
            ].map((s, i) => (
              <div key={i} style={{ padding: 14, background: 'var(--gray-1)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 600 }}>{s.l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: s.tone === 'red' ? 'var(--brand)' : 'var(--ink)' }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <Btn kind="outline" size="lg">Edit details</Btn>
            <button style={{ flex: 1, height: 50, borderRadius: 10, background: 'var(--ink)', color: '#fff', fontSize: 14, fontWeight: 700 }}>Restock now â†’</button>
          </div>
        </div>
      </div>
    </WebShell>
  );
}

// 09 VENDORS
function WebVendors() {
  const vendors = [
    { n: 'Green Valley Farms', cat: 'Vegetables · Organic', img: IMG.tomatoes, products: 28, rating: 4.9, status: 'Active', tone: 'green' },
    { n: 'Sunrise Bakery', cat: 'Bread · Pastries', img: IMG.bread, products: 14, rating: 4.8, status: 'Active', tone: 'green' },
    { n: 'Pure Dairy Co', cat: 'Milk · Yogurt · Cheese', img: IMG.milk, products: 22, rating: 4.7, status: 'Active', tone: 'green' },
    { n: 'Orchard Direct', cat: 'Fruits', img: IMG.apples, products: 18, rating: 4.6, status: 'Pending', tone: 'orange' },
  ];
  return (
    <WebShell label="09 Vendors" active="vendors" title="Vendors" sub="12 active suppliers"
      actions={<><Btn kind="outline" icon={I.filter}>Filter</Btn><Btn icon={I.plus}>Add vendor</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatTile label="Active vendors" value="12" delta="+2 new" />
        <StatTile label="Avg rating" value="4.7" delta="â˜… 4.7/5" />
        <StatTile label="Total products" value="156" />
        <StatTile label="Pending requests" value="3" delta="review" deltaTone="red" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {vendors.map((v, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', gap: 16 }}>
              <img src={v.img} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{v.n}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>{v.cat}</div>
                  </div>
                  <StatusPill tone={v.tone} dot>{v.status}</StatusPill>
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12, color: 'var(--gray-5)' }}>
                  <span><span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.products}</span> products</span>
                  <span><span style={{ color: 'var(--orange)', display: 'inline-flex', verticalAlign: 'middle' }}>{I.star}</span> <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.rating}</span></span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Btn kind="outline" size="sm">View products</Btn>
                  <Btn kind="secondary" size="sm">Message</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </WebShell>
  );
}

// 10 REPORTS
function WebReports() {
  return (
    <WebShell label="10 Reports" active="reports" title="Reports" sub="Last 30 days"
      actions={<><Btn kind="outline">Last 30 days</Btn><Btn kind="outline" icon={I.download}>Export PDF</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatTile label="Revenue" value="₹3.84L" delta="+18%" sparkline={[40,60,55,80,90,70,85,100]} />
        <StatTile label="Orders" value="1,284" delta="+12%" sparkline={[20,30,25,40,45,35,50,55]} />
        <StatTile label="New customers" value="312" delta="+24%" sparkline={[5,8,12,15,18,22,28,32]} />
        <StatTile label="Return rate" value="2.4%" delta="-0.6%" sparkline={[5,4,4,3,3,2.5,2.4,2.4]} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue trend</div>
              <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>Compared to previous 30 days</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--brand)' }} /> This period</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gray-5)' }}><span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--gray-3)' }} /> Previous</span>
            </div>
          </div>
          <svg width="100%" height="220" viewBox="0 0 700 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E63946" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#E63946" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,180 L70,160 L140,140 L210,150 L280,110 L350,120 L420,80 L490,100 L560,60 L630,70 L700,40 L700,220 L0,220 Z" fill="url(#grad)" />
            <path d="M0,180 L70,160 L140,140 L210,150 L280,110 L350,120 L420,80 L490,100 L560,60 L630,70 L700,40" fill="none" stroke="#E63946" strokeWidth="3" />
            <path d="M0,200 L70,190 L140,180 L210,185 L280,170 L350,175 L420,150 L490,160 L560,140 L630,145 L700,130" fill="none" stroke="#D4D1C9" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Sales by category</div>
          {[
            { n: 'Vegetables', v: 42, color: 'var(--brand)' },
            { n: 'Bakery', v: 28, color: 'var(--orange)' },
            { n: 'Dairy', v: 18, color: 'var(--green)' },
            { n: 'Fruits', v: 12, color: 'var(--ink-2)' },
          ].map((c, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>{c.n}</span>
                <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{c.v}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--gray-1)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${c.v}%`, height: '100%', background: c.color }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Top performing products</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--gray-2)' }}>
            <th style={th2}>Rank</th><th style={th2}>Product</th><th style={th2}>Units sold</th><th style={th2}>Revenue</th><th style={th2}>Margin</th><th style={th2}>Trend</th>
          </tr></thead>
          <tbody>
            {[
              { r: 1, n: 'Organic Tomatoes', img: IMG.tomatoes, units: 142, rev: '₹61,912', margin: '24%', trend: '+18%' },
              { r: 2, n: 'Artisan Bread', img: IMG.bread, units: 98, rev: '₹34,594', margin: '32%', trend: '+12%' },
              { r: 3, n: 'Greek Yogurt', img: IMG.yogurt, units: 76, rev: '₹25,232', margin: '28%', trend: '+8%' },
              { r: 4, n: 'Organic Apples', img: IMG.apples, units: 64, rev: '₹18,560', margin: '22%', trend: '-2%' },
            ].map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--gray-2)' }}>
                <td style={td2}><span style={{ fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--gray-4)' }}>0{p.r}</span></td>
                <td style={td2}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src={p.img} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} /><span style={{ fontWeight: 600 }}>{p.n}</span></div></td>
                <td style={td2}>{p.units}</td>
                <td style={{ ...td2, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{p.rev}</td>
                <td style={td2}>{p.margin}</td>
                <td style={td2}><span style={{ color: p.trend.startsWith('+') ? 'var(--green)' : 'var(--brand)', fontWeight: 700 }}>{p.trend}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </WebShell>
  );
}

// 11 CUSTOMER PROFILE
function WebCustomer() {
  return (
    <WebShell label="11 Customer" active="customer" title="John Smith" breadcrumb={['Customers', 'John Smith']}
      actions={<><Btn kind="outline">Send message</Btn><Btn>Create order</Btn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <img src={IMG.john} alt="" style={{ width: 96, height: 96, borderRadius: 24, objectFit: 'cover', margin: '0 auto' }} />
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', marginTop: 14, letterSpacing: '-0.01em' }}>John Smith</div>
            <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 4 }}>Customer since Jan 2025</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '4px 10px', background: 'linear-gradient(135deg, #FFE5E7, #FEE9D6)', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
              <span style={{ color: 'var(--orange)' }}>{I.star}</span> VIP CUSTOMER
            </div>
          </div>
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gray-2)' }}>
            <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 700, marginBottom: 10, letterSpacing: '0.04em' }}>CONTACT</div>
            {[
              { l: 'Phone', v: '+91 98765 43210' },
              { l: 'Email', v: 'john@example.com' },
              { l: 'Address', v: '123 Main St, Bandra W' },
            ].map((c, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-5)' }}>{c.l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{c.v}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile label="Total orders" value="48" />
            <StatTile label="Total spent" value="₹64.3k" />
            <StatTile label="Avg ticket" value="₹1,340" />
            <StatTile label="Last order" value="2 days" />
          </div>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Recent orders</div>
              <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>View all â†’</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--gray-2)' }}>
                <th style={th2}>Order</th><th style={th2}>Date</th><th style={th2}>Items</th><th style={th2}>Total</th><th style={th2}>Status</th>
              </tr></thead>
              <tbody>
                {[
                  { id: 'ORD-001', d: 'Today', items: 2, total: '₹1,349', tone: 'red', s: 'En route' },
                  { id: 'ORD-088', d: '2 days ago', items: 3, total: '₹980', tone: 'green', s: 'Delivered' },
                  { id: 'ORD-072', d: '1 week ago', items: 5, total: '₹2,180', tone: 'green', s: 'Delivered' },
                  { id: 'ORD-058', d: '2 weeks ago', items: 2, total: '₹742', tone: 'green', s: 'Delivered' },
                ].map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gray-2)' }}>
                    <td style={td2}><span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{o.id}</span></td>
                    <td style={{ ...td2, color: 'var(--gray-5)' }}>{o.d}</td>
                    <td style={td2}>{o.items}</td>
                    <td style={{ ...td2, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{o.total}</td>
                    <td style={td2}><StatusPill tone={o.tone} dot>{o.s}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </WebShell>
  );
}

// 13 SETTINGS
function WebSettings() {
  return (
    <WebShell label="13 Settings" active="settings" title="Settings" sub="Manage your account and workspace">
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { l: 'Profile', a: true },
            { l: 'Business' },
            { l: 'Notifications' },
            { l: 'Payment methods' },
            { l: 'Team members' },
            { l: 'Security' },
            { l: 'Integrations' },
            { l: 'Billing' },
          ].map((it, i) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: it.a ? 'var(--gray-1)' : 'transparent', color: it.a ? 'var(--ink)' : 'var(--gray-5)', fontSize: 13, fontWeight: it.a ? 700 : 500, cursor: 'pointer' }}>{it.l}</div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Profile</div>
            <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 4, marginBottom: 24 }}>This information is shown publicly to your customers.</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
              <img src={IMG.priya} alt="" style={{ width: 80, height: 80, borderRadius: 18, objectFit: 'cover' }} />
              <div>
                <Btn kind="outline" size="sm">Change photo</Btn>
                <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 8 }}>JPG or PNG. Max 2MB.</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { l: 'Full name', v: 'Priya Sharma' },
                { l: 'Display name', v: '@priya' },
                { l: 'Email', v: 'priya@kitchenco.in' },
                { l: 'Phone', v: '+91 98765 43210' },
              ].map((f, i) => (
                <div key={i}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-5)', marginBottom: 6 }}>{f.l}</div>
                  <div style={{ height: 42, padding: '0 14px', background: 'var(--gray-1)', border: '1px solid var(--gray-2)', borderRadius: 9, display: 'flex', alignItems: 'center', fontSize: 13 }}>{f.v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Notifications</div>
            <div style={{ fontSize: 13, color: 'var(--gray-5)', marginTop: 4, marginBottom: 16 }}>Choose what you want to be notified about.</div>
            {[
              { l: 'New orders', s: 'Get notified when a new order arrives', on: true },
              { l: 'Stock alerts', s: 'When inventory runs low', on: true },
              { l: 'Customer messages', s: 'Direct customer enquiries', on: true },
              { l: 'Marketing emails', s: 'Tips, news, and product updates', on: false },
            ].map((s, i, a) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.l}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-5)', marginTop: 2 }}>{s.s}</div>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: s.on ? 'var(--brand)' : 'var(--gray-3)', position: 'relative', transition: '0.2s' }}>
                  <div style={{ position: 'absolute', top: 2, left: s.on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: '0.2s' }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </WebShell>
  );
}

// 14 CHECKOUT
function WebCheckout() {
  return (
    <WebShell label="14 Checkout" active="orders" title="Checkout" breadcrumb={['Orders', 'New order', 'Checkout']}
      actions={<Btn kind="outline">Save as draft</Btn>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>1</span>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Customer</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: 'var(--gray-1)', borderRadius: 10 }}>
              <img src={IMG.john} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>John Smith</div>
                <div style={{ fontSize: 12, color: 'var(--gray-5)' }}>+91 98765 43210 · john@example.com</div>
              </div>
              <Btn kind="outline" size="sm">Change</Btn>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>2</span>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Delivery</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {[
                { l: 'Standard', s: 'Tomorrow, 10am-2pm', p: '₹290', a: true },
                { l: 'Express', s: 'Today, within 2 hours', p: '₹490' },
              ].map((d, i) => (
                <div key={i} style={{ padding: 14, border: d.a ? '2px solid var(--brand)' : '1px solid var(--gray-2)', borderRadius: 10, background: d.a ? 'rgba(230, 57, 70, 0.04)' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{d.l}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-5)', marginTop: 2 }}>{d.s}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>{d.p}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 14, background: 'var(--gray-1)', borderRadius: 10, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-5)', fontWeight: 700, marginBottom: 4 }}>DELIVERY ADDRESS</div>
              123 Main Street, Bandra West, Mumbai 400050
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>3</span>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Payment</div>
            </div>
            {[
              { l: 'UPI', s: 'priya@okaxis', a: true },
              { l: 'Card', s: '**** 4532' },
              { l: 'Cash on delivery', s: 'Pay when delivered' },
            ].map((p, i, a) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: i === a.length - 1 ? 'none' : '1px solid var(--gray-2)' }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, border: p.a ? 'none' : '2px solid var(--gray-3)', background: p.a ? 'var(--brand)' : 'transparent', position: 'relative' }}>
                  {p.a && <div style={{ position: 'absolute', top: 4, left: 4, width: 10, height: 10, borderRadius: 5, background: '#fff' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.l}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-5)' }}>{p.s}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Order summary */}
        <Card style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Order summary</div>
          {[
            { n: 'Organic Tomatoes', q: '2 kg', p: 706, img: IMG.tomatoes },
            { n: 'Artisan Bread', q: '1 loaf', p: 353, img: IMG.bread },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <img src={it.img} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.n}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-5)' }}>{it.q}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>₹{it.p}</div>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-2)' }}>
            {[{l:'Subtotal',v:'₹1,059'},{l:'Delivery',v:'₹290'},{l:'Tax',v:'₹0'}].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--gray-5)' }}>
                <span>{r.l}</span><span style={{ color: 'var(--ink)' }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--gray-2)' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Total</span>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, Inter, sans-serif', color: 'var(--brand)', letterSpacing: '-0.02em' }}>₹1,349</span>
            </div>
          </div>
          <button style={{ width: '100%', height: 50, marginTop: 16, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 12px -2px rgba(230, 57, 70, 0.4)' }}>Place order · ₹1,349</button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--gray-5)', marginTop: 10 }}>Secure checkout · UPI</div>
        </Card>
      </div>
    </WebShell>
  );
}

Object.assign(window, { WebProducts, WebProductDetail, WebVendors, WebReports, WebCustomer, WebSettings, WebCheckout });
