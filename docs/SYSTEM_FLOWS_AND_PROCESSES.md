# FrozenNuray Platform - Complete System Flows & Processes

## 📋 Table of Contents
1. [User Registration & Authentication](#user-registration--authentication)
2. [Customer Shopping Flow](#customer-shopping-flow)
3. [Seller Registration & Management](#seller-registration--management)
4. [Admin Functions](#admin-functions)
5. [Order Fulfillment Process](#order-fulfillment-process)
6. [Payment Processing](#payment-processing)
7. [Complete User Journey Examples](#complete-user-journey-examples)

---

## 🔐 User Registration & Authentication

### How Users Are Created

#### Step 1: Customer Registration
```
1. User sends phone number → POST /api/v1/auth/register/send-otp
   - Phone: +923001234567
   - User Type: "customer"
   
2. System sends OTP via SMS
   - OTP stored in database with 5-minute expiry
   
3. User verifies OTP → POST /api/v1/auth/register/verify-otp
   - Phone: +923001234567
   - OTP: 123456
   - Full Name: "Ahmed Khan"
   - Email: "ahmed@example.com"
   - Password: "SecurePass123!"
   - City: "Karachi"
   - Area: "DHA Phase 5"
   
4. System creates:
   - User account (status: "active", userType: "customer")
   - UserProfile with name, city, area
   - Wallet (balance: 0 PKR)
   - Returns JWT access_token and refresh_token
```

#### Step 2: Login Options
Users can login in 3 ways:

**Option A: OTP Login (No Password Required)**
```
1. POST /api/v1/auth/login/send-otp
   - Phone: +923001234567
   
2. System sends OTP
   
3. POST /api/v1/auth/login/verify-otp
   - Phone: +923001234567
   - OTP: 123456
   
4. Returns JWT tokens
```

**Option B: Password Login**
```
1. POST /api/v1/auth/login/password
   - Phone: +923001234567
   - Password: "SecurePass123!"
   
2. Returns JWT tokens
```

**Option C: Refresh Token**
```
1. POST /api/v1/auth/refresh-token
   - Refresh Token: "eyJhbG..."
   
2. Returns new access_token and refresh_token
```

---

## 🛒 Customer Shopping Flow

### Complete Purchase Journey

#### Step 1: Browse Products
```
GET /api/v1/products?page=1&limit=20&city=Karachi&category=uuid

Response: List of products with:
- Product details (name, price, images)
- Seller information (business name, rating)
- Stock availability (direct/hub)
- Delivery time estimates
```

#### Step 2: View Product Details
```
GET /api/v1/products/:id

Response: Full product information:
- Description, ingredients, allergens
- All images
- Seller details
- Reviews and ratings
- Stock in different locations
- Heating instructions
```

#### Step 3: Add to Cart
```
POST /api/v1/cart/items
Authorization: Bearer <token>
{
  "product_id": "uuid",
  "quantity": 2,
  "stock_type": "hub",  // or "direct"
  "hub_id": "uuid"      // if stock_type is "hub"
}

System:
- Validates product exists and is active
- Checks stock availability
- Validates quantity limits
- Creates/updates cart item
- Stores price snapshot (in case price changes)
```

#### Step 4: View Cart
```
GET /api/v1/cart
Authorization: Bearer <token>

Response:
- All cart items grouped by seller
- Subtotal, delivery fee, discount, total
- Stock validation status
- Price snapshots
```

#### Step 5: Apply Promotion Code (Optional)
```
POST /api/v1/promotions/validate
Authorization: Bearer <token>
{
  "code": "WELCOME10",
  "cart_total": 3200
}

System validates:
- Code exists and is active
- Not expired
- Minimum order amount met
- Usage limits not exceeded
- User hasn't exceeded per-user limit

Response:
- Discount amount
- Final amount after discount
```

#### Step 6: Create Order
```
POST /api/v1/orders
Authorization: Bearer <token>
{
  "items": [
    {
      "product_id": "uuid",
      "quantity": 2,
      "stock_type": "hub",
      "hub_id": "uuid"
    }
  ],
  "delivery_type": "home_delivery",
  "delivery_address_id": "uuid",
  "delivery_slot_date": "2025-11-15",
  "delivery_slot_time": "evening",
  "payment_method": "jazzcash",
  "promotion_code": "WELCOME10",
  "delivery_instructions": "Call before delivery"
}

System Process:
1. Validates all cart items exist
2. Checks stock availability for each item
3. Creates inventory reservations (prevents overselling)
4. Calculates:
   - Subtotal (sum of all items)
   - Delivery fee (based on distance/area)
   - Discount (from promotion code)
   - Tax (5% GST on subtotal)
   - Total amount
5. Creates order with status: "pending"
6. Creates order items for each product
7. Records promotion usage
8. Generates unique order number: "FN202511150001"
9. Emits real-time notification to sellers
10. Returns order details and payment URL
```

#### Step 7: Process Payment
```
POST /api/v1/payments/process
Authorization: Bearer <token>
{
  "order_id": "uuid",
  "payment_method": "jazzcash",
  "payment_details": {
    "account_number": "03001234567"
  }
}

Payment Methods:

A. JazzCash/EasyPaisa/Card:
   - Generates payment URL
   - User redirected to payment gateway
   - Returns payment_id and redirect_url

B. Cash on Delivery (COD):
   - No payment processing needed
   - Order status remains "pending"
   - Payment collected on delivery

C. Wallet:
   - Checks wallet balance
   - Deducts amount from wallet
   - Creates wallet transaction
   - Marks order as "paid" immediately
   - Updates order status to "confirmed"
```

#### Step 8: Verify Payment (for gateway payments)
```
POST /api/v1/payments/verify
Authorization: Bearer <token>
{
  "payment_id": "PAY-123456",
  "transaction_id": "JC789012"
}

System:
- Verifies payment with gateway
- Updates order payment_status to "paid"
- Updates order_status to "confirmed"
- Creates order status history
- Emits real-time status update
```

#### Step 9: Track Order (Real-time)
```
WebSocket Connection:
- User connects with JWT token
- Joins order room: socket.emit('join:order', orderId)

Real-time Updates Received:
- order:status:update - When order status changes
- order:item:status:update - When individual item status changes
- order:delivery:tracking - Live delivery location updates

REST API:
GET /api/v1/realtime/orders/:id/track
- Returns current order status
- Status history timeline
- Delivery tracking information
```

#### Step 10: Order Delivery
```
Order Status Flow:
pending → confirmed → preparing → ready → dispatched → in_transit → delivered → completed

1. Seller updates item status to "preparing"
2. Seller updates item status to "ready"
3. Admin/hub dispatches order
4. Rider assigned for delivery
5. Real-time location tracking
6. Order marked as "delivered"
7. Customer can review after delivery
```

#### Step 11: Review & Rating
```
POST /api/v1/reviews
Authorization: Bearer <token>
{
  "order_id": "uuid",
  "order_item_id": "uuid",
  "product_rating": 5,
  "seller_rating": 5,
  "delivery_rating": 4,
  "comment": "Excellent quality!",
  "photos": ["https://..."]
}

System:
- Validates order is delivered
- Creates review
- Updates product average rating
- Updates seller average rating
- Updates seller total reviews count
```

---

## 👨‍🍳 Seller Registration & Management

### How Sellers Register

#### Step 1: User Becomes Seller
```
Option A: Existing Customer Registers as Seller
1. User already has customer account
2. POST /api/v1/sellers/register
   Authorization: Bearer <token>
   {
     "business_name": "Ammi's Kitchen",
     "business_name_urdu": "امی کی کچن",
     "description": "Homemade frozen food...",
     "kitchen_video_url": "https://...",
     "cover_image_url": "https://...",
     "cnic_front_url": "https://...",
     "cnic_back_url": "https://...",
     "kitchen_photo_urls": ["https://...", "https://..."]
   }
   
3. System creates:
   - Seller record (status: "pending", verificationStatus: "pending")
   - Updates user.userType to "seller"
   - Application submitted for admin review

Option B: New User Registers as Seller Directly
1. Same registration process as customer
2. During registration, user_type can be "seller"
3. After account creation, seller registration form appears
```

#### Step 2: Admin Reviews Seller Application
```
Admin Process:
1. GET /api/v1/admin/sellers/pending
   - Lists all pending seller applications
   
2. Admin reviews:
   - Business information
   - CNIC documents
   - Kitchen photos/video
   - Business description
   
3. POST /api/v1/admin/sellers/:id/approve
   {
     "approved": true,
     "notes": "All documents verified"
   }
   
   OR
   
   {
     "approved": false,
     "notes": "CNIC verification failed"
   }

System Updates:
- If approved:
  - verificationStatus: "approved"
  - isVerified: true
  - status: "active"
  - Seller can now add products
  
- If rejected:
  - verificationStatus: "rejected"
  - status: "inactive"
  - rejectionReason stored
  - Seller notified
```

#### Step 3: Seller Adds Products
```
POST /api/v1/products
Authorization: Bearer <token> (seller)
{
  "name": "Chicken Samosas",
  "name_urdu": "چکن سموسے",
  "description": "Delicious crispy samosas...",
  "category_id": "uuid",
  "price": 800,
  "unit": "dozen",
  "stock_quantity": 50,
  "stock_type": "both",  // "direct", "hub", or "both"
  "images": ["https://...", "https://..."],
  "tags": ["frozen", "snacks"],
  "ingredients": "Chicken, flour, spices...",
  "allergens": "Gluten",
  "dietary_info": ["halal"],
  "storage_days": 30,
  "heating_instructions": "Preheat oven to 180°C..."
}

System:
- Creates product (approvalStatus: "pending")
- Requires admin approval before going live
- Product not visible to customers until approved
```

#### Step 4: Admin Approves Product
```
Admin Process:
1. Admin reviews product:
   - Images quality
   - Description accuracy
   - Pricing reasonableness
   - Category appropriateness
   
2. POST /api/v1/admin/products/:id/moderate
   {
     "approved": true,
     "reason": null
   }
   
   OR
   
   {
     "approved": false,
     "reason": "Images quality not acceptable"
   }

System Updates:
- If approved:
  - approvalStatus: "approved"
  - isActive: true (if seller set it)
  - Product visible to customers
  
- If rejected:
  - approvalStatus: "rejected"
  - isActive: false
  - rejectionReason stored
  - Seller can update and resubmit
```

#### Step 5: Seller Manages Orders
```
Seller Dashboard:
GET /api/v1/sellers/me/dashboard
- Total products
- Active orders count
- Pending orders count
- Total earnings
- Pending payout
- Rating and reviews
- Recent orders
- Low stock products
- Pending reviews

View Orders:
GET /api/v1/seller/orders?status=pending
- Lists all order items for this seller
- Filter by status, date range
- See customer information
- View order details

Update Order Status:
PATCH /api/v1/seller/orders/items/:id/status
{
  "status": "preparing"
}

Status Options:
- "pending" - Order received
- "preparing" - Cooking/preparing
- "ready" - Ready for pickup/dispatch
- "cancelled" - Cancelled by seller

System:
- Updates order item status
- If all items ready, updates order status to "ready"
- Emits real-time update to customer
```

#### Step 6: Seller Analytics
```
GET /api/v1/sellers/me/analytics?period=30d

Response:
- Revenue (total and daily graph)
- Orders (total, completed, cancelled)
- Top selling products
- Customer demographics

Periods: 7d, 30d, 90d, 1y
```

#### Step 7: Seller Requests Payout
```
POST /api/v1/sellers/me/payouts
{
  "amount": 12000,
  "payout_method": "jazzcash",
  "account_number": "03001234567"
}

System:
- Validates available balance
- Checks minimum payout amount (default: 1000 PKR)
- Calculates commission (15% platform fee)
- Creates payout request (status: "pending")
- Admin processes payout (2-3 business days)
```

---

## 👨‍💼 Admin Functions

### Admin Capabilities

#### 1. Platform Analytics
```
GET /api/v1/admin/analytics?period=30d

Metrics:
- Total GMV (Gross Merchandise Value)
- Total orders
- Active users count
- Active sellers count
- Total commission earned
- Orders by status breakdown
- Revenue trends by day
```

#### 2. Seller Management
```
View Pending Sellers:
GET /api/v1/admin/sellers/pending
- Lists all seller applications awaiting review
- Shows business details, documents, verification status

Approve/Reject Seller:
POST /api/v1/admin/sellers/:id/approve
{
  "approved": true,
  "notes": "All documents verified"
}
```

#### 3. Product Moderation
```
Moderate Product:
POST /api/v1/admin/products/:id/moderate
{
  "approved": false,
  "reason": "Images quality not acceptable"
}

Admin reviews:
- Product images
- Descriptions
- Pricing
- Category appropriateness
- Compliance with food safety standards
```

#### 4. Order Management
```
View All Orders:
GET /api/v1/admin/orders?orderStatus=confirmed&paymentStatus=paid

Filter by:
- Order status
- Payment status
- Customer
- Seller
- Date range
- Order number

Update Order Status:
PATCH /api/v1/admin/orders/:id/status
{
  "status": "dispatched",
  "notes": "Dispatched to hub"
}

Cancel Order:
POST /api/v1/admin/orders/:id/cancel
{
  "reason": "Customer request"
}

System:
- Restores stock
- Processes refund if paid
- Updates inventory reservations
- Emits real-time updates
```

#### 5. Refund Processing
```
POST /api/v1/admin/orders/:id/refund
{
  "refund_amount": 3300
}

System:
- Validates order is eligible for refund
- Processes full or partial refund
- Updates payment status to "refunded"
- Updates order status to "refunded"
- Creates refund transaction
- If wallet payment, credits back to wallet
- If gateway payment, initiates refund via gateway
```

---

## 📦 Order Fulfillment Process

### Complete Order Lifecycle

#### Stage 1: Order Creation (Customer)
```
1. Customer adds items to cart
2. Customer creates order
3. System:
   - Validates stock
   - Creates inventory reservations
   - Calculates pricing
   - Generates order number
   - Status: "pending"
4. Real-time notification sent to sellers
```

#### Stage 2: Payment Processing
```
1. Customer processes payment
2. Payment methods:
   - Gateway (JazzCash/EasyPaisa/Card): Redirects to payment page
   - Wallet: Instant payment, order confirmed immediately
   - COD: No payment, collected on delivery
3. On successful payment:
   - payment_status: "paid"
   - order_status: "confirmed"
   - Real-time update to customer and sellers
```

#### Stage 3: Seller Preparation
```
1. Seller receives order notification (real-time)
2. Seller views order in dashboard
3. Seller updates item status:
   - "preparing" - Started cooking
   - "ready" - Ready for dispatch
4. When all items ready:
   - Order status: "ready"
   - Ready for hub pickup or direct delivery
```

#### Stage 4: Hub Processing (if hub fulfillment)
```
1. Order items sent to hub
2. Hub receives inventory
3. Hub quality check
4. Hub stores in freezer
5. Hub prepares for dispatch
```

#### Stage 5: Dispatch & Delivery
```
1. Admin/hub dispatches order
2. Rider assigned
3. Order status: "dispatched"
4. Real-time tracking starts:
   - Rider location updates
   - Estimated arrival time
   - Distance remaining
5. Order status: "in_transit"
6. Customer receives real-time location updates
7. Order delivered
8. Order status: "delivered"
```

#### Stage 6: Completion
```
1. After delivery, customer can review
2. After review period (e.g., 7 days):
   - Order status: "completed"
   - Seller payout processed
   - Commission calculated
   - Analytics updated
```

---

## 💳 Payment Processing

### Payment Flow Details

#### Payment Methods Available

1. **JazzCash**
   - Mobile wallet payment
   - Redirects to JazzCash payment page
   - Customer completes payment
   - Webhook confirms payment
   - Order confirmed

2. **EasyPaisa**
   - Mobile wallet payment
   - Similar flow to JazzCash

3. **Credit/Debit Card**
   - Card payment via Stripe
   - Secure payment processing
   - PCI DSS compliant

4. **Cash on Delivery (COD)**
   - No upfront payment
   - Extra fee: 50 PKR
   - Payment collected on delivery
   - Order confirmed after delivery

5. **FrozenNuray Wallet**
   - Customer's wallet balance
   - Instant payment
   - Balance deducted immediately
   - Transaction recorded

#### Payment Processing Steps

```
1. Customer selects payment method
2. POST /api/v1/payments/process
   - Validates order
   - Generates payment request
   - Returns payment URL (for gateways)
   
3. For Gateway Payments:
   - Customer redirected to payment page
   - Completes payment
   - Gateway redirects back with transaction ID
   - POST /api/v1/payments/verify
   - System verifies payment
   - Order confirmed
   
4. For Wallet Payments:
   - Balance checked
   - Amount deducted
   - Transaction created
   - Order confirmed immediately
   
5. For COD:
   - No payment processing
   - Order remains "pending"
   - Payment collected on delivery
```

#### Refund Process

```
1. Order cancelled or refunded
2. System checks payment method:
   - Wallet: Credits back to wallet
   - Gateway: Initiates refund via gateway API
   - COD: No refund needed
3. Refund transaction created
4. Customer notified
5. Order status: "refunded"
```

---

## 🎯 Complete User Journey Examples

### Example 1: Customer Buys Frozen Samosas

```
1. Ahmed (Customer) registers:
   - Phone: +923001234567
   - Receives OTP
   - Completes registration
   - Gets JWT token

2. Ahmed browses products:
   GET /api/v1/products?category=samosas&city=Karachi
   - Sees "Chicken Samosas" from "Ammi's Kitchen"
   - Price: 800 PKR per dozen
   - Rating: 4.5 stars
   - Available in hub (2-4 hours delivery)

3. Ahmed views product details:
   GET /api/v1/products/:id
   - Sees ingredients, images, reviews
   - Decides to buy 2 dozens

4. Ahmed adds to cart:
   POST /api/v1/cart/items
   - Product: Chicken Samosas
   - Quantity: 2
   - Stock type: hub
   - Hub: DHA Phase 5 Hub

5. Ahmed views cart:
   GET /api/v1/cart
   - Subtotal: 1600 PKR
   - Delivery fee: 100 PKR
   - Total: 1700 PKR

6. Ahmed applies promotion:
   POST /api/v1/promotions/validate
   - Code: "WELCOME10"
   - Discount: 170 PKR (10%)
   - Final: 1530 PKR

7. Ahmed creates order:
   POST /api/v1/orders
   - Delivery address: Home
   - Delivery slot: Evening
   - Payment: JazzCash
   - Order created: FN202511150001
   - Status: "pending"

8. Ahmed pays:
   POST /api/v1/payments/process
   - Redirected to JazzCash
   - Completes payment
   - POST /api/v1/payments/verify
   - Order confirmed

9. Real-time updates:
   - Seller receives notification
   - Seller updates: "preparing"
   - Seller updates: "ready"
   - Order dispatched
   - Rider assigned
   - Live tracking
   - Delivered!

10. Ahmed reviews:
    POST /api/v1/reviews
    - Product: 5 stars
    - Seller: 5 stars
    - Delivery: 4 stars
    - Comment: "Excellent!"
```

### Example 2: Fatima Becomes a Seller

```
1. Fatima (Customer) wants to sell:
   - Already has customer account
   - Logs in

2. Fatima registers as seller:
   POST /api/v1/sellers/register
   - Business: "Fatima's Kitchen"
   - Uploads CNIC, kitchen photos
   - Status: "pending"

3. Admin reviews:
   GET /api/v1/admin/sellers/pending
   - Admin sees Fatima's application
   - Reviews documents
   - POST /api/v1/admin/sellers/:id/approve
   - Approved!

4. Fatima adds products:
   POST /api/v1/products
   - "Beef Biryani" - 1200 PKR
   - "Chicken Karahi" - 1000 PKR
   - Status: "pending" (awaiting approval)

5. Admin approves products:
   POST /api/v1/admin/products/:id/moderate
   - Both products approved
   - Now visible to customers

6. Fatima receives first order:
   - Real-time notification
   - Views in dashboard
   - Updates status: "preparing"
   - Updates status: "ready"
   - Order dispatched

7. Fatima tracks earnings:
   GET /api/v1/sellers/me/analytics
   - Total revenue: 5000 PKR
   - Orders: 5
   - Rating: 4.8

8. Fatima requests payout:
   POST /api/v1/sellers/me/payouts
   - Amount: 5000 PKR
   - Commission: 750 PKR (15%)
   - Net: 4250 PKR
   - Status: "pending"
   - Admin processes in 2-3 days
```

---

## 🔄 System Integration Points

### Real-Time Updates (WebSocket)
```
All parties receive real-time updates:
- Customer: Order status, delivery tracking
- Seller: New orders, order updates
- Admin: Platform-wide updates
```

### Notification System
```
Notifications sent for:
- New order (seller)
- Order status change (customer)
- Payment confirmation (customer)
- Order delivered (customer)
- Seller application status (seller)
- Product approval status (seller)
```

### Inventory Management
```
- Stock reservations prevent overselling
- Real-time stock updates
- Hub inventory tracking
- Low stock alerts to sellers
```

### Commission & Payouts
```
- Platform commission: 15% (configurable)
- Seller payout schedule configurable
- Minimum payout: 1000 PKR
- Automatic or manual payout processing
```

---

## 📊 Key Features Summary

### For Customers:
✅ Easy registration (OTP-based)
✅ Browse products with filters
✅ Add to cart
✅ Apply promotion codes
✅ Multiple payment options
✅ Real-time order tracking
✅ Review and rate products
✅ Support tickets

### For Sellers:
✅ Simple registration process
✅ Product management
✅ Order management dashboard
✅ Analytics and insights
✅ Payout requests
✅ Real-time order notifications

### For Admins:
✅ Seller approval workflow
✅ Product moderation
✅ Order management
✅ Platform analytics
✅ Refund processing
✅ Support ticket management

---

*This document covers all major flows in the FrozenNuray platform. Each API endpoint is fully functional and integrated with the database, real-time updates, and notification systems.*

