# FrozenNuray Platform - Complete System Architecture

## 🏗️ System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web App    │  │ Android App  │  │   iOS App    │          │
│  │  (Next.js)   │  │  (Flutter)   │  │  (Flutter)   │          │
│  │              │  │              │  │              │          │
│  │ - Customer   │  │ - Customer   │  │ - Customer   │          │
│  │ - Seller     │  │   Primary    │  │   Premium    │          │
│  │ - Admin      │  │              │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              RESTful API (Node.js + Express)            │    │
│  │                                                          │    │
│  │  Authentication │ Rate Limiting │ Request Validation    │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Auth Service   │ │ Business Logic  │ │ Integration     │
│                 │ │                 │ │ Services        │
│ - JWT Tokens    │ │ - Order Mgmt    │ │ - Payments      │
│ - OTP System    │ │ - Inventory     │ │ - SMS/Email     │
│ - Permissions   │ │ - Matching      │ │ - Push Notif    │
│ - Sessions      │ │ - Analytics     │ │ - Maps/Location │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Redis     │  │  File Storage│          │
│  │   Database   │  │    Cache     │  │ (Cloudinary) │          │
│  │              │  │              │  │              │          │
│  │ - Users      │  │ - Sessions   │  │ - Product    │          │
│  │ - Products   │  │ - Cart Data  │  │   Images     │          │
│  │ - Orders     │  │ - Real-time  │  │ - Seller     │          │
│  │ - Payments   │  │   Inventory  │  │   Photos     │          │
│  │ - Reviews    │  │ - API Cache  │  │ - Documents  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Architecture Principles

### 1. **Microservices-Ready Monolith**
- Start with monolithic architecture for speed
- Modular design allows future microservices extraction
- Clear service boundaries from day one

### 2. **Scalability First**
- Horizontal scaling capability
- Database read replicas for high traffic
- CDN for static assets
- Caching layer for performance

### 3. **Multi-Tenant Architecture**
- City-based data partitioning
- Shared infrastructure, isolated data
- Easy to add new cities without code changes

### 4. **Real-Time Capabilities**
- WebSocket for live order tracking
- Push notifications for status updates
- Real-time inventory synchronization

### 5. **Message Queue Architecture**
- Async job processing with Bull (Redis-based)
- Retry logic with exponential backoff
- Dead letter queues for failed jobs
- Horizontal scaling of workers

### 6. **Caching Strategy**
- Multi-layer caching (Redis + CDN)
- Smart cache invalidation
- Cache warming for hot data
- Performance optimization

---

## 📦 Database Architecture

### Entity Relationship Diagram (ERD)

```
┌─────────────────┐
│     USERS       │
├─────────────────┤
│ id (PK)         │
│ phone           │◄───────────┐
│ email           │            │
│ password_hash   │            │
│ user_type       │            │
│ status          │            │
│ created_at      │            │
└────────┬────────┘            │
         │                     │
         │ 1:1                 │
         ▼                     │
┌─────────────────┐            │
│  USER_PROFILES  │            │
├─────────────────┤            │
│ id (PK)         │            │
│ user_id (FK)    │            │
│ full_name       │            │
│ avatar_url      │            │
│ city            │            │
│ area            │            │
│ addresses       │            │
└─────────────────┘            │
                               │
┌─────────────────┐            │
│    SELLERS      │            │
├─────────────────┤            │
│ id (PK)         │            │
│ user_id (FK)    │────────────┘
│ business_name   │
│ description     │
│ kitchen_video   │
│ rating_avg      │
│ total_orders    │
│ commission_rate │
│ is_verified     │
│ is_featured     │
│ hub_id (FK)     │◄──────┐
└────────┬────────┘        │
         │                 │
         │ 1:N             │
         ▼                 │
┌─────────────────┐        │
│    PRODUCTS     │        │
├─────────────────┤        │
│ id (PK)         │        │
│ seller_id (FK)  │        │
│ name            │        │
│ description     │        │
│ category_id(FK) │        │
│ price           │        │
│ unit            │        │
│ images          │        │
│ ingredients     │        │
│ storage_days    │        │
│ heating_inst    │        │
│ stock_quantity  │        │
│ min_order       │        │
│ max_order       │        │
│ is_active       │        │
│ hub_inventory   │        │
└────────┬────────┘        │
         │                 │
         │                 │
         │ N:M             │
         ▼                 │
┌─────────────────┐        │
│  ORDER_ITEMS    │        │
├─────────────────┤        │
│ id (PK)         │        │
│ order_id (FK)   │◄───┐   │
│ product_id (FK) │    │   │
│ seller_id (FK)  │    │   │
│ quantity        │    │   │
│ price_snapshot  │    │   │
│ hub_pickup      │    │   │
└─────────────────┘    │   │
                       │   │
┌─────────────────┐    │   │
│     ORDERS      │    │   │
├─────────────────┤    │   │
│ id (PK)         │────┘   │
│ customer_id(FK) │        │
│ order_number    │        │
│ total_amount    │        │
│ delivery_fee    │        │
│ discount_amount │        │
│ payment_method  │        │
│ payment_status  │        │
│ delivery_type   │        │
│ delivery_addr   │        │
│ hub_id (FK)     │────────┤
│ delivery_slot   │        │
│ order_status    │        │
│ created_at      │        │
└────────┬────────┘        │
         │                 │
         │ 1:1             │
         ▼                 │
┌─────────────────┐        │
│   DELIVERIES    │        │
├─────────────────┤        │
│ id (PK)         │        │
│ order_id (FK)   │        │
│ rider_id (FK)   │        │
│ pickup_time     │        │
│ delivery_time   │        │
│ tracking_url    │        │
│ status          │        │
└─────────────────┘        │
                           │
┌─────────────────┐        │
│   HUB_CENTERS   │        │
├─────────────────┤        │
│ id (PK)         │◄───────┘
│ city            │
│ area            │
│ address         │
│ coordinates     │
│ capacity        │
│ operating_hours │
│ manager_id (FK) │
│ freezer_units   │
│ is_active       │
│ created_at      │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│ HUB_INVENTORY   │
├─────────────────┤
│ id (PK)         │
│ hub_id (FK)     │
│ product_id (FK) │
│ seller_id (FK)  │
│ quantity        │
│ batch_number    │
│ manufactured_dt │
│ expiry_date     │
│ storage_unit    │
│ updated_at      │
└─────────────────┘

┌─────────────────┐
│   CATEGORIES    │
├─────────────────┤
│ id (PK)         │
│ name            │
│ name_urdu       │
│ icon            │
│ parent_id (FK)  │
│ sort_order      │
└─────────────────┘

┌─────────────────┐
│    REVIEWS      │
├─────────────────┤
│ id (PK)         │
│ order_id (FK)   │
│ seller_id (FK)  │
│ customer_id(FK) │
│ rating          │
│ comment         │
│ photos          │
│ response        │
│ created_at      │
└─────────────────┘

┌─────────────────┐
│   PROMOTIONS    │
├─────────────────┤
│ id (PK)         │
│ code            │
│ type            │
│ discount_value  │
│ min_order       │
│ max_discount    │
│ valid_from      │
│ valid_until     │
│ usage_limit     │
│ used_count      │
└─────────────────┘

┌─────────────────┐
│   WALLETS       │
├─────────────────┤
│ id (PK)         │
│ user_id (FK)    │
│ balance         │
│ currency        │
│ updated_at      │
└─────────────────┘

┌─────────────────┐
│  TRANSACTIONS   │
├─────────────────┤
│ id (PK)         │
│ wallet_id (FK)  │
│ order_id (FK)   │
│ type            │
│ amount          │
│ status          │
│ gateway         │
│ reference_id    │
│ created_at      │
└─────────────────┘
```

---

## 🔧 Technology Stack

### **Backend**
```yaml
Runtime: Node.js 20.x LTS
Framework: Express.js 4.x
Language: TypeScript (for type safety)
ORM: Prisma (database toolkit)
Validation: Zod (schema validation)
Authentication: JWT + Passport.js
Real-time: Socket.io (WebSocket)
Task Queue: Bull (Redis-based queue)
Cron Jobs: node-cron (scheduled tasks)
```

### **Database**
```yaml
Primary Database: PostgreSQL 15.x
  - ACID compliance
  - Complex queries support
  - JSON field support
  - Full-text search

Cache Layer: Redis 7.x
  - Session storage
  - API response caching
  - Real-time inventory
  - Rate limiting
  - Queue management

File Storage: Cloudinary
  - Image optimization
  - CDN delivery
  - Transformation API
  - Video storage (kitchen tours)
```

### **Frontend - Web App**
```yaml
Framework: Next.js 14.x (App Router)
Language: TypeScript
UI Library: React 18.x
Styling: Tailwind CSS 3.x
Components: Shadcn/ui
State Management: Zustand (lightweight)
Forms: React Hook Form + Zod
API Calls: Axios with interceptors
Maps: Google Maps API
Charts: Recharts
Deployment: Vercel
```

### **Frontend - Mobile Apps**
```yaml
Framework: Flutter 3.x
Language: Dart
State Management: Riverpod
HTTP Client: Dio
Local Storage: Hive (offline support)
Maps: Google Maps Flutter
Push Notifications: Firebase Cloud Messaging
Payments: 
  - JazzCash SDK
  - EasyPaisa SDK
  - Stripe Flutter SDK
Analytics: Firebase Analytics
Crash Reporting: Firebase Crashlytics
```

### **DevOps & Infrastructure**
```yaml
Hosting: AWS (Bahrain Region) or DigitalOcean
  - EC2/Droplets for API servers
  - RDS for PostgreSQL
  - ElastiCache for Redis
  - S3 for backups

CI/CD: GitHub Actions
  - Automated testing
  - Deployment pipelines
  - Code quality checks

Monitoring:
  - Sentry (error tracking)
  - LogRocket (session replay)
  - AWS CloudWatch (infrastructure)
  
Load Balancer: Nginx or AWS ALB
SSL: Let's Encrypt (free) or AWS ACM
Domain: Cloudflare (DNS + DDoS protection)
```

### **Third-Party Integrations**
```yaml
Payments:
  - JazzCash Business API
  - EasyPaisa Merchant API
  - Stripe (for cards)
  - COD (Cash on Delivery)

SMS/OTP:
  - Twilio (international)
  - Local SMS gateway (Pakistan)

Email:
  - SendGrid or AWS SES
  - Transactional emails
  - Marketing campaigns

Maps & Geolocation:
  - Google Maps API
  - Distance Matrix API
  - Geocoding API

Push Notifications:
  - Firebase Cloud Messaging (FCM)
  - APNs for iOS

Analytics:
  - Google Analytics 4
  - Mixpanel (user behavior)
  - Custom dashboard
```

---

## 🏛️ Detailed Component Architecture

### **1. Authentication Service**

```typescript
// Architecture Flow
User Input → API Gateway → Auth Service → Database

Components:
├─ Registration
│  ├─ Phone number validation
│  ├─ OTP generation & sending
│  ├─ OTP verification
│  └─ User creation
│
├─ Login
│  ├─ Credentials validation
│  ├─ OTP-based login
│  ├─ JWT token generation
│  └─ Refresh token mechanism
│
├─ Authorization
│  ├─ Role-based access control (RBAC)
│  ├─ Permission checking middleware
│  └─ Token refresh handling
│
└─ Session Management
   ├─ Redis session storage
   ├─ Multiple device support
   └─ Logout/invalidation
```

**Security Features:**
- Password hashing: bcrypt (10 rounds)
- JWT tokens: RS256 algorithm
- Token expiry: 24 hours (access), 30 days (refresh)
- Rate limiting: 5 attempts per 15 minutes
- OTP expiry: 5 minutes
- OTP attempts: Max 3 tries

---

### **2. Order Management System**

```typescript
// Order Lifecycle Architecture

Customer Places Order
        ↓
┌───────────────────┐
│ Order Validation  │
├───────────────────┤
│ - Stock check     │
│ - Price verify    │
│ - Address valid   │
│ - Payment method  │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Payment Process   │
├───────────────────┤
│ - Hold payment    │
│ - Escrow system   │
│ - Generate order  │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Order Splitting   │ (Multi-seller orders)
├───────────────────┤
│ - Group by seller │
│ - Group by hub    │
│ - Calculate fees  │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Seller Notif      │
├───────────────────┤
│ - Push notif      │
│ - SMS alert       │
│ - Auto-accept(opt)│
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Fulfillment       │
├───────────────────┤
│ Direct: Seller→   │
│         Customer  │
│                   │
│ Hub: Seller→Hub→  │
│      Customer     │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Delivery Dispatch │
├───────────────────┤
│ - Assign rider    │
│ - Generate route  │
│ - Track real-time │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Delivery Complete │
├───────────────────┤
│ - Customer confirm│
│ - Release payment │
│ - Request review  │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Settlement        │
├───────────────────┤
│ - Seller payout   │
│ - Commission      │
│ - Weekly batch    │
└───────────────────┘
```

**Order States:**
```
PENDING → ACCEPTED → PREPARING → READY → 
DISPATCHED → IN_TRANSIT → DELIVERED → COMPLETED

Failure States:
CANCELLED (by customer)
REJECTED (by seller)
REFUNDED (payment issue)
FAILED_DELIVERY (delivery issue)
```

---

### **3. Hub Center System (NEW INNOVATION)**

```typescript
// Hub Architecture for High-Density Areas

┌─────────────────────────────────────────┐
│          HUB CENTER CONCEPT             │
├─────────────────────────────────────────┤
│                                         │
│  Problem: In dense areas (DHA, Gulberg) │
│  - Multiple sellers same neighborhood   │
│  - Delivery costs high per order        │
│  - Quality control difficult            │
│                                         │
│  Solution: Micro-Fulfillment Hubs       │
│  - Centralized freezer storage          │
│  - Sellers drop off bulk inventory      │
│  - Platform handles customer delivery   │
│  - Quality assurance at hub             │
│  - Batch deliveries (cost effective)    │
│                                         │
└─────────────────────────────────────────┘

Hub Operations Flow:
─────────────────────

1. Seller Perspective:
   ├─ Prepare products at home
   ├─ Drop off to nearby hub (daily/weekly)
   ├─ Hub staff verifies quality & quantity
   ├─ Products stored in dedicated freezer section
   └─ Seller notified when products sold

2. Customer Perspective:
   ├─ Browse products (hub + direct sellers)
   ├─ Hub items have "Fast Delivery" badge
   ├─ Order multiple sellers from same hub
   ├─ Delivery within 2-4 hours (vs 24 hours direct)
   └─ Self-pickup option available (discount)

3. Platform Benefits:
   ├─ Economies of scale (bulk delivery)
   ├─ Quality control checkpoint
   ├─ Faster delivery promise
   ├─ Lower delivery costs
   ├─ Better inventory visibility
   └─ Emergency stock availability
```

**Hub Center Features:**

```yaml
Infrastructure:
  - Commercial freezers (temperature monitored)
  - Barcode scanning system
  - Quality check area
  - Packaging station
  - Customer pickup counter
  - Rider dispatch zone

Inventory Management:
  - Real-time stock tracking
  - FIFO (First In First Out) system
  - Expiry date monitoring
  - Batch number tracking
  - Seller-wise segregation

Staff Requirements:
  - Hub Manager (1)
  - Quality Checker (1-2)
  - Inventory Staff (2-3)
  - Packaging Team (2-3)
  - Riders (5-10 per hub)

Technology:
  - Tablet-based inventory app
  - Barcode scanner integration
  - Temperature monitoring IoT
  - CCTV surveillance
  - Automated alerts system
```

**Hub Pricing Model:**

```yaml
Seller Costs:
  - Hub storage fee: PKR 500/month per SKU
  - Or: 5% additional commission (vs 15% direct)
  - Drop-off: Free (seller brings to hub)
  - Packaging materials: Provided by platform

Customer Benefits:
  - Faster delivery: 2-4 hours
  - Free delivery: Above PKR 1,000
  - Self-pickup: 10% discount
  - Assured quality: Hub checked

Platform Benefits:
  - Delivery optimization: 70% cost reduction
  - Quality control: Pre-delivery inspection
  - Inventory pooling: Better stock management
  - Customer satisfaction: Faster, reliable
```

**Hub Locations Strategy:**

```
Phase 1 (Launch):
├─ Karachi
│  ├─ DHA Phase 5 Hub
│  ├─ Gulshan-e-Iqbal Hub
│  └─ Bahria Town Hub
│
├─ Lahore  
│  ├─ DHA Hub
│  ├─ Johar Town Hub
│  └─ Bahria Town Hub
│
└─ Islamabad
   ├─ F-7 Hub
   └─ Bahria Town Hub

Phase 2 (Expansion):
- 2-3 hubs per major city
- Coverage: 70% of order volume
```

---

### **4. Inventory Management System**

```typescript
// Dual Inventory Architecture

┌─────────────────────────────────────┐
│       INVENTORY TYPES               │
├─────────────────────────────────────┤
│                                     │
│  1. DIRECT SELLER INVENTORY         │
│     ├─ Seller manages at home       │
│     ├─ Self-reported stock          │
│     ├─ Updated via seller dashboard │
│     └─ Delivery: Seller→Customer    │
│                                     │
│  2. HUB INVENTORY                   │
│     ├─ Stored at hub center         │
│     ├─ Platform-managed             │
│     ├─ Real-time tracking           │
│     └─ Delivery: Hub→Customer       │
│                                     │
└─────────────────────────────────────┘

Real-Time Stock Management:
──────────────────────────

┌─────────────────┐
│  Product Page   │
│                 │
│ Available:      │
│ • Home: 10 pcs  │ ← Direct seller
│ • Hub: 25 pcs   │ ← Hub inventory
│                 │
│ Delivery:       │
│ • Home: 24hrs   │
│ • Hub: 2-4hrs ✓ │
└─────────────────┘

Stock Synchronization:
├─ Redis cache for instant updates
├─ PostgreSQL for persistent storage
├─ WebSocket for real-time UI updates
└─ Batch sync every 5 minutes (backup)

Low Stock Alerts:
├─ Seller: Alert when < 5 units
├─ Hub: Alert when < 20 units
├─ Automated restock reminders
└─ Predictive restocking (ML future)
```

---

### **5. Payment Processing Architecture**

```typescript
// Multi-Gateway Payment System

Payment Flow:
────────────

Customer Checkout
       ↓
┌──────────────────┐
│ Select Payment   │
│                  │
│ □ JazzCash       │
│ □ EasyPaisa      │
│ □ Card (Stripe)  │
│ ☑ Cash on Del    │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Escrow System    │
├──────────────────┤
│ Payment held by  │
│ platform until   │
│ delivery confirm │
└────────┬─────────┘
         ↓
    Order Delivered
         ↓
┌──────────────────┐
│ Payment Split    │
├──────────────────┤
│ Seller: 85%      │
│ Platform: 15%    │
│ Delivery: PKR X  │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Settlement       │
├──────────────────┤
│ Weekly payout to │
│ seller bank/JC   │
└──────────────────┘

Payment Gateway Integration:
───────────────────────────

JazzCash:
  - Merchant API integration
  - Wallet deduction
  - OTC (Over-the-Counter) payment
  - Refund support

EasyPaisa:
  - MA (Mobile Account) integration
  - QR code payment
  - IBFT support
  - Auto-settlement

Stripe:
  - Cards (Visa, Mastercard)
  - International customers
  - 3D Secure authentication
  - Instant refunds

Cash on Delivery:
  - Rider collects cash
  - Rider deposits to hub/bank
  - Platform releases to seller
  - Higher commission (18% vs 15%)
```

---

### **6. Message Queue System (Bull)**

```typescript
// Async Job Processing Architecture

Queue Configuration:
────────────────────

Queues:
├─ email-queue
│  ├─ Purpose: Send transactional emails
│  ├─ Concurrency: 5 workers
│  ├─ Retry: 3 attempts, exponential backoff
│  └─ Jobs: Order confirmations, receipts, notifications
│
├─ sms-queue
│  ├─ Purpose: Send SMS/OTP
│  ├─ Concurrency: 10 workers
│  ├─ Retry: 3 attempts, exponential backoff
│  └─ Jobs: OTP delivery, order updates
│
├─ image-processing-queue
│  ├─ Purpose: Process and optimize images
│  ├─ Concurrency: 3 workers
│  ├─ Retry: 2 attempts
│  └─ Jobs: Product images, seller photos, kitchen videos
│
├─ notification-queue
│  ├─ Purpose: Send push notifications
│  ├─ Concurrency: 10 workers
│  ├─ Retry: 3 attempts
│  └─ Jobs: Order updates, promotions, alerts
│
├─ report-generation-queue
│  ├─ Purpose: Generate analytics reports
│  ├─ Concurrency: 2 workers
│  ├─ Retry: 1 attempt
│  └─ Jobs: Daily/weekly/monthly reports
│
└─ payout-queue
   ├─ Purpose: Process seller payouts
   ├─ Concurrency: 1 worker (sequential)
   ├─ Retry: 5 attempts (financial)
   └─ Jobs: Weekly payout processing

Job Lifecycle:
──────────────

1. Job Created
   ↓
2. Added to Queue
   ↓
3. Worker Picks Up
   ↓
4. Processing
   ├─ Success → Completed
   └─ Failure → Retry (if attempts < max)
       ↓
5. Retry with Backoff
   ├─ Success → Completed
   └─ Failure → Dead Letter Queue

Retry Strategy:
───────────────
- Attempt 1: Immediate
- Attempt 2: 5 seconds delay
- Attempt 3: 30 seconds delay
- Attempt 4: 5 minutes delay
- Attempt 5: 30 minutes delay

Dead Letter Queue:
──────────────────
- Failed jobs after max retries
- Manual review and reprocessing
- Alert on dead letter queue
- Retention: 30 days
```

---

### **7. Caching Strategy**

```typescript
// Multi-Layer Caching Architecture

Cache Layers:
─────────────

1. CDN Cache (Cloudflare)
   ├─ Static assets: 1 year
   ├─ Images: 30 days
   └─ HTML pages: 1 hour

2. Application Cache (Redis)
   ├─ Product listings: 5 minutes
   ├─ Product details: 10 minutes
   ├─ Categories: 1 hour
   ├─ Search results: 2 minutes
   ├─ User sessions: 24 hours
   └─ API responses: Varies by endpoint

3. Database Query Cache
   ├─ Frequently accessed queries
   ├─ Materialized views
   └─ Query result caching

Cache TTL Strategy:
──────────────────

High Frequency (Short TTL):
├─ Product listings: 5 minutes
├─ Search results: 2 minutes
├─ Real-time inventory: No cache (WebSocket)
└─ Cart data: No cache (in database)

Medium Frequency:
├─ Product details: 10 minutes
├─ Seller profiles: 15 minutes
├─ Category data: 1 hour
└─ Hub information: 30 minutes

Low Frequency (Long TTL):
├─ Categories: 1 hour
├─ Static content: 24 hours
└─ Configuration: 1 day

Cache Invalidation:
───────────────────

Automatic Invalidation:
├─ Product updated → Invalidate product cache
├─ Order created → Invalidate inventory cache
├─ Seller updated → Invalidate seller cache
└─ Category updated → Invalidate category cache

Manual Invalidation:
├─ Admin panel: Clear cache button
├─ API endpoint: POST /admin/cache/clear
└─ Emergency: Redis FLUSHDB (staging only)

Cache Keys:
───────────

Format: {entity}:{id}:{version}
Examples:
├─ product:uuid-123:v1
├─ category:uuid-456:v1
├─ seller:uuid-789:v1
└─ search:samosa:karachi:v1

Cache Warming:
──────────────
- Pre-cache popular products on startup
- Pre-cache categories on startup
- Pre-cache featured sellers
- Scheduled cache warming (hourly)
```

---

### **8. Monitoring & Observability**

```typescript
// Comprehensive Monitoring Architecture

Monitoring Layers:
──────────────────

1. Application Monitoring
   ├─ Sentry: Error tracking
   │  ├─ Error alerts
   │  ├─ Performance monitoring
   │  └─ Release tracking
   │
   ├─ LogRocket: Session replay
   │  ├─ User session recordings
   │  ├─ Console logs
   │  └─ Network requests
   │
   └─ Custom Metrics
      ├─ API response times
      ├─ Error rates
      └─ Business metrics

2. Infrastructure Monitoring
   ├─ AWS CloudWatch / DigitalOcean Monitoring
   │  ├─ CPU utilization
   │  ├─ Memory usage
   │  ├─ Disk I/O
   │  ├─ Network traffic
   │  └─ Database performance
   │
   └─ Uptime Monitoring
      ├─ Pingdom / UptimeRobot
      ├─ Health check endpoints
      └─ Alert on downtime

3. Database Monitoring
   ├─ Query performance
   ├─ Slow query logging
   ├─ Connection pool status
   └─ Replication lag

4. Business Metrics
   ├─ Orders per hour/day
   ├─ Revenue metrics
   ├─ User growth
   ├─ Conversion rates
   └─ Seller performance

Alert Thresholds:
─────────────────

Critical Alerts:
├─ API error rate > 5% (5 minutes)
├─ Database connection failures
├─ Payment gateway failures
├─ Redis unavailable
└─ Disk usage > 90%

Warning Alerts:
├─ API response time > 500ms (p95)
├─ CPU usage > 80%
├─ Memory usage > 85%
├─ Database slow queries > 1 second
└─ Queue backlog > 1000 jobs

Info Alerts:
├─ High order volume (surge detection)
├─ Low inventory alerts
└─ New seller registrations

Dashboard:
──────────
- Real-time metrics dashboard
- Historical trends
- Custom reports
- Export capabilities
```

---

### **9. Notification System**

```typescript
// Multi-Channel Notification Architecture

Notification Channels:
─────────────────────

1. Push Notifications (Primary)
   ├─ Firebase Cloud Messaging
   ├─ Real-time delivery
   ├─ Rich media support
   └─ Action buttons

2. SMS (Critical)
   ├─ OTP verification
   ├─ Order confirmations
   ├─ Delivery updates
   └─ Payment confirmations

3. Email (Secondary)
   ├─ Order receipts
   ├─ Weekly summaries
   ├─ Marketing campaigns
   └─ Seller payouts

4. In-App (Real-time)
   ├─ WebSocket connection
   ├─ Notification bell
   ├─ Order status updates
   └─ Chat messages

Notification Types by User:
──────────────────────────

Customer Notifications:
├─ Order placed ✓
├─ Order accepted by seller
├─ Order preparing
├─ Order ready for pickup (hub)
├─ Rider assigned
├─ Out for delivery
├─ Delivered (request review)
├─ Payment successful
├─ Refund processed
└─ New offers/promotions

Seller Notifications:
├─ New order received ⚠
├─ Payment received
├─ Low stock alert
├─ Hub inventory update
├─ Customer review
├─ Weekly payout
├─ Featured listing expiring
└─ Platform announcements

Admin Notifications:
├─ New seller application
├─ Dispute raised
├─ Low hub inventory
├─ High order volume (surge)
├─ System errors
└─ Daily reports

Hub Manager Notifications:
├─ New inventory drop-off
├─ Pickup order ready
├─ Low freezer capacity
├─ Temperature alert
└─ Delivery rider assignment
```

---

### **7. Search & Discovery Engine**

```typescript
// Smart Search Architecture

Search Layers:
─────────────

1. Full-Text Search (PostgreSQL)
   ├─ Product names
   ├─ Descriptions
   ├─ Seller names
   └─ Ingredients

2. Filtered Search
   ├─ Category filter
   ├─ Price range
   ├─ Rating filter
   ├─ Delivery type (hub/direct)
   ├─ Dietary filters (halal, vegan, etc)
   └─ Location-based

3. Smart Sorting
   ├─ Relevance (default)
   ├─ Price: Low to High
   ├─ Price: High to Low
   ├─ Rating: High to Low
   ├─ Newest First
   ├─ Most Popular
   └─ Fastest Delivery

4. Personalized Recommendations
   ├─ Based on order history
   ├─ Similar products
   ├─ Trending in your area
   ├─ Frequently bought together
   └─ Seasonal suggestions

Search Index Structure:
──────────────────────

Product Document:
{
  "id": "prod_123",
  "name": "Chicken Samosas",
  "name_urdu": "چکن سموسے",
  "seller_name": "Ammi's Kitchen",
  "category": "Appetizers",
  "tags": ["chicken", "samosa", "party", "frozen"],
  "price": 800,
  "rating": 4.5,
  "total_orders": 150,
  "delivery_type": ["hub", "direct"],
  "available_at_hubs": ["DHA_KHI", "GULSHAN_KHI"],
  "in_stock": true,
  "dietary": ["halal"],
  "search_boost": 1.2 // Featured products
}

Urdu Search Support:
├─ Roman Urdu matching ("samosa" → سموسا)
├─ Urdu keyboard input
├─ Transliteration support
└─ Fuzzy matching for typos
```

---

### **8. Rating & Review System**

```typescript
// Trust Building Architecture

Review Lifecycle:
────────────────

Order Delivered
       ↓
Customer receives review request
       ↓
┌─────────────────────┐
│ Review Form         │
├─────────────────────┤
│ • Product rating    │ (1-5 stars)
│ • Seller rating     │ (1-5 stars)
│ • Delivery rating   │ (1-5 stars)
│ • Written review    │ (optional)
│ • Photo upload      │ (optional)
│ • Anonymous option  │ (checkbox)
└──────────┬──────────┘
           ↓
    Spam Detection
           ↓
    Published (seller notified)
           ↓
┌─────────────────────┐
│ Seller can respond  │
│ (public reply)      │
└─────────────────────┘

Review Verification:
├─ Only verified purchases can review
├─ One review per order
├─ Edit allowed within 48 hours
├─ Flagging system for inappropriate content
└─ Admin moderation for disputes

Rating Calculation:
──────────────────

Seller Rating = Weighted Average
├─ Product Quality: 40%
├─ Taste: 30%
├─ Packaging: 15%
├─ Delivery Time: 15%

Badges Earned:
├─ 4.5+ stars: "Top Rated"
├─ 100+ reviews: "Customer Favorite"
├─ <2% complaints: "Reliable Seller"
├─ 4.8+ stars (50+ reviews): "Premium Quality"
└─ Consistent 5-star: "Excellence Award"
```

---

### **9. Analytics & Reporting System**

```typescript
// Data-Driven Decision Making

Analytics Dashboard Layers:
──────────────────────────

1. Customer Analytics
   ├─ User acquisition (daily/weekly/monthly)
   ├─ Retention rate
   ├─ Churn analysis
   ├─ Lifetime value (LTV)
   ├─ Order frequency
   ├─ Average order value (AOV)
   └─ Cart abandonment rate

2. Seller Analytics
   ├─ Revenue trends
   ├─ Best-selling products
   ├─ Stock turnover rate
   ├─ Rating trends
   ├─ Customer demographics
   ├─ Peak order times
   └─ Commission breakdown

3. Product Analytics
   ├─ Category performance
   ├─ Price elasticity
   ├─ Search trends
   ├─ Conversion rates
   ├─ Product page views
   └─ Add-to-cart rate

4. Operational Analytics
   ├─ Delivery performance
   ├─ Hub utilization
   ├─ Rider efficiency
   ├─ Order fulfillment time
   ├─ Customer support tickets
   └─ Platform uptime

5. Financial Analytics
   ├─ GMV (Gross Merchandise Value)
   ├─ Revenue breakdown
   ├─ Commission earned
   ├─ Refund rate
   ├─ Payment method distribution
   └─ City-wise performance

Real-Time Metrics:
├─ Active users now
├─ Orders in last hour
├─ Revenue today
├─ Average delivery time
└─ Platform health status
```

---

### **10. Admin Control Panel**

```typescript
// Centralized Management System

Admin Panel Modules:
───────────────────

1. Dashboard (Overview)
   ├─ Key metrics cards
   ├─ Revenue chart
   ├─ Order status breakdown
   ├─ Alerts & notifications
   └─ Quick actions

2. Seller Management
   ├─ Pending approvals
   ├─ Seller list (active/suspended)
   ├─ Verification status
   ├─ Commission settings
   ├─ Featured seller management
   └─ Performance reports

3. Product Management
   ├─ Product approval queue
   ├─ Category management
   ├─ Bulk edit tools
   ├─ Featured products
   └─ Reported products

4. Order Management
   ├─ All orders view
   ├─ Dispute resolution
   ├─ Refund processing
   ├─ Order status override
   └─ Bulk actions

5. Hub Management
   ├─ Hub list & status
   ├─ Inventory oversight
   ├─ Temperature monitoring
   ├─ Staff management
   └─ Performance metrics

6. Customer Support
   ├─ Support ticket system
   ├─ Chat with customers
   ├─ Complaint management
   ├─ Ban/suspend users
   └─ FAQ management

7. Marketing Tools
   ├─ Promotion code creator
   ├─ Push notification sender
   ├─ Email campaigns
   ├─ Banner management
   └─ Referral program settings

8. Financial Management
   ├─ Payout processing
   ├─ Transaction history
   ├─ Revenue reports
   ├─ Tax reports
   └─ Commission adjustments

9. Settings
   ├─ Platform configuration
   ├─ Payment gateway settings
   ├─ Delivery zones
   ├─ Commission rates
   ├─ User roles & permissions
   └─ System maintenance
```

---

## 🔐 Security Architecture

### **Security Layers**

```yaml
1. Network Security:
   - HTTPS only (TLS 1.3)
   - DDoS protection (Cloudflare)
   - Rate limiting (Redis)
   - IP whitelisting (admin panel)
   - Firewall rules (AWS Security Groups)

2. Application Security:
   - Input validation (Zod schemas)
   - SQL injection prevention (Prisma ORM)
   - XSS protection (sanitization)
   - CSRF tokens (forms)
   - Content Security Policy headers

3. Authentication Security:
   - bcrypt password hashing
   - JWT with RS256 signing
   - Refresh token rotation
   - Multi-device session management
   - Account lockout (failed attempts)

4. Data Security:
   - Encryption at rest (database)
   - Encryption in transit (TLS)
   - PII data masking (logs)
   - GDPR compliance ready
   - Regular backups (daily)

5. Payment Security:
   - PCI DSS compliance (via Stripe)
   - Escrow system
   - Fraud detection
   - Transaction monitoring
   - Secure webhook verification

6. API Security:
   - API key authentication
   - Request signing
   - Payload encryption
   - Version control
   - Deprecation policy
```

---

## 📊 Scalability Strategy

### **Horizontal Scaling Plan**

```yaml
Phase 1: 0-1,000 orders/day
  Infrastructure:
    - Single API server (2 vCPU, 4GB RAM)
    - PostgreSQL (2 vCPU, 8GB RAM)
    - Redis (1GB)
    - CDN for static assets
  
  Cost: ~$150/month

Phase 2: 1,000-5,000 orders/day
  Infrastructure:
    - 2 API servers + Load Balancer
    - PostgreSQL (4 vCPU, 16GB RAM)
    - Redis (2GB)
    - Read replica for database
  
  Cost: ~$400/month

Phase 3: 5,000-20,000 orders/day
  Infrastructure:
    - 4-6 API servers (auto-scaling)
    - PostgreSQL (8 vCPU, 32GB RAM)
    - Redis Cluster (4GB)
    - Multiple read replicas
    - CDN + object storage
  
  Cost: ~$1,200/month

Phase 4: 20,000+ orders/day
  Infrastructure:
    - Auto-scaling API servers (10-20)
    - Database sharding (city-based)
    - Redis Cluster (16GB)
    - Microservices extraction
    - Multi-region deployment
  
  Cost: ~$3,000-5,000/month
```

### **Database Sharding Strategy**

```sql
-- City-based sharding for scale

Shard 1: Karachi
├─ Users (Karachi)
├─ Orders (Karachi)
├─ Products (Karachi sellers)
└─ Hub inventory (Karachi hubs)

Shard 2: Lahore
├─ Users (Lahore)
├─ Orders (Lahore)
├─ Products (Lahore sellers)
└─ Hub inventory (Lahore hubs)

Shard 3: Islamabad/Rawalpindi
├─ Users (ISB/RWP)
├─ Orders (ISB/RWP)
├─ Products (ISB/RWP sellers)
└─ Hub inventory (ISB/RWP hubs)

Global Tables (shared):
├─ Categories
├─ Platform settings
├─ Admin users
└─ Global analytics
```

---

## 🚀 Deployment Architecture

### **CI/CD Pipeline**

```yaml
Code Push (GitHub)
       ↓
┌──────────────────┐
│ GitHub Actions   │
│                  │
│ 1. Run tests     │
│ 2. Lint code     │
│ 3. Build assets  │
│ 4. Run security  │
│    scan          │
└────────┬─────────┘
         ↓
    Tests Pass?
         ↓ Yes
┌──────────────────┐
│ Build Docker     │
│ Images           │
│                  │
│ - API image      │
│ - Worker image   │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Push to Registry │
│ (Docker Hub/ECR) │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Deploy to        │
│ Staging          │
│                  │
│ - Run smoke tests│
└────────┬─────────┘
         ↓
   Manual Approval
         ↓
┌──────────────────┐
│ Deploy to        │
│ Production       │
│                  │
│ - Blue-green     │
│ - Zero downtime  │
└──────────────────┘

Environments:
├─ Development (local)
├─ Staging (AWS staging)
├─ Production (AWS prod)
└─ DR (Disaster Recovery - backup region)
```

### **Server Architecture**

```
┌─────────────────────────────────────────┐
│           Cloudflare CDN                 │
│         (DDoS + SSL + Cache)             │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│         Load Balancer (Nginx)            │
│      (SSL termination + routing)         │
└────────┬─────────────────┬──────────────┘
         ↓                 ↓
┌─────────────┐   ┌─────────────┐
│ API Server 1│   │ API Server 2│
│             │   │             │
│ Node.js     │   │ Node.js     │
│ Express     │   │ Express     │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │  PostgreSQL     │
       │  Primary (RW)   │
       └────────┬────────┘
                │
         ┌──────┴──────┐
         ↓             ↓
    ┌────────┐   ┌────────┐
    │Replica1│   │Replica2│
    │  (RO)  │   │  (RO)  │
    └────────┘   └────────┘

┌─────────────────┐
│  Redis Cluster  │
│  (Cache + Queue)│
└─────────────────┘

┌─────────────────┐
│  Cloudinary     │
│  (Images/Video) │
└─────────────────┘
```

---

## 📱 Mobile App Architecture

### **Flutter App Structure**

```
frozen_nuray_app/
├─ lib/
│  ├─ main.dart
│  ├─ app/
│  │  ├─ routes.dart
│  │  ├─ theme.dart
│  │  └─ constants.dart
│  │
│  ├─ core/
│  │  ├─ network/
│  │  │  ├─ api_client.dart
│  │  │  ├─ interceptors.dart
│  │  │  └─ endpoints.dart
│  │  ├─ storage/
│  │  │  ├─ secure_storage.dart
│  │  │  └─ local_storage.dart
│  │  ├─ utils/
│  │  │  ├─ validators.dart
│  │  │  ├─ formatters.dart
│  │  │  └─ helpers.dart
│  │  └─ errors/
│  │     ├─ exceptions.dart
│  │     └─ failures.dart
│  │
│  ├─ features/
│  │  ├─ auth/
│  │  │  ├─ data/
│  │  │  │  ├─ models/
│  │  │  │  ├─ repositories/
│  │  │  │  └─ datasources/
│  │  │  ├─ domain/
│  │  │  │  ├─ entities/
│  │  │  │  ├─ repositories/
│  │  │  │  └─ usecases/
│  │  │  └─ presentation/
│  │  │     ├─ providers/
│  │  │     ├─ screens/
│  │  │     └─ widgets/
│  │  │
│  │  ├─ home/
│  │  ├─ products/
│  │  ├─ cart/
│  │  ├─ orders/
│  │  ├─ profile/
│  │  └─ seller_dashboard/
│  │
│  ├─ shared/
│  │  ├─ widgets/
│  │  ├─ providers/
│  │  └─ models/
│  │
│  └─ l10n/ (localization)
│     ├─ app_en.arb
│     └─ app_ur.arb
│
├─ assets/
│  ├─ images/
│  ├─ fonts/
│  └─ animations/
│
├─ test/
├─ integration_test/
└─ pubspec.yaml

Clean Architecture Layers:
──────────────────────────

Presentation Layer (UI)
        ↓
Domain Layer (Business Logic)
        ↓
Data Layer (API + Local Storage)
```

### **State Management (Riverpod)**

```dart
// Example: Product State Management

// Provider for products
final productsProvider = StateNotifierProvider<ProductsNotifier, ProductsState>(
  (ref) => ProductsNotifier(ref.read(productRepositoryProvider))
);

// State
class ProductsState {
  final List<Product> products;
  final bool isLoading;
  final String? error;
  final ProductFilters filters;
  
  ProductsState({
    this.products = const [],
    this.isLoading = false,
    this.error,
    this.filters = const ProductFilters(),
  });
}

// Notifier
class ProductsNotifier extends StateNotifier<ProductsState> {
  final ProductRepository _repository;
  
  ProductsNotifier(this._repository) : super(ProductsState());
  
  Future<void> fetchProducts() async {
    state = state.copyWith(isLoading: true);
    
    try {
      final products = await _repository.getProducts(state.filters);
      state = state.copyWith(products: products, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }
  
  void applyFilters(ProductFilters filters) {
    state = state.copyWith(filters: filters);
    fetchProducts();
  }
}
```

---

## 🔔 Real-Time Features Architecture

### **WebSocket Implementation**

```typescript
// Socket.io Server Setup

io.on('connection', (socket) => {
  
  // Authenticate socket connection
  const userId = authenticateSocket(socket.handshake.auth.token);
  socket.join(`user:${userId}`);
  
  // Order tracking
  socket.on('track:order', (orderId) => {
    socket.join(`order:${orderId}`);
  });
  
  // Live inventory updates
  socket.on('watch:product', (productId) => {
    socket.join(`product:${productId}`);
  });
  
  // Seller dashboard
  if (userIsSeller(userId)) {
    socket.join(`seller:${userId}`);
  }
  
  // Hub manager
  if (userIsHubManager(userId)) {
    socket.join(`hub:${hubId}`);
  }
});

// Emit events from backend

// Order status change
io.to(`order:${orderId}`).emit('order:status', {
  orderId,
  status: 'OUT_FOR_DELIVERY',
  timestamp: new Date()
});

// Inventory update
io.to(`product:${productId}`).emit('inventory:update', {
  productId,
  quantity: 15,
  location: 'hub'
});

// New order for seller
io.to(`seller:${sellerId}`).emit('order:new', {
  orderId,
  customer,
  items,
  total
});

// Flutter client connection

final socket = io('https://api.frozennuray.com', 
  OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({'token': authToken})
    .build()
);

socket.on('order:status', (data) {
  // Update UI with new order status
});

socket.on('inventory:update', (data) {
  // Update product availability
});
```

---

## 🎨 Design System

### **Color Palette**

```css
/* Primary Colors */
--primary-green: #10B981;      /* Fresh, trust */
--primary-dark: #059669;       /* Hover state */
--primary-light: #D1FAE5;      /* Backgrounds */

/* Secondary Colors */
--secondary-orange: #F97316;   /* Call-to-action */
--secondary-red: #EF4444;      /* Urgent, errors */
--secondary-blue: #3B82F6;     /* Info */

/* Neutral Colors */
--gray-900: #111827;           /* Text primary */
--gray-700: #374151;           /* Text secondary */
--gray-500: #6B7280;           /* Text disabled */
--gray-300: #D1D5DB;           /* Borders */
--gray-100: #F3F4F6;           /* Backgrounds */
--white: #FFFFFF;

/* Semantic Colors */
--success: #10B981;
--warning: #F59E0B;
--error: #EF4444;
--info: #3B82F6;
```

### **Typography**

```css
/* English Font */
font-family: 'Inter', sans-serif;

/* Urdu Font */
font-family: 'Noto Nastaliq Urdu', serif;

/* Font Sizes */
--text-xs: 12px;    /* Labels */
--text-sm: 14px;    /* Body small */
--text-base: 16px;  /* Body */
--text-lg: 18px;    /* Subheadings */
--text-xl: 20px;    /* Headings */
--text-2xl: 24px;   /* Page titles */
--text-3xl: 30px;   /* Hero text */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### **Spacing System**

```css
/* Based on 4px base unit */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

---

## 🧪 Testing Strategy

```yaml
Testing Pyramid:
───────────────

                    /\
                   /E2E\
                  /─────\
                 /  API  \
                /─────────\
               /   Unit    \
              /─────────────\

Unit Tests (70%):
  - Business logic
  - Utilities
  - Data models
  - Validators
  Tool: Jest (Node.js), Flutter Test (Dart)

Integration Tests (20%):
  - API endpoints
  - Database operations
  - Payment flows
  - Authentication
  Tool: Supertest (API), Integration test (Flutter)

E2E Tests (10%):
  - Critical user journeys
  - Order placement flow
  - Payment processing
  - Seller onboarding
  Tool: Playwright (Web), Flutter integration test (Mobile)

Testing Checklist:
├─ Pre-deployment tests (automated)
├─ Regression tests (weekly)
├─ Load testing (monthly)
├─ Security testing (quarterly)
└─ User acceptance testing (new features)
```

---

## 📈 Performance Optimization

```yaml
Frontend Performance:
─────────────────────
1. Code Splitting
   - Route-based chunks
   - Lazy loading components
   - Dynamic imports

2. Image Optimization
   - WebP format with fallback
   - Responsive images (srcset)
   - Lazy loading (intersection observer)
   - Cloudinary auto-optimization

3. Caching Strategy
   - Service Worker (PWA)
   - API response caching
   - Static asset caching (1 year)
   - CDN edge caching

4. Bundle Optimization
   - Tree shaking
   - Minification
   - Compression (gzip/brotli)
   - Remove unused CSS

Backend Performance:
────────────────────
1. Database Optimization
   - Proper indexing
   - Query optimization
   - Connection pooling
   - Read replicas

2. API Performance
   - Redis caching
   - Response compression
   - Pagination (limit results)
   - GraphQL (future: selective fields)

3. Background Jobs
   - Email sending (queue)
   - Image processing (queue)
   - Report generation (queue)
   - Payout processing (scheduled)

4. Monitoring
   - APM (Application Performance Monitoring)
   - Slow query logging
   - Error tracking (Sentry)
   - Uptime monitoring

Performance Targets:
───────────────────
- Page load: < 2 seconds
- API response: < 200ms (p95)
- Time to Interactive: < 3 seconds
- First Contentful Paint: < 1 second
- Database queries: < 50ms (indexed)
```

---

## 🔄 Data Backup & Recovery

```yaml
Backup Strategy:
───────────────

1. Database Backups
   - Automated daily backups (PostgreSQL)
   - Incremental backups (every 6 hours)
   - Retention: 30 days rolling
   - Encrypted backups (AES-256)
   - Geographic redundancy (multi-region)

2. File Backups
   - Cloudinary automatic backups
   - Weekly full backup to S3
   - Version control enabled

3. Configuration Backups
   - Environment variables (encrypted)
   - Server configurations (Git)
   - Infrastructure as Code (Terraform)

Recovery Plan:
─────────────

RTO (Recovery Time Objective): 1 hour
RPO (Recovery Point Objective): 6 hours

Disaster Scenarios:
├─ Database failure
│  └─ Promote read replica (automated)
│  
├─ Server failure
│  └─ Auto-scaling group launches new instance
│  
├─ Region failure
│  └─ Failover to DR region (manual, 1 hour)
│  
└─ Data corruption
   └─ Restore from latest backup (tested monthly)
```

---

## 🌍 Internationalization (i18n)

```typescript
// Multi-language Support

Supported Languages:
├─ English (en) - Default
├─ Urdu (ur) - Primary Pakistani language
└─ Roman Urdu (ur-PK) - Future

Translation Structure:
─────────────────────

{
  "en": {
    "common": {
      "app_name": "FrozenNuray",
      "search_placeholder": "Search frozen items...",
      "add_to_cart": "Add to Cart",
      "checkout": "Checkout"
    },
    "categories": {
      "parathas": "Frozen Parathas",
      "samosas": "Samosas & Snacks",
      "meals": "Ready-to-Eat Meals"
    }
  },
  "ur": {
    "common": {
      "app_name": "فروزن نورے",
      "search_placeholder": "منجمد اشیاء تلاش کریں...",
      "add_to_cart": "ٹوکری میں شامل کریں",
      "checkout": "آرڈر مکمل کریں"
    },
    "categories": {
      "parathas": "منجمد پراٹھے",
      "samosas": "سموسے اور نمکین",
      "meals": "تیار کھانے"
    }
  }
}

Currency Formatting:
├─ PKR symbol: ₨
├─ Format: ₨ 1,500
└─ Decimal places: 0 (no paisas)

Date/Time Formatting:
├─ Format: DD/MM/YYYY (Pakistan standard)
├─ Time: 12-hour format (AM/PM)
└─ Timezone: Asia/Karachi (PKT, UTC+5)

Number Formatting:
├─ Separator: Comma (1,000)
└─ Decimal: Period (optional for weight)
```

---

This architecture document provides the complete technical blueprint for FrozenNuray platform. It covers all aspects from high-level system design to detailed implementation specifics, including the innovative Hub Center concept for high-density areas.

**Next Steps:**
1. Review and approve architecture
2. Set up development environment
3. Initialize project repositories
4. Begin Phase 1 development (Backend + Web)
5. Parallel: Begin Flutter app development

**Estimated Timeline:**
- Architecture Review: 1 week
- Development Setup: 1 week
- Phase 1 (Backend + Web): 8 weeks
- Phase 2 (Android App): 6 weeks (parallel with Phase 1)
- Phase 3 (iOS App): 2 weeks (code reuse from Android)
- Testing & Launch Prep: 2 weeks

**Total: ~4 months to full launch** 🚀
