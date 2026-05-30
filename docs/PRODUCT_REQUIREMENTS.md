# FrozenNuray Platform - Product Requirements Document (PRD)

## Document Information
- **Product Name**: FrozenNuray
- **Version**: 1.0
- **Last Updated**: November 12, 2025
- **Document Owner**: Product Team
- **Status**: Draft

---

## 1. Executive Summary

### 1.1 Product Vision
FrozenNuray is Pakistan's first dedicated marketplace platform for frozen homemade food, connecting home-based food entrepreneurs with customers seeking authentic, convenient, and high-quality frozen meals.

### 1.2 Problem Statement
**Current Challenges:**
- Home cooks struggle to scale beyond local WhatsApp groups
- Customers have limited discovery options for quality frozen homemade food
- No professional platform for frozen food marketplace (Foodpanda/Cheetah focus on fresh restaurant food)
- Logistics challenges with frozen food delivery
- Trust and quality assurance issues in peer-to-peer food transactions

### 1.3 Solution Overview
A multi-platform marketplace (Web + Android + iOS) with innovative hub-based micro-fulfillment centers that enables:
- Sellers to reach thousands of customers with minimal overhead
- Customers to discover and order authentic frozen food with quality assurance
- Platform-managed logistics through hub centers in high-density areas
- Secure payment escrow and quality control systems

### 1.4 Success Metrics
**Year 1 Targets:**
- 200+ active sellers
- 10,000+ registered customers
- 5,000+ orders per month
- 3-5 hub centers operational
- 4.5+ average rating
- 80%+ customer retention rate
- PKR 10-15 million monthly GMV

---

## 2. Market Analysis

### 2.1 Target Market
**Primary Markets:**
- Karachi (Launch city)
- Lahore (Q2 2026)
- Islamabad/Rawalpindi (Q3 2026)

**Target Demographics:**
1. **Primary Customers (Buyers)**
   - Age: 25-45 years
   - Income: Middle to upper-middle class (PKR 50K-200K/month)
   - Segments:
     - Working professionals (time-poor, convenience seekers)
     - Nuclear families (meal planning focus)
     - Students/Young adults (affordable meals)
     - Expats (craving homemade food)
     - Health-conscious individuals (diet meals)

2. **Primary Sellers**
   - Age: 25-55 years
   - Primarily women (80%+)
   - Home-based entrepreneurs
   - Existing WhatsApp group sellers
   - Experienced home cooks looking to monetize skills

### 2.2 Market Size
- **Karachi**: 16M population, ~3M households
- **Target Addressable Market**: 500K households (tech-savvy, online buyers)
- **Average Order Value**: PKR 1,500-2,000
- **Order Frequency**: 2-4 times per month
- **Estimated Market Size**: PKR 1.5-3 billion annually (Karachi alone)

### 2.3 Competitive Landscape

| Competitor | Strengths | Weaknesses | Our Advantage |
|------------|-----------|------------|---------------|
| **Foodpanda** | Large user base, fast delivery, brand trust | Fresh food only, expensive, no frozen focus | Frozen niche, lower prices, homemade authentic |
| **Cheetah** | Growing presence, competitive pricing | Same as Foodpanda | Unique frozen category |
| **WhatsApp Groups** | Direct, no commission, trusted | Limited reach, no quality control, manual | Professional platform, quality assurance, discovery |
| **Local Frozen Food Shops** | Established, offline presence | Limited variety, no delivery, not homemade | Online convenience, variety, homemade authentic |

**Competitive Moat:**
1. First-mover in frozen homemade food niche
2. Hub-based micro-fulfillment (unique logistics model)
3. Quality assurance through hub inspections
4. Strong community and trust-building features
5. Lower commission than general food delivery platforms

---

## 3. User Personas

### 3.1 Persona 1: Sarah - The Working Professional
**Demographics:**
- Age: 32
- Occupation: Marketing Manager
- Income: PKR 120,000/month
- Location: DHA Phase 5, Karachi
- Family: Husband + 1 kid

**Goals:**
- Save time on daily cooking
- Ensure healthy meals for family
- Have backup meals for busy days

**Pain Points:**
- No time for daily cooking after work
- Restaurant food unhealthy/expensive
- Maid's cooking inconsistent

**How FrozenNuray Helps:**
- Stock frozen parathas, samosas for quick breakfasts
- Pre-portioned meals for dinner backup
- 2-4 hour delivery from hub (fast when needed)
- Quality homemade food (like maa ka khana)

**Usage Pattern:**
- Weekly bulk orders (PKR 3,000-5,000)
- Browses during lunch break
- Hub pickup option (on way home)

---

### 3.2 Persona 2: Fatima - The Home-Based Seller
**Demographics:**
- Age: 38
- Occupation: Homemaker + Food Business
- Income: PKR 30,000-50,000/month (from food business)
- Location: Gulshan-e-Iqbal, Karachi
- Family: Husband + 2 kids

**Goals:**
- Grow frozen food business beyond friends/family
- Earn stable income from home
- Build reputation and brand

**Pain Points:**
- Limited to 3-4 WhatsApp groups (~500 people reach)
- Manual order management exhausting
- Payment collection difficult
- No professional presence

**How FrozenNuray Helps:**
- Reach 1000s of customers across city
- Automated order/payment management
- Professional seller profile
- Hub storage option (no delivery hassle)
- Regular weekly payouts

**Usage Pattern:**
- Uploads 5-10 products
- Checks dashboard 3-4 times daily
- Delivers to hub twice a week
- Earns PKR 50,000-80,000/month

---

### 3.3 Persona 3: Ahmed - The Student
**Demographics:**
- Age: 22
- Occupation: University Student
- Income: PKR 15,000/month (allowance)
- Location: Hostel in Clifton, Karachi
- Family: Lives away from family

**Goals:**
- Affordable homemade food
- Avoid cooking in limited hostel kitchen
- Taste of home (misses mom's cooking)

**Pain Points:**
- Hostel mess food poor quality
- Restaurant food expensive
- No time/facility to cook

**How FrozenNuray Helps:**
- Affordable frozen meals (PKR 300-500)
- Homemade taste
- Microwave-ready
- Share orders with hostel friends

**Usage Pattern:**
- Orders 2-3 times per month
- Budget-conscious (sorts by price)
- Group orders with friends
- Prefers COD payment

---

## 4. Feature Requirements

### 4.1 MVP Features (Phase 1 - Month 1-3)

#### 4.1.1 Customer Features (Must-Have)
✅ **User Registration & Authentication**
- Phone number-based signup (OTP verification)
- Email optional
- Social login (Google, Facebook) - optional for Phase 2
- Profile management (name, addresses, preferences)

✅ **Product Discovery**
- Homepage with featured products & sellers
- Category browsing (8 main categories)
- Search functionality (English + Urdu support)
- Filters: Price, Rating, Delivery type (hub/direct), Dietary (halal, vegan)
- Sort: Popular, Newest, Price (low/high), Rating

✅ **Product Details**
- Multiple product images (gallery)
- Detailed description (English + Urdu)
- Price, unit, weight
- Ingredients & allergens
- Storage duration & heating instructions
- Stock availability (hub vs direct)
- Seller information & rating
- Customer reviews & ratings

✅ **Shopping Cart**
- Add to cart with quantity selection
- Stock type selection (hub/direct)
- Cart summary (subtotal, delivery, total)
- Apply promo code
- Save cart across sessions

✅ **Checkout & Orders**
- Delivery address selection/add new
- Delivery type selection (home/hub pickup/self pickup)
- Delivery time slot selection
- Payment method selection (JazzCash, EasyPaisa, COD, Card)
- Order confirmation
- Order tracking (real-time status)
- Order history
- Reorder functionality

✅ **Payments**
- JazzCash integration
- EasyPaisa integration
- Cash on Delivery (COD)
- Order escrow system (payment held until delivery)

✅ **Reviews & Ratings**
- Rate product (1-5 stars)
- Rate seller (1-5 stars)
- Written review with photos
- View all product reviews
- Verified purchase badge

✅ **Notifications**
- Push notifications (order updates, offers)
- SMS notifications (critical updates)
- In-app notification center
- Email notifications (receipts, summaries)

#### 4.1.2 Seller Features (Must-Have)
✅ **Seller Registration**
- Application form (business details)
- Kitchen video upload
- Document upload (CNIC, kitchen photos)
- Bank/JazzCash/EasyPaisa details
- Approval workflow

✅ **Seller Dashboard**
- Overview metrics (orders, revenue, rating)
- Pending orders alert
- Low stock alerts
- Quick actions (accept order, update stock)

✅ **Product Management**
- Add product (with images, details)
- Edit product (price, stock, description)
- Activate/deactivate product
- Stock management (direct/hub inventory)
- Bulk upload (CSV) - Phase 2

✅ **Order Management**
- New order notifications
- Accept/reject orders
- Update order status (preparing, ready)
- View order details
- Order history

✅ **Inventory Management**
- Update stock quantity
- Hub inventory tracking
- Low stock alerts
- Stock transfer to hub

✅ **Earnings & Payouts**
- Earnings dashboard
- Transaction history
- Payout request
- Payout history

✅ **Analytics**
- Sales trends (daily, weekly, monthly)
- Top-selling products
- Customer demographics
- Revenue breakdown

✅ **Reviews Management**
- View all reviews
- Respond to reviews
- Track rating trends

#### 4.1.3 Hub Center Features (Must-Have)
✅ **Hub Management Dashboard**
- Hub overview (capacity, utilization)
- Inventory list (all products stored)
- Temperature monitoring
- Pickup orders queue
- Delivery orders queue

✅ **Inventory Operations**
- Receive stock from sellers (barcode scan)
- Update quantities
- FIFO management
- Expiry tracking
- Stock adjustment (damaged, expired)

✅ **Order Fulfillment**
- Pickup order preparation
- Delivery order packaging
- Rider assignment
- Quality check before dispatch

#### 4.1.4 Admin Features (Must-Have)
✅ **Dashboard**
- Platform overview (GMV, orders, users)
- Real-time metrics
- Alerts (disputes, system issues)

✅ **Seller Management**
- Pending applications review
- Approve/reject sellers
- Seller list & details
- Suspend/ban sellers
- Commission rate management

✅ **Product Moderation**
- Pending products queue
- Approve/reject products
- Edit product details
- Featured product selection

✅ **Order Management**
- All orders view
- Dispute resolution
- Refund processing
- Order status override

✅ **User Management**
- User list & search
- User details & activity
- Ban/suspend users
- Customer support

✅ **Hub Management**
- Hub list & status
- Add/edit hub centers
- Hub analytics
- Staff management

✅ **Promotions**
- Create promo codes
- Set discount rules
- Usage tracking
- Deactivate promos

✅ **Reports**
- Revenue reports
- Seller payouts
- Order analytics
- User growth

---

### 4.2 Phase 2 Features (Month 4-6)

#### Nice-to-Have Features
⏳ **Customer Features**
- Wishlist/Favorites
- Subscription boxes (weekly meal plan)
- Loyalty points program
- Referral rewards
- Gift orders
- Social sharing
- Live chat with seller
- Voice search (Urdu)
- Recipe suggestions

⏳ **Seller Features**
- Advanced analytics (cohort, LTV)
- Marketing campaigns
- Featured listing purchase
- Bulk operations
- Automated repricing
- Integration with kitchen scales (IoT)

⏳ **Platform Features**
- AI-powered recommendations
- Predictive restocking
- Dynamic pricing
- Corporate bulk ordering
- WhatsApp bot integration
- Seller mobile app
- Multi-language (Sindhi, Punjabi)
- Video reviews

---

## 5. User Journeys

### 5.1 Customer Journey: First-Time Order

```
Step 1: Discovery
├─ User downloads app from Play Store
├─ Browses homepage (no login required)
└─ Views "Frozen Parathas" category

Step 2: Product Selection
├─ Clicks on "Aloo Paratha - 1 Dozen"
├─ Views product details, images, reviews
├─ Sees seller rating (4.8 stars, "Ammi's Kitchen")
├─ Notes two stock options:
│  ├─ Direct from seller: 24 hours delivery
│  └─ Hub (DHA): 2-4 hours delivery ✓ Selected
└─ Clicks "Add to Cart" (Quantity: 2)

Step 3: Continue Shopping
├─ Goes back to browse
├─ Adds "Chicken Samosas - 1 Dozen" from another seller
├─ Cart now has items from 2 sellers
└─ Clicks cart icon (shows: 2 items, PKR 1,600)

Step 4: Registration Prompt
├─ Clicks "Proceed to Checkout"
├─ App asks for phone number
├─ Enters: 03001234567
├─ Receives OTP via SMS
├─ Enters OTP
├─ Fills profile: Name, Email, City
└─ Registration complete

Step 5: Checkout
├─ Delivery address:
│  ├─ Selects "Add New Address"
│  ├─ Fills: House 123, Street 5, DHA Phase 5
│  └─ Saves as "Home"
├─ Delivery type: Home Delivery (selected)
├─ Delivery slot: Tomorrow, Evening (5-9 PM)
├─ Applies promo: "FIRST10" (10% off)
├─ Payment method: JazzCash
├─ Order summary:
│  ├─ Subtotal: PKR 1,600
│  ├─ Delivery: PKR 100
│  ├─ Discount: -PKR 160
│  └─ Total: PKR 1,540
└─ Clicks "Place Order"

Step 6: Payment
├─ Redirected to JazzCash
├─ Enters JazzCash PIN
├─ Payment successful
└─ Redirected back to app

Step 7: Order Confirmation
├─ Order placed: #FN202511120001
├─ Shows order timeline
├─ Push notification: "Order confirmed!"
└─ Can track order in "My Orders"

Step 8: Order Updates (Next Day)
├─ 10 AM: "Seller is preparing your order"
├─ 3 PM: "Order ready for pickup by rider"
├─ 5:30 PM: "Rider on the way" (live tracking)
├─ 6:45 PM: "Order delivered!"
└─ Push notification: "How was your order? Rate now"

Step 9: Review
├─ Opens app notification
├─ Rates product: 5 stars
├─ Writes: "Excellent parathas!"
├─ Uploads photo
└─ Submits review
```

---

### 5.2 Seller Journey: From Application to First Sale

```
Step 1: Discovery & Application
├─ Fatima hears about FrozenNuray from friend
├─ Visits website
├─ Clicks "Become a Seller"
├─ Fills application form:
│  ├─ Business name: "Fatima's Kitchen"
│  ├─ Description: "Authentic Sindhi cuisine..."
│  ├─ Uploads kitchen video (2 min tour)
│  ├─ Uploads CNIC photos
│  └─ Uploads 5 kitchen photos
├─ Provides bank details
└─ Submits application

Step 2: Verification (Admin Side)
├─ Admin receives notification
├─ Reviews application
├─ Watches kitchen video
├─ Checks document quality
├─ Approves seller
└─ Sends approval email/SMS to Fatima

Step 3: Seller Onboarding
├─ Fatima receives "You're approved!" message
├─ Downloads seller dashboard (web)
├─ Completes profile:
│  ├─ Adds cover photo
│  ├─ Writes detailed bio
│  └─ Sets operating hours
└─ Ready to add products

Step 4: Adding First Products
├─ Clicks "Add Product"
├─ Product 1: Sindhi Biryani
│  ├─ Name: "Sindhi Biryani (Frozen)"
│  ├─ Category: Ready Meals
│  ├─ Price: PKR 1,200 per kg
│  ├─ Stock: 20 kg
│  ├─ Stock type: Both (Hub + Direct)
│  ├─ Uploads 4 photos
│  ├─ Description: "Authentic Sindhi style..."
│  ├─ Ingredients: "Mutton, rice, spices..."
│  ├─ Heating: "Microwave 8-10 minutes..."
│  └─ Submits for approval
├─ Adds 4 more products similarly
└─ Waits for product approval

Step 5: Product Approval
├─ Admin reviews products
├─ Approves all 5 products
├─ Products go live
└─ Fatima receives notification

Step 6: Hub Stock Drop-off
├─ Fatima prepares 50 portions of various items
├─ Packs in labeled containers with batch numbers
├─ Takes to nearby DHA Hub
├─ Hub staff scans barcodes
├─ Verifies quality & quantity
├─ Updates hub inventory
└─ Fatima gets confirmation

Step 7: First Order!
├─ Customer (Sarah) discovers Sindhi Biryani
├─ Orders 2 kg from Hub stock
├─ Fatima receives notification:
│  "New order! #FN202511120045"
├─ Order auto-accepted (hub stock)
└─ Hub handles fulfillment

Step 8: Fulfillment
├─ Hub staff picks order from inventory
├─ Quality checks
├─ Packs with thermal insulation
├─ Assigns to rider
└─ Delivers to Sarah

Step 9: Payment & Payout
├─ Customer confirms delivery
├─ Payment released from escrow
├─ Fatima's earnings updated:
│  ├─ Order value: PKR 2,400
│  ├─ Commission (15%): -PKR 360
│  ├─ Net earnings: PKR 2,040
└─ Shows in dashboard

Step 10: Review & Growth
├─ Sarah rates 5 stars
├─ Fatima's rating: 5.0 (1 review)
├─ More customers discover product
├─ Fatima gets 10 more orders in week 1
├─ Requests weekly payout on Friday
└─ Receives PKR 18,500 in JazzCash
```

---

## 6. Functional Requirements

### 6.1 Performance Requirements

| Metric | Requirement | Measurement |
|--------|-------------|-------------|
| **Page Load Time** | < 2 seconds | Time to First Contentful Paint |
| **API Response Time** | < 200ms (p95) | Server response time |
| **Search Results** | < 500ms | Query to results display |
| **Image Load** | < 1 second | Full resolution image |
| **App Startup** | < 3 seconds | Cold start to interactive |
| **Real-time Updates** | < 1 second | WebSocket latency |
| **Concurrent Users** | 10,000+ | Simultaneous active users |
| **Orders per Second** | 50+ | Peak load handling |

### 6.2 Scalability Requirements

| Component | Target | Strategy |
|-----------|--------|----------|
| **Database** | 1M+ users | Horizontal sharding by city |
| **API Servers** | Auto-scale | 2-20 instances based on load |
| **File Storage** | Unlimited | CDN + Cloud storage |
| **Cache Layer** | 99% hit rate | Redis cluster |
| **Search Index** | < 100ms | Elasticsearch or PostgreSQL FTS |

### 6.3 Security Requirements

✅ **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (Customer, Seller, Admin, Hub Manager)
- Session management (multi-device support)
- OTP expiry: 5 minutes
- Password requirements: 8+ chars, 1 uppercase, 1 number

✅ **Data Security**
- HTTPS only (TLS 1.3)
- Encryption at rest (database)
- PII data masking in logs
- Payment data: PCI DSS compliant (via gateways)
- API rate limiting: 100 req/min per IP

✅ **Payment Security**
- Escrow system (hold until delivery)
- Secure webhook verification
- Transaction monitoring
- Fraud detection (basic rules)

✅ **Privacy Compliance**
- User data export option
- Account deletion option
- Cookie consent
- Privacy policy & Terms of Service

### 6.4 Reliability Requirements

| Metric | Target | Strategy |
|--------|--------|----------|
| **Uptime** | 99.9% | Load balancer, health checks |
| **Data Backup** | Daily | Automated PostgreSQL backups |
| **Backup Retention** | 30 days | Rolling backups |
| **Disaster Recovery** | < 1 hour RTO | Multi-region setup (Phase 2) |
| **Error Rate** | < 0.1% | Monitoring + alerts |

---

## 7. Non-Functional Requirements

### 7.1 Usability
- **Simple Navigation**: Max 3 taps to any feature
- **Clear CTAs**: Prominent buttons, high contrast
- **Urdu Support**: Full UI translation
- **Accessibility**: WCAG 2.1 Level AA compliance (Phase 2)
- **Onboarding**: First-time user tutorial (optional skip)
- **Error Messages**: Clear, actionable, in user's language

### 7.2 Maintainability
- **Code Documentation**: All functions documented
- **API Documentation**: OpenAPI/Swagger spec
- **Version Control**: Git with feature branches
- **CI/CD**: Automated testing + deployment
- **Monitoring**: Sentry (errors), LogRocket (sessions)
- **Logging**: Structured logs, 30-day retention

### 7.3 Compatibility
**Web App:**
- Browsers: Chrome 90+, Safari 14+, Firefox 88+, Edge 90+
- Responsive: Mobile (360px+), Tablet (768px+), Desktop (1024px+)

**Android App:**
- Minimum: Android 7.0 (API 24)
- Target: Android 14 (API 34)
- Devices: 4" to 7" screens

**iOS App:**
- Minimum: iOS 13.0
- Target: iOS 17
- Devices: iPhone 8 and newer

### 7.4 Localization
**Languages:**
- Phase 1: English, Urdu
- Phase 2: Roman Urdu

**Currency:**
- PKR only (Phase 1)
- Display: ₨ 1,500 or Rs. 1,500

**Date/Time:**
- Format: DD/MM/YYYY
- Time: 12-hour (AM/PM)
- Timezone: PKT (UTC+5)

---

## 8. Technical Constraints

### 8.1 Platform Constraints
- **Backend**: Node.js 20.x LTS (stability)
- **Database**: PostgreSQL 15.x (mature, reliable)
- **Mobile**: Flutter 3.x (code reuse)
- **Cloud**: AWS Bahrain region (lowest latency for Pakistan)

### 8.2 Third-Party Dependencies
- **Payment Gateways**: JazzCash, EasyPaisa, Stripe
- **SMS**: Twilio or local gateway
- **Email**: SendGrid
- **Maps**: Google Maps API
- **Storage**: Cloudinary
- **Push**: Firebase Cloud Messaging

### 8.3 Compliance
- **Payment**: PCI DSS (via gateways)
- **Data**: GDPR-ready (for future expansion)
- **Food**: No legal requirements in Pakistan (current)

---

## 9. Assumptions & Dependencies

### 9.1 Assumptions
1. Sellers have smartphones with internet access
2. Customers have smartphones capable of running Flutter apps
3. Sellers can deliver to hub centers (or arrange pickup)
4. Payment gateways will provide APIs (confirmed)
5. Average order value: PKR 1,500-2,000
6. Customer acquisition cost: PKR 200-300
7. Seller commission: 15% sustainable

### 9.2 Dependencies
**Critical:**
- Payment gateway API availability (JazzCash, EasyPaisa)
- Google Maps API (for location services)
- SMS gateway (for OTP delivery)
- Cloud infrastructure (AWS/DigitalOcean)

**Important:**
- Hub center lease agreements (3+ locations)
- Seller onboarding rate (20+ per month)
- Rider availability (5-10 per hub)

**Nice-to-Have:**
- WhatsApp Business API (for notifications)
- Social media APIs (for sharing)

---

## 10. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Low seller adoption** | High | Medium | Aggressive seller outreach, zero commission first month, WhatsApp group partnerships |
| **Payment gateway issues** | High | Low | Multiple gateway options, COD as fallback |
| **Quality complaints** | High | Medium | Hub quality checks, money-back guarantee, strict seller guidelines |
| **Delivery delays** | Medium | Medium | Hub-based fulfillment (2-4 hrs), clear ETAs, compensation policy |
| **Competition from Foodpanda** | High | Medium | Focus on niche, build seller loyalty, community features |
| **Hub center costs** | Medium | Low | Start with 1-2 hubs, partner with existing cold storage |
| **Regulatory changes** | Medium | Low | Legal compliance buffer, adaptable policies |
| **Tech scalability** | Medium | Low | Cloud auto-scaling, performance monitoring |

---

## 11. Success Criteria

### 11.1 Launch Criteria (Go-Live)
✅ **Minimum Requirements:**
- 20+ verified sellers
- 50+ products approved
- 1 hub center operational
- Payment gateway integrated
- Android app published
- Web app deployed
- Admin panel functional
- Support system ready

### 11.2 Month 1 Success Metrics
- 50+ sellers registered
- 500+ customers registered
- 200+ orders completed
- 4.0+ average rating
- < 5% order cancellation rate
- 1 hub operational

### 11.3 Month 3 Success Metrics
- 100+ active sellers
- 2,000+ registered customers
- 1,000+ orders/month
- 4.2+ average rating
- 2-3 hubs operational
- 50%+ orders via hubs
- PKR 1.5M+ monthly GMV

### 11.4 Month 6 Success Metrics
- 200+ active sellers
- 5,000+ registered customers
- 2,500+ orders/month
- 4.5+ average rating
- 3-5 hubs operational
- iOS app launched
- PKR 3.5M+ monthly GMV
- 70%+ customer retention

---

## 12. Roadmap

### Phase 1: MVP (Month 1-3) ✅ Current Focus
**Goal**: Launch in Karachi with core features
- Backend API development
- Database setup
- Admin panel (web)
- Seller dashboard (web)
- Customer web app (responsive)
- Android app (Flutter)
- Payment integration
- 1 hub center setup
- Seller onboarding (20+ sellers)
- Soft launch (friends & family)
- Public launch (Karachi)

### Phase 2: Growth (Month 4-6)
**Goal**: Expand features and optimize
- iOS app launch
- Advanced analytics
- Wishlist/favorites
- Loyalty program
- Referral system
- Marketing campaigns
- 2 additional hubs
- Seller growth (100+ sellers)
- Second city prep (Lahore)

### Phase 3: Scale (Month 7-12)
**Goal**: Multi-city expansion
- Lahore launch
- Islamabad launch
- Subscription boxes
- Corporate bulk ordering
- WhatsApp bot
- Advanced AI recommendations
- 5+ hubs across cities
- 200+ sellers
- 10,000+ customers

### Phase 4: Maturity (Year 2)
**Goal**: Market leader position
- 10+ cities
- 500+ sellers
- 50,000+ customers
- Private label products
- International expansion (UAE?)
- Franchise model
- B2B partnerships

---

## 13. Open Questions

1. **Hub Economics**: What's the break-even point for hub operations?
2. **Seller Commission**: Is 15% sustainable long-term? Should we have tiered pricing?
3. **Delivery Partnerships**: Build own fleet or partner with existing services?
4. **Quality Standards**: How strict should our quality checks be?
5. **Packaging**: Should platform provide standardized packaging?
6. **Insurance**: Do we need product liability insurance for sellers?
7. **Ratings Threshold**: Minimum rating before seller suspension?
8. **Refund Policy**: Full refund or partial? Time limits?
9. **Hub Locations**: Should hubs be owned or leased?
10. **Seller Training**: Do we need formal training program?

---

## 14. Appendices

### Appendix A: User Stories (Top 20)

**Customer Stories:**
1. As a customer, I want to search for frozen parathas so that I can find breakfast options
2. As a customer, I want to filter by hub delivery so that I get faster delivery
3. As a customer, I want to read reviews before buying so that I know quality
4. As a customer, I want to track my order in real-time so that I know when it arrives
5. As a customer, I want to save multiple addresses so that I can deliver to different locations
6. As a customer, I want to reorder previous orders quickly so that I save time
7. As a customer, I want to apply promo codes so that I get discounts
8. As a customer, I want to pay with JazzCash so that I don't need a card
9. As a customer, I want to see heating instructions so that I prepare food correctly
10. As a customer, I want to cancel order within 30 mins so that I can change my mind

**Seller Stories:**
11. As a seller, I want to upload product photos so that customers see my items
12. As a seller, I want to receive instant order notifications so that I don't miss orders
13. As a seller, I want to update stock quickly so that I avoid overselling
14. As a seller, I want to see my earnings dashboard so that I track revenue
15. As a seller, I want to respond to reviews so that I address concerns
16. As a seller, I want to request weekly payout so that I get regular income
17. As a seller, I want to drop stock at hub so that I don't handle delivery
18. As a seller, I want to see which products sell best so that I optimize inventory
19. As a seller, I want to set products inactive temporarily so that I can take breaks
20. As a seller, I want to message customers so that I clarify orders

### Appendix B: Wireframe References
(To be added with design files)

### Appendix C: API Endpoints Summary
(See API_DOCUMENTATION.md for full details)

### Appendix D: Database Schema Overview
(See DATABASE_SCHEMA.sql for full schema)

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | [Name] | _________ | _____ |
| Tech Lead | [Name] | _________ | _____ |
| Business Lead | [Name] | _________ | _____ |
| Stakeholder | [Name] | _________ | _____ |

---

**End of Document**
