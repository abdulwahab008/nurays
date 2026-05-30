# Seller Orders API Fix

## Issue Summary

The seller orders page was returning a **400 Bad Request** error when trying to load orders. The error showed:
```
/api/v1/seller/orders?page=1&limit=20&status=:1
```

## Root Cause

1. **Invalid Query Parameter**: The frontend was using the `status` parameter with values like `'confirmed'` and `'delivered'`, but according to the backend validator:
   - `status` only accepts: `'pending', 'preparing', 'ready', 'dispatched', 'cancelled'` (for order item status)
   - `orderStatus` accepts: `'pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'completed', 'cancelled'` (for order status)

2. **Empty String Issue**: When filter was set to `'all'`, the code was sending `status=` (empty string), which could cause validation errors.

3. **Wrong Parameter**: The frontend filter options included `'confirmed'` and `'delivered'` which are order statuses, not order item statuses, so they should use the `orderStatus` parameter.

## Fix Applied

Updated `frontend-web/app/sellers/orders/page.tsx` to:
- Use `orderStatus` parameter instead of `status` for filtering (since it supports all the filter values)
- Only include the `orderStatus` parameter when filter is not `'all'`
- Use `URLSearchParams` to properly build the query string

### Before:
```typescript
const response = await apiClient.get(`/seller/orders?page=${page}&limit=20&status=${filter !== 'all' ? filter : ''}`);
```

### After:
```typescript
const params = new URLSearchParams({
  page: page.toString(),
  limit: '20',
});

if (filter !== 'all') {
  params.append('orderStatus', filter);
}

const response = await apiClient.get(`/seller/orders?${params.toString()}`);
```

## How to Test

### 1. Frontend Testing (Browser)

1. **Start the backend server**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the frontend server**:
   ```bash
   cd frontend-web
   npm run dev
   ```

3. **Login as a seller**:
   - Navigate to `http://localhost:3000/login`
   - Login with seller credentials

4. **Test the orders page**:
   - Navigate to `http://localhost:3000/sellers/orders`
   - The page should load without errors
   - Try clicking different filter buttons:
     - "All" - should show all orders
     - "Pending" - should filter by pending orders
     - "Confirmed" - should filter by confirmed orders
     - "Preparing" - should filter by preparing orders
     - "Ready" - should filter by ready orders
     - "Dispatched" - should filter by dispatched orders
     - "Delivered" - should filter by delivered orders
     - "Cancelled" - should filter by cancelled orders

5. **Check browser console**:
   - Open Developer Tools (F12)
   - Check the Network tab
   - Verify the API requests are successful (status 200)
   - Verify the query parameters are correct

### 2. Backend API Testing (cURL)

#### Get All Seller Orders
```bash
curl "http://localhost:3001/api/v1/seller/orders?page=1&limit=20" \
  -H "Authorization: Bearer <seller-token>"
```

#### Get Orders by Status (All - no filter)
```bash
curl "http://localhost:3001/api/v1/seller/orders?page=1&limit=20" \
  -H "Authorization: Bearer <seller-token>"
```

#### Get Orders by Order Status (Confirmed)
```bash
curl "http://localhost:3001/api/v1/seller/orders?page=1&limit=20&orderStatus=confirmed" \
  -H "Authorization: Bearer <seller-token>"
```

#### Get Orders by Order Status (Delivered)
```bash
curl "http://localhost:3001/api/v1/seller/orders?page=1&limit=20&orderStatus=delivered" \
  -H "Authorization: Bearer <seller-token>"
```

#### Get Orders by Order Item Status (Preparing)
```bash
curl "http://localhost:3001/api/v1/seller/orders?page=1&limit=20&status=preparing" \
  -H "Authorization: Bearer <seller-token>"
```

### 3. Testing with Postman/Insomnia

1. **Create a new GET request**:
   - URL: `http://localhost:3001/api/v1/seller/orders`
   - Method: GET

2. **Add Headers**:
   - `Authorization: Bearer <your-seller-token>`
   - `Content-Type: application/json`

3. **Add Query Parameters**:
   - `page`: 1
   - `limit`: 20
   - `orderStatus`: confirmed (optional, test different values)

4. **Send the request** and verify:
   - Status code: 200
   - Response contains `success: true`
   - Response contains `data.orders` array
   - Response contains `data.pagination` object

### 4. Expected Response Format

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "order-item-uuid",
        "orderId": "order-uuid",
        "orderNumber": "FN202511120001",
        "productName": "Chicken Samosas",
        "quantity": 2,
        "unitPrice": 800,
        "totalPrice": 1600,
        "status": "pending",
        "orderStatus": "confirmed",
        "createdAt": "2025-11-12T10:00:00Z",
        "customerName": "John Doe"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

### 5. Error Scenarios to Test

1. **Invalid orderStatus value**:
   ```bash
   curl "http://localhost:3001/api/v1/seller/orders?orderStatus=invalid" \
     -H "Authorization: Bearer <seller-token>"
   ```
   Expected: 400 Bad Request with validation error

2. **Invalid status value**:
   ```bash
   curl "http://localhost:3001/api/v1/seller/orders?status=invalid" \
     -H "Authorization: Bearer <seller-token>"
   ```
   Expected: 400 Bad Request with validation error

3. **Missing authentication**:
   ```bash
   curl "http://localhost:3001/api/v1/seller/orders"
   ```
   Expected: 401 Unauthorized

4. **Non-seller user**:
   ```bash
   curl "http://localhost:3001/api/v1/seller/orders" \
     -H "Authorization: Bearer <customer-token>"
   ```
   Expected: 403 Forbidden

## Valid Query Parameters

### `orderStatus` (for filtering by order status):
- `pending`
- `confirmed`
- `preparing`
- `ready`
- `dispatched`
- `in_transit`
- `delivered`
- `completed`
- `cancelled`

### `status` (for filtering by order item status):
- `pending`
- `preparing`
- `ready`
- `dispatched`
- `cancelled`

### Other Parameters:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `dateFrom`: YYYY-MM-DD format
- `dateTo`: YYYY-MM-DD format

## Files Modified

- `frontend-web/app/sellers/orders/page.tsx` - Fixed query parameter construction

## Verification Checklist

- [x] Frontend loads without 400 errors
- [x] All filter buttons work correctly
- [x] Query parameters are properly formatted
- [x] No empty string parameters sent
- [x] Uses `orderStatus` for order status filters
- [x] Backend validation accepts the parameters
- [x] Pagination works correctly

## Notes

- The frontend now uses `orderStatus` parameter for all filters since it supports all the filter values used in the UI
- When filter is `'all'`, no status parameter is sent, which is the correct behavior
- The fix ensures proper URL encoding and query string construction

