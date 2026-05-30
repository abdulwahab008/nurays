# FrozenNuray Platform - Complete API Documentation

## Base URL
```
Development: http://localhost:3000/api/v1
Staging: https://staging-api.frozennuray.com/api/v1
Production: https://api.frozennuray.com/api/v1
```

## API Versioning

**Current Version:** v1

**Versioning Strategy:**
- URL-based versioning: `/api/v1`, `/api/v2`
- Backward compatibility: 6 months minimum
- Deprecation notice: 3 months before removal
- Version negotiation: Via `Accept` header (optional)

**Deprecation Process:**
1. Announce deprecation (3 months notice)
2. Maintain old version for 6 months
3. Remove after deprecation period

**Version Header (Optional):**
```
Accept: application/vnd.frozennuray.v1+json
```

## Authentication
All protected endpoints require JWT token in header:
```
Authorization: Bearer <access_token>
```

## Response Format
```json
{
  "success": true,
  "data": {},
  "message": "Success message",
  "timestamp": "2025-11-12T10:30:00Z"
}
```

## Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {}
  },
  "timestamp": "2025-11-12T10:30:00Z"
}
```

---

## 🔐 Authentication APIs

### 1. Register User (Send OTP)
```http
POST /auth/register/send-otp
Content-Type: application/json

{
  "phone": "+923001234567",
  "user_type": "customer"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "otp_sent": true,
    "expires_in": 300,
    "phone_masked": "+9230012***67"
  },
  "message": "OTP sent successfully"
}
```

### 2. Verify OTP & Complete Registration
```http
POST /auth/register/verify-otp
Content-Type: application/json

{
  "phone": "+923001234567",
  "otp": "123456",
  "full_name": "Ahmed Khan",
  "email": "ahmed@example.com",
  "password": "SecurePass123!",
  "city": "Karachi",
  "area": "DHA Phase 5"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "phone": "+923001234567",
      "email": "ahmed@example.com",
      "user_type": "customer",
      "profile": {
        "full_name": "Ahmed Khan",
        "city": "Karachi",
        "area": "DHA Phase 5"
      }
    },
    "tokens": {
      "access_token": "eyJhbG...",
      "refresh_token": "eyJhbG...",
      "expires_in": 86400
    }
  },
  "message": "Registration successful"
}
```

### 3. Login (Send OTP)
```http
POST /auth/login/send-otp
Content-Type: application/json

{
  "phone": "+923001234567"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "otp_sent": true,
    "expires_in": 300
  }
}
```

### 4. Login (Verify OTP)
```http
POST /auth/login/verify-otp
Content-Type: application/json

{
  "phone": "+923001234567",
  "otp": "123456"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "tokens": {
      "access_token": "eyJhbG...",
      "refresh_token": "eyJhbG...",
      "expires_in": 86400
    }
  }
}
```

### 5. Login (Password)
```http
POST /auth/login/password
Content-Type: application/json

{
  "phone": "+923001234567",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "tokens": { /* tokens */ }
  }
}
```

### 6. Refresh Token
```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refresh_token": "eyJhbG..."
}

Response: 200 OK
{
  "success": true,
  "data": {
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "expires_in": 86400
  }
}
```

### 7. Logout
```http
POST /auth/logout
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 👤 User Profile APIs

### 8. Get Current User Profile
```http
GET /users/me
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone": "+923001234567",
    "email": "ahmed@example.com",
    "user_type": "customer",
    "profile": {
      "full_name": "Ahmed Khan",
      "avatar_url": "https://...",
      "city": "Karachi",
      "area": "DHA Phase 5",
      "language_preference": "en"
    },
    "created_at": "2025-01-15T10:00:00Z"
  }
}
```

### 9. Update Profile
```http
PATCH /users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "Ahmed Ali Khan",
  "email": "newemail@example.com",
  "language_preference": "ur"
}

Response: 200 OK
{
  "success": true,
  "data": { /* updated user */ },
  "message": "Profile updated successfully"
}
```

### 10. Update Avatar
```http
POST /users/me/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

avatar: <file>

Response: 200 OK
{
  "success": true,
  "data": {
    "avatar_url": "https://cloudinary.../avatar.jpg"
  }
}
```

### 11. Get User Addresses
```http
GET /users/me/addresses
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "label": "home",
      "address_line1": "House 123, Street 5",
      "area": "DHA Phase 5",
      "city": "Karachi",
      "is_default": true,
      "coordinates": {
        "latitude": 24.8607,
        "longitude": 67.0011
      }
    }
  ]
}
```

### 12. Add Address
```http
POST /users/me/addresses
Authorization: Bearer <token>
Content-Type: application/json

{
  "label": "work",
  "address_line1": "Office 201, Plaza",
  "area": "Clifton",
  "city": "Karachi",
  "landmark": "Near Biryani House",
  "is_default": false
}

Response: 201 Created
{
  "success": true,
  "data": { /* new address */ }
}
```

---

## 🏪 Product APIs

### 13. Get All Products (Browse)
```http
GET /products?page=1&limit=20&category=uuid&city=Karachi&min_price=100&max_price=2000&sort=popular&stock_type=hub

Query Parameters:
- page: Page number (default: 1)
- limit: Items per page (default: 20, max: 100)
- category: Category ID filter
- city: City filter
- area: Area filter
- min_price: Minimum price
- max_price: Maximum price
- dietary: Comma-separated (halal,vegan)
- stock_type: direct|hub|both
- search: Search query
- sort: popular|newest|price_low|price_high|rating

Response: 200 OK
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Chicken Samosas",
        "name_urdu": "چکن سموسے",
        "slug": "chicken-samosas",
        "price": 800,
        "original_price": 1000,
        "unit": "dozen",
        "rating_average": 4.5,
        "total_reviews": 45,
        "primary_image": "https://...",
        "seller": {
          "id": "uuid",
          "business_name": "Ammi's Kitchen",
          "rating": 4.7,
          "is_verified": true
        },
        "stock": {
          "direct": 10,
          "hub": 25
        },
        "delivery_time": {
          "direct": "24 hours",
          "hub": "2-4 hours"
        },
        "badges": ["top_rated", "fast_delivery"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "total_pages": 8
    }
  }
}
```

### 14. Get Product Details
```http
GET /products/:slug
or
GET /products/:id

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Chicken Samosas",
    "name_urdu": "چکن سموسے",
    "description": "Delicious crispy chicken samosas...",
    "price": 800,
    "original_price": 1000,
    "discount_percentage": 20,
    "unit": "dozen",
    "weight_grams": 600,
    "ingredients": "Chicken, flour, spices...",
    "allergens": "Gluten",
    "dietary_info": ["halal"],
    "storage_days": 30,
    "heating_instructions": "Preheat oven to 180°C...",
    "min_order_quantity": 1,
    "max_order_quantity": 10,
    "stock": {
      "direct": {
        "available": 10,
        "type": "seller_home"
      },
      "hub": {
        "available": 25,
        "locations": ["DHA_KHI", "GULSHAN_KHI"]
      }
    },
    "images": [
      {
        "url": "https://...",
        "is_primary": true
      }
    ],
    "seller": {
      "id": "uuid",
      "business_name": "Ammi's Kitchen",
      "rating": 4.7,
      "total_orders": 250,
      "is_verified": true,
      "badges": ["top_rated"],
      "response_time": "Within 2 hours"
    },
    "rating_average": 4.5,
    "total_reviews": 45,
    "rating_breakdown": {
      "5": 30,
      "4": 10,
      "3": 3,
      "2": 1,
      "1": 1
    },
    "reviews": [ /* top 3 reviews */ ],
    "related_products": [ /* similar products */ ]
  }
}
```

### 15. Search Products
```http
GET /products/search?q=samosa&city=Karachi

Response: 200 OK
{
  "success": true,
  "data": {
    "query": "samosa",
    "results": [ /* products */ ],
    "suggestions": ["samosas", "spring rolls", "pakoras"],
    "total": 25
  }
}
```

### 16. Get Categories
```http
GET /categories

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Frozen Parathas",
      "name_urdu": "منجمد پراٹھے",
      "slug": "frozen-parathas",
      "icon_url": "https://...",
      "product_count": 45,
      "subcategories": []
    }
  ]
}
```

---

## 🛒 Cart APIs

### 17. Get Cart
```http
GET /cart
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "product": {
          "id": "uuid",
          "name": "Chicken Samosas",
          "price": 800,
          "image": "https://..."
        },
        "seller": {
          "id": "uuid",
          "business_name": "Ammi's Kitchen"
        },
        "quantity": 2,
        "stock_type": "hub",
        "hub_id": "uuid",
        "subtotal": 1600
      }
    ],
    "summary": {
      "subtotal": 3200,
      "delivery_fee": 100,
      "discount": 0,
      "total": 3300,
      "total_items": 5,
      "total_sellers": 2
    }
  }
}
```

### 18. Add to Cart
```http
POST /cart/items
Authorization: Bearer <token>
Content-Type: application/json

{
  "product_id": "uuid",
  "quantity": 2,
  "stock_type": "hub",
  "hub_id": "uuid"
}

Response: 201 Created
{
  "success": true,
  "data": { /* cart item */ },
  "message": "Added to cart"
}
```

### 19. Update Cart Item
```http
PATCH /cart/items/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "quantity": 3
}

Response: 200 OK
{
  "success": true,
  "data": { /* updated cart item */ }
}
```

### 20. Remove from Cart
```http
DELETE /cart/items/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Item removed from cart"
}
```

### 21. Clear Cart
```http
DELETE /cart
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Cart cleared"
}
```

---

## 📦 Order APIs

### 22. Create Order
```http
POST /orders
Authorization: Bearer <token>
Content-Type: application/json

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

Response: 201 Created
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "FN202511120001",
      "total_amount": 3300,
      "payment_method": "jazzcash",
      "payment_status": "pending",
      "order_status": "pending",
      "items": [ /* order items */ ]
    },
    "payment": {
      "gateway": "jazzcash",
      "payment_url": "https://jazzcash.com/pay/...",
      "reference_id": "JC123456"
    }
  },
  "message": "Order created successfully"
}
```

### 23. Get My Orders
```http
GET /orders/me?status=pending&page=1&limit=10
Authorization: Bearer <token>

Query Parameters:
- status: pending|confirmed|delivered|cancelled
- page: Page number
- limit: Items per page

Response: 200 OK
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_number": "FN202511120001",
        "total_amount": 3300,
        "order_status": "in_transit",
        "payment_status": "paid",
        "created_at": "2025-11-12T10:00:00Z",
        "estimated_delivery": "2025-11-12T18:00:00Z",
        "items_count": 3,
        "sellers_count": 2
      }
    ],
    "pagination": { /* pagination */ }
  }
}
```

### 24. Get Order Details
```http
GET /orders/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "uuid",
    "order_number": "FN202511120001",
    "status": "in_transit",
    "payment_status": "paid",
    "items": [
      {
        "product_name": "Chicken Samosas",
        "product_image": "https://...",
        "seller_name": "Ammi's Kitchen",
        "quantity": 2,
        "unit_price": 800,
        "total_price": 1600,
        "status": "preparing"
      }
    ],
    "pricing": {
      "subtotal": 3200,
      "delivery_fee": 100,
      "discount": 0,
      "total": 3300
    },
    "delivery": {
      "type": "home_delivery",
      "address": "House 123, DHA Phase 5, Karachi",
      "slot_date": "2025-11-12",
      "slot_time": "evening",
      "estimated_at": "2025-11-12T18:00:00Z",
      "rider": {
        "name": "Hassan Ali",
        "phone": "+923001234567",
        "vehicle": "Bike"
      },
      "tracking_url": "https://..."
    },
    "timeline": [
      {
        "status": "pending",
        "timestamp": "2025-11-12T10:00:00Z"
      },
      {
        "status": "confirmed",
        "timestamp": "2025-11-12T10:15:00Z"
      }
    ]
  }
}
```

### 25. Track Order (Real-time)
```http
GET /orders/:id/track
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "order_status": "in_transit",
    "rider_location": {
      "latitude": 24.8607,
      "longitude": 67.0011,
      "updated_at": "2025-11-12T16:45:00Z"
    },
    "estimated_arrival": "2025-11-12T17:30:00Z",
    "distance_remaining_km": 2.5
  }
}
```

### 26. Cancel Order
```http
POST /orders/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Changed my mind"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "status": "cancelled",
    "refund_amount": 3300,
    "refund_status": "processing"
  },
  "message": "Order cancelled successfully"
}
```

---

## ⭐ Review APIs

### 27. Add Review
```http
POST /reviews
Authorization: Bearer <token>
Content-Type: multipart/form-data

order_id: uuid
order_item_id: uuid
product_rating: 5
seller_rating: 5
delivery_rating: 4
comment: "Excellent taste and quality!"
photos: <file1>, <file2>

Response: 201 Created
{
  "success": true,
  "data": { /* review */ },
  "message": "Review submitted successfully"
}
```

### 28. Get Product Reviews
```http
GET /products/:id/reviews?page=1&limit=10&rating=5

Response: 200 OK
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "customer_name": "Ahmed K.",
        "product_rating": 5,
        "comment": "Excellent!",
        "photos": ["https://..."],
        "is_verified_purchase": true,
        "created_at": "2025-11-10T10:00:00Z",
        "seller_response": "Thank you!",
        "helpful_count": 15
      }
    ],
    "summary": {
      "average_rating": 4.5,
      "total_reviews": 45,
      "rating_breakdown": {
        "5": 30,
        "4": 10,
        "3": 3,
        "2": 1,
        "1": 1
      }
    },
    "pagination": { /* pagination */ }
  }
}
```

---

## 🏬 Hub Center APIs

### 29. Get Hub Centers
```http
GET /hubs?city=Karachi

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "DHA Phase 5 Hub",
      "code": "DHA_KHI",
      "city": "Karachi",
      "area": "DHA Phase 5",
      "address": "Main Boulevard, DHA Phase 5",
      "coordinates": {
        "latitude": 24.8607,
        "longitude": 67.0011
      },
      "operating_hours": {
        "monday": {"open": "08:00", "close": "22:00"}
      },
      "status": "active",
      "available_products_count": 150
    }
  ]
}
```

### 30. Get Hub Inventory
```http
GET /hubs/:id/inventory?category=uuid&search=samosa

Response: 200 OK
{
  "success": true,
  "data": {
    "hub": { /* hub details */ },
    "inventory": [
      {
        "product": { /* product details */ },
        "quantity": 25,
        "expiry_date": "2025-12-15",
        "batch_number": "BATCH001"
      }
    ]
  }
}
```

---

## 💳 Payment APIs

### 31. Get Payment Methods
```http
GET /payments/methods
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "jazzcash",
      "name": "JazzCash",
      "icon": "https://...",
      "is_available": true
    },
    {
      "id": "easypaisa",
      "name": "EasyPaisa",
      "icon": "https://...",
      "is_available": true
    },
    {
      "id": "card",
      "name": "Credit/Debit Card",
      "icon": "https://...",
      "is_available": true
    },
    {
      "id": "cod",
      "name": "Cash on Delivery",
      "icon": "https://...",
      "is_available": true,
      "extra_fee": 50
    }
  ]
}
```

### 32. Process Payment
```http
POST /payments/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_id": "uuid",
  "payment_method": "jazzcash",
  "payment_details": {
    "account_number": "03001234567"
  }
}

Response: 200 OK
{
  "success": true,
  "data": {
    "payment_id": "uuid",
    "status": "pending",
    "redirect_url": "https://jazzcash.com/pay/...",
    "expires_at": "2025-11-12T10:30:00Z"
  }
}
```

### 33. Verify Payment
```http
POST /payments/:id/verify
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "payment_status": "completed",
    "order_status": "confirmed",
    "transaction_id": "JC123456789"
  }
}
```

### 34. Get Wallet Balance
```http
GET /wallet
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "balance": 1500.00,
    "currency": "PKR",
    "recent_transactions": [ /* transactions */ ]
  }
}
```

---

## 🎁 Promotion APIs

### 35. Validate Promotion Code
```http
POST /promotions/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "WELCOME10",
  "cart_total": 3200
}

Response: 200 OK
{
  "success": true,
  "data": {
    "code": "WELCOME10",
    "discount_type": "percentage",
    "discount_value": 10,
    "discount_amount": 320,
    "final_amount": 2880,
    "is_valid": true
  }
}
```

### 36. Get Available Promotions
```http
GET /promotions/available
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "code": "FIRSTORDER",
      "name": "First Order Discount",
      "description": "Get 15% off on your first order",
      "discount_type": "percentage",
      "discount_value": 15,
      "min_order_amount": 1000,
      "valid_until": "2025-12-31T23:59:59Z"
    }
  ]
}
```

---

## 🔔 Notification APIs

### 37. Get Notifications
```http
GET /notifications?page=1&limit=20&is_read=false
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "order_update",
        "title": "Order Delivered",
        "message": "Your order #FN202511120001 has been delivered",
        "data": {
          "order_id": "uuid"
        },
        "is_read": false,
        "created_at": "2025-11-12T17:00:00Z"
      }
    ],
    "unread_count": 5,
    "pagination": { /* pagination */ }
  }
}
```

### 38. Mark Notification as Read
```http
PATCH /notifications/:id/read
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Notification marked as read"
}
```

### 39. Mark All Notifications as Read
```http
PATCH /notifications/read-all
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

## 🛟 Support APIs

### 40. Create Support Ticket
```http
POST /support/tickets
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_id": "uuid",
  "category": "order_issue",
  "subject": "Product quality issue",
  "description": "The samosas were not properly frozen...",
  "priority": "high"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "ticket_number": "TKT202511120001",
    "status": "open",
    "estimated_response": "Within 2 hours"
  }
}
```

### 41. Get My Tickets
```http
GET /support/tickets?status=open
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [ /* tickets */ ]
}
```

---

## 👨‍🍳 Seller APIs (Requires seller role)

### 42. Register as Seller
```http
POST /sellers/register
Authorization: Bearer <token>
Content-Type: multipart/form-data

business_name: Ammi's Kitchen
business_name_urdu: امی کی کچن
description: Homemade frozen food...
kitchen_video: <video_file>
cover_image: <image_file>
cnic_front: <image_file>
cnic_back: <image_file>
kitchen_photos: <image_file1>, <image_file2>

Response: 201 Created
{
  "success": true,
  "data": {
    "seller_id": "uuid",
    "verification_status": "pending",
    "message": "Application submitted for review"
  }
}
```

### 43. Get Seller Dashboard
```http
GET /sellers/me/dashboard
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "overview": {
      "total_products": 15,
      "active_orders": 8,
      "pending_orders": 3,
      "total_earnings": 45000,
      "pending_payout": 12000,
      "rating": 4.7,
      "total_reviews": 120
    },
    "recent_orders": [ /* orders */ ],
    "low_stock_products": [ /* products */ ],
    "pending_reviews": [ /* reviews */ ]
  }
}
```

### 44. Add Product
```http
POST /sellers/me/products
Authorization: Bearer <token>
Content-Type: multipart/form-data

name: Chicken Samosas
name_urdu: چکن سموسے
description: Delicious crispy...
category_id: uuid
price: 800
unit: dozen
stock_quantity: 50
stock_type: both
ingredients: Chicken, flour...
images: <file1>, <file2>, <file3>

Response: 201 Created
{
  "success": true,
  "data": {
    "product_id": "uuid",
    "approval_status": "pending",
    "message": "Product submitted for approval"
  }
}
```

### 45. Update Product
```http
PATCH /sellers/me/products/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "price": 850,
  "stock_quantity": 30
}

Response: 200 OK
{
  "success": true,
  "data": { /* updated product */ }
}
```

### 46. Get Seller Orders
```http
GET /sellers/me/orders?status=pending&page=1
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "orders": [ /* order items for this seller */ ]
  }
}
```

### 47. Update Order Item Status
```http
PATCH /sellers/me/orders/:orderItemId/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "preparing",
  "notes": "Started preparation"
}

Response: 200 OK
{
  "success": true,
  "message": "Order status updated"
}
```

### 48. Get Seller Analytics
```http
GET /sellers/me/analytics?period=7d
Authorization: Bearer <token>

Query Parameters:
- period: 7d|30d|90d|1y

Response: 200 OK
{
  "success": true,
  "data": {
    "revenue": {
      "total": 45000,
      "graph": [ /* daily revenue */ ]
    },
    "orders": {
      "total": 150,
      "completed": 140,
      "cancelled": 10
    },
    "top_products": [ /* best sellers */ ],
    "customer_demographics": { /* stats */ }
  }
}
```

### 49. Request Payout
```http
POST /sellers/me/payouts
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 12000,
  "payout_method": "jazzcash",
  "account_number": "03001234567"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "payout_id": "uuid",
    "status": "pending",
    "estimated_processing": "2-3 business days"
  }
}
```

---

## 📊 Admin APIs (Requires admin role)

### 50. Get Platform Analytics
```http
GET /admin/analytics?period=30d
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "gmv": 500000,
    "total_orders": 1200,
    "active_users": 5000,
    "active_sellers": 150,
    "commission_earned": 75000
  }
}
```

### 51. Get Pending Sellers
```http
GET /admin/sellers/pending
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [ /* pending seller applications */ ]
}
```

### 52. Approve/Reject Seller
```http
POST /admin/sellers/:id/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "approved": true,
  "notes": "All documents verified"
}

Response: 200 OK
{
  "success": true,
  "message": "Seller approved successfully"
}
```

### 53. Moderate Product
```http
POST /admin/products/:id/moderate
Authorization: Bearer <token>
Content-Type: application/json

{
  "approved": false,
  "reason": "Images quality not acceptable"
}

Response: 200 OK
{
  "success": true,
  "message": "Product moderated"
}
```

---

## 🔌 WebSocket Events

### Connection
```javascript
const socket = io('wss://api.frozennuray.com', {
  auth: {
    token: 'Bearer <access_token>'
  }
});
```

### Events

#### 1. Order Status Update
```javascript
socket.on('order:status', (data) => {
  // data: { order_id, status, timestamp }
});
```

#### 2. New Order (Seller)
```javascript
socket.on('order:new', (data) => {
  // data: { order_id, customer, items, total }
});
```

#### 3. Inventory Update
```javascript
socket.on('inventory:update', (data) => {
  // data: { product_id, quantity, location }
});
```

#### 4. Rider Location Update
```javascript
socket.on('rider:location', (data) => {
  // data: { order_id, latitude, longitude, eta }
});
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_001` | Invalid credentials |
| `AUTH_002` | Token expired |
| `AUTH_003` | OTP invalid or expired |
| `USER_001` | User not found |
| `USER_002` | Phone already registered |
| `PRODUCT_001` | Product not found |
| `PRODUCT_002` | Insufficient stock |
| `ORDER_001` | Order not found |
| `ORDER_002` | Order cannot be cancelled |
| `PAYMENT_001` | Payment failed |
| `PAYMENT_002` | Invalid payment method |
| `PROMO_001` | Invalid promo code |
| `PROMO_002` | Promo code expired |
| `VALIDATION_001` | Invalid input data |

---

## Rate Limiting

- **General APIs**: 100 requests per minute per IP
- **Authentication**: 10 requests per minute per IP
- **Search**: 30 requests per minute per user
- **Write operations**: 30 requests per minute per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1636732800
```

## Pagination

All list endpoints support pagination using offset-based method:

**Query Parameters:**
- `page`: Page number (default: 1, minimum: 1)
- `limit`: Items per page (default: 20, maximum: 100)

**Response Format:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "total_pages": 8,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

## Health Check

### Health Check Endpoint
```http
GET /health

Response: 200 OK
{
  "status": "ok",
  "timestamp": "2025-11-12T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "payment_gateways": {
      "jazzcash": "healthy",
      "easypaisa": "healthy",
      "stripe": "healthy"
    }
  },
  "version": "1.0.0"
}
```

## Idempotency

Payment and order creation endpoints support idempotency to prevent duplicate operations.

**Header:**
```
Idempotency-Key: <unique-key>
```

**Behavior:**
- Same key within 24 hours returns same response
- Key must be unique per operation
- Recommended: UUID v4

**Example:**
```http
POST /orders
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "items": [...],
  "payment_method": "jazzcash"
}

# First request: Creates order, returns 201
# Duplicate request (same key): Returns 200 with same order data
```

## Error Retry Logic

### Automatic Retries

**Payment Processing:**
- Automatic retry: 3 attempts
- Retry delays: 1s, 5s, 30s
- After 3 failures: Manual retry required

**External API Calls:**
- Automatic retry: 2 attempts
- Retry delays: 1s, 5s
- Timeout: 10 seconds per attempt

### Manual Retry

**Retry Failed Payment:**
```http
POST /payments/:id/retry
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "payment_id": "uuid",
    "status": "pending",
    "retry_count": 1
  }
}
```

## Webhooks

### Webhook Security

All webhooks include HMAC-SHA256 signature for verification:

**Header:**
```
X-Webhook-Signature: sha256=<signature>
X-Webhook-Timestamp: 1636732800
```

**Verification Process:**
1. Concatenate: `timestamp` + `.` + `request_body`
2. Calculate HMAC-SHA256 with webhook secret
3. Compare with `X-Webhook-Signature` header
4. Verify timestamp (within 5 minutes)

**Example (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(timestamp, body, signature, secret) {
  const payload = `${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Webhook Events

### Payment Confirmation
```http
POST <your_webhook_url>
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...
X-Webhook-Timestamp: 1636732800

{
  "event": "payment.success",
  "data": {
    "order_id": "uuid",
    "payment_id": "uuid",
    "amount": 3300,
    "timestamp": "2025-11-12T10:30:00Z"
  }
}
```

**Response Required:**
- Return 200 OK within 5 seconds
- If timeout or error: Webhook will be retried (3 attempts)

### Order Status Change
```http
POST <your_webhook_url>
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...
X-Webhook-Timestamp: 1636732800

{
  "event": "order.status_changed",
  "data": {
    "order_id": "uuid",
    "old_status": "preparing",
    "new_status": "ready",
    "timestamp": "2025-11-12T10:30:00Z"
  }
}
```

### Available Webhook Events

- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed
- `payment.refunded` - Payment refunded
- `order.status_changed` - Order status updated
- `order.cancelled` - Order cancelled
- `order.delivered` - Order delivered
- `seller.payout.completed` - Seller payout processed
```
