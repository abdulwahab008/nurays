# Cart APIs - Complete! ✅

## What Has Been Built

### ✅ Cart Management APIs

1. **Get Cart** (Customer)
   - Get cart with all items
   - Includes product details, seller info, hub info
   - Calculates cart summary (subtotal, total items, total sellers)
   - Price snapshots for each item

2. **Add to Cart** (Customer)
   - Add product to cart
   - Stock validation
   - Automatic quantity update if item exists
   - Price snapshot stored
   - Supports different stock types (direct, hub, both)

3. **Update Cart Item** (Customer)
   - Update quantity
   - Update stock type
   - Update hub selection
   - Auto-removes if quantity is 0
   - Stock validation on update

4. **Remove from Cart** (Customer)
   - Remove specific item from cart

5. **Clear Cart** (Customer)
   - Remove all items from cart

6. **Validate Cart** (Customer)
   - Validates cart before checkout
   - Checks product availability
   - Checks stock availability
   - Checks price changes
   - Returns validation errors if any

## API Endpoints

### Cart Endpoints (All require authentication)

1. **Get Cart**
   ```
   GET /api/v1/cart
   Authorization: Bearer <token>
   ```

2. **Add to Cart**
   ```
   POST /api/v1/cart/items
   Authorization: Bearer <token>
   Content-Type: application/json
   
   {
     "productId": "uuid",
     "quantity": 2,
     "stockType": "hub",
     "hubId": "uuid"
   }
   ```

3. **Update Cart Item**
   ```
   PATCH /api/v1/cart/items/:id
   Authorization: Bearer <token>
   Content-Type: application/json
   
   {
     "quantity": 3,
     "stockType": "direct"
   }
   ```

4. **Remove from Cart**
   ```
   DELETE /api/v1/cart/items/:id
   Authorization: Bearer <token>
   ```

5. **Clear Cart**
   ```
   DELETE /api/v1/cart
   Authorization: Bearer <token>
   ```

6. **Validate Cart**
   ```
   GET /api/v1/cart/validate
   Authorization: Bearer <token>
   ```

## Features

### ✅ Cart Features

- **Automatic Cart Creation**: Cart is created automatically for user
- **Price Snapshot**: Stores product price at time of adding to cart
- **Stock Validation**: Validates stock before adding/updating
- **Quantity Management**: Automatically updates quantity if item exists
- **Stock Type Support**: Supports direct, hub, and both stock types
- **Hub Selection**: Can specify hub for hub-based orders
- **Cart Summary**: Calculates subtotal, total items, total sellers
- **Cart Validation**: Validates cart before checkout
- **Price Change Detection**: Detects if product price changed

### ✅ Response Format

**Get Cart Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "product": {
          "id": "uuid",
          "name": "Chicken Samosas",
          "nameUrdu": "چکن سموسے",
          "slug": "chicken-samosas",
          "price": 800,
          "image": "https://..."
        },
        "seller": {
          "id": "uuid",
          "businessName": "Ammi's Kitchen",
          "isVerified": true
        },
        "quantity": 2,
        "stockType": "hub",
        "hub": {
          "id": "uuid",
          "name": "DHA Hub",
          "area": "DHA Phase 5"
        },
        "subtotal": 1600,
        "priceSnapshot": 800
      }
    ],
    "summary": {
      "subtotal": 3200,
      "deliveryFee": 0,
      "discount": 0,
      "total": 3200,
      "totalItems": 5,
      "totalSellers": 2
    }
  }
}
```

## Files Created

```
backend/src/
├── services/
│   └── cart.service.ts       # Cart business logic
├── controllers/
│   └── cart.controller.ts   # Cart controllers
├── routes/
│   └── cart.routes.ts       # Cart routes
└── validators/
    └── cart.validator.ts    # Cart validation schemas
```

## Testing Examples

### Get Cart
```bash
curl "http://localhost:3001/api/v1/cart" \
  -H "Authorization: Bearer <token>"
```

### Add to Cart
```bash
curl -X POST http://localhost:3001/api/v1/cart/items \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<product-uuid>",
    "quantity": 2,
    "stockType": "hub",
    "hubId": "<hub-uuid>"
  }'
```

### Update Cart Item
```bash
curl -X PATCH http://localhost:3001/api/v1/cart/items/<item-id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3}'
```

### Remove from Cart
```bash
curl -X DELETE http://localhost:3001/api/v1/cart/items/<item-id> \
  -H "Authorization: Bearer <token>"
```

### Clear Cart
```bash
curl -X DELETE http://localhost:3001/api/v1/cart \
  -H "Authorization: Bearer <token>"
```

### Validate Cart
```bash
curl "http://localhost:3001/api/v1/cart/validate" \
  -H "Authorization: Bearer <token>"
```

## Cart Behavior

### Adding Items
- If item with same product, stockType, and hubId exists, quantity is incremented
- If item doesn't exist, new cart item is created
- Stock is validated before adding
- Price snapshot is stored

### Updating Items
- Quantity can be updated (auto-removes if 0)
- Stock type can be changed
- Hub can be changed
- Stock is validated on update
- Price snapshot is updated

### Cart Persistence
- Cart is stored in database (not just Redis)
- Cart persists across sessions
- Each user has one cart
- Cart is created automatically on first use

## Security

- ✅ All endpoints require authentication
- ✅ Users can only access their own cart
- ✅ Cart ownership verification
- ✅ Input validation with Zod schemas
- ✅ Stock validation prevents overselling
- ✅ Price snapshot prevents price manipulation

## Status

**✅ Cart APIs are fully functional and ready for use!**

All endpoints are implemented with:
- Proper error handling
- Input validation
- Stock management
- Price snapshot
- Cart summary calculation
- Cart validation

The cart system is production-ready and integrates seamlessly with the order system!

