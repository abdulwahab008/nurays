# FrozenNuray Platform - Architecture Review & Required Updates

## Document Information
- **Version**: 1.0
- **Created**: November 2025
- **Purpose**: Identify issues and required updates in existing documentation

---

## Executive Summary

After comprehensive review of the existing architecture, API documentation, and database schema, and creation of new security, testing, and operations documentation, the following issues and updates have been identified:

**Critical Issues:** 5
**High Priority Updates:** 8
**Medium Priority Updates:** 12
**Documentation Gaps:** 6

---

## 1. CRITICAL ISSUES

### 1.1 Missing Cart Persistence Table

**Issue:** Cart data is only stored in Redis (in-memory), which means:
- Cart data lost on Redis restart
- No cart history
- Cannot recover abandoned carts
- Analytics limitations

**Current State:**
- Cart mentioned only in `user_activity_logs` table
- No `carts` or `cart_items` tables in DATABASE_SCHEMA.sql
- Architecture mentions "Cart Data" in Redis only

**Required Fix:**
Add cart persistence tables to database schema:

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    stock_type VARCHAR(20) CHECK (stock_type IN ('direct', 'hub')),
    hub_id UUID REFERENCES hub_centers(id) ON DELETE SET NULL,
    price_snapshot DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product_id ON cart_items(product_id);
```

**Files to Update:**
- `DATABASE_SCHEMA.sql` - Add tables
- `ARCHITECTURE.md` - Update data layer diagram
- `API_DOCUMENTATION.md` - Update cart APIs if needed

---

### 1.2 Missing Inventory Reservation System

**Issue:** No mechanism to prevent overselling when multiple users add same product to cart simultaneously.

**Current State:**
- No `inventory_reservations` table
- Stock checked at order creation, not cart addition
- Race condition possible

**Required Fix:**
Add inventory reservation system:

```sql
CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    reservation_type VARCHAR(20) NOT NULL CHECK (reservation_type IN ('cart', 'order')),
    reservation_id UUID NOT NULL, -- cart_id or order_id
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reservations_product ON inventory_reservations(product_id);
    INDEX idx_reservations_expires ON inventory_reservations(expires_at);
);
```

**Files to Update:**
- `DATABASE_SCHEMA.sql` - Add table
- `ARCHITECTURE.md` - Document reservation flow
- `API_DOCUMENTATION.md` - Document reservation endpoints

---

### 1.3 Missing Seller Payout Schedule Table

**Issue:** No way to configure seller payout preferences (day of week, minimum amount, method).

**Current State:**
- `seller_payouts` table exists but no schedule configuration
- Payout schedule mentioned in system_settings but not per-seller

**Required Fix:**
Add seller payout schedule table:

```sql
CREATE TABLE seller_payout_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    payout_day INT CHECK (payout_day BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
    payout_method VARCHAR(50) NOT NULL,
    minimum_payout_amount DECIMAL(10,2) DEFAULT 1000.00,
    auto_payout BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seller_id)
);
```

**Files to Update:**
- `DATABASE_SCHEMA.sql` - Add table
- `API_DOCUMENTATION.md` - Add payout schedule endpoints

---

### 1.4 Missing Message Queue Architecture

**Issue:** Architecture mentions Bull (Redis-based queue) but doesn't detail:
- What jobs are queued
- Queue configuration
- Retry logic
- Dead letter queues

**Current State:**
- Bull mentioned in tech stack
- No detailed architecture for async jobs
- No queue management strategy

**Required Fix:**
Add to ARCHITECTURE.md:

```markdown
### Message Queue System (Bull)

**Queues:**
- email-queue: Email sending
- sms-queue: SMS/OTP sending
- image-processing: Image optimization
- notification-queue: Push notifications
- report-generation: Analytics reports
- payout-queue: Seller payouts

**Configuration:**
- Retry attempts: 3
- Retry delay: Exponential backoff
- Dead letter queue: Failed jobs after retries
- Concurrency: 5 workers per queue
```

**Files to Update:**
- `ARCHITECTURE.md` - Add message queue section

---

### 1.5 Missing Audit Logging Table

**Issue:** Security document mentions audit logging but no dedicated audit table in schema.

**Current State:**
- Security plan requires audit logging
- No `audit_logs` table in schema
- Only `user_activity_logs` exists (different purpose)

**Required Fix:**
Add audit logging table:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'user_login', 'order_created', 'payment_processed'
    entity_type VARCHAR(50), -- 'user', 'order', 'payment'
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_data JSONB,
    response_status INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

**Files to Update:**
- `DATABASE_SCHEMA.sql` - Add table
- `ARCHITECTURE.md` - Document audit logging
- `SECURITY_AND_COMPLIANCE.md` - Reference audit table

---

## 2. HIGH PRIORITY UPDATES

### 2.1 API Documentation - Missing Webhook Security

**Issue:** API docs mention webhooks but don't document signature verification.

**Required Update:**
Add to `API_DOCUMENTATION.md`:

```markdown
## Webhook Security

All webhooks include HMAC-SHA256 signature in header:
```
X-Webhook-Signature: sha256=<signature>
```

Verification:
1. Concatenate request body + timestamp
2. Calculate HMAC-SHA256 with webhook secret
3. Compare with signature header
```

---

### 2.2 API Documentation - Missing Pagination Details

**Issue:** API docs mention pagination but don't specify:
- Cursor vs offset-based
- Default page size
- Maximum page size

**Required Update:**
Add pagination specification:
- Type: Offset-based (page, limit)
- Default: page=1, limit=20
- Maximum: limit=100

---

### 2.3 Architecture - Missing Caching Strategy Details

**Issue:** Architecture mentions Redis cache but doesn't detail:
- What's cached
- Cache TTLs
- Cache invalidation strategy

**Required Update:**
Add caching strategy section:
- Product listings: 5 minutes
- User sessions: 24 hours
- Search results: 2 minutes
- Categories: 1 hour

---

### 2.4 Architecture - Missing Monitoring Details

**Issue:** Architecture mentions monitoring but doesn't detail:
- What metrics are tracked
- Alert thresholds
- Dashboard setup

**Required Update:**
Add monitoring section with:
- Application metrics (response time, error rate)
- Infrastructure metrics (CPU, memory, disk)
- Business metrics (orders, revenue)
- Alert configuration

---

### 2.5 Database Schema - Missing Indexes

**Issue:** Some frequently queried columns missing indexes.

**Required Updates:**
```sql
-- Add missing indexes
CREATE INDEX idx_orders_delivery_slot_date ON orders(delivery_slot_date);
CREATE INDEX idx_orders_estimated_delivery_at ON orders(estimated_delivery_at);
CREATE INDEX idx_hub_inventory_status ON hub_inventory(status);
CREATE INDEX idx_reviews_is_approved ON reviews(is_approved) WHERE is_approved = TRUE;
CREATE INDEX idx_promotions_code_active ON promotions(code, is_active) WHERE is_active = TRUE;
```

---

### 2.6 API Documentation - Missing Error Retry Logic

**Issue:** Payment APIs don't document retry logic for failed payments.

**Required Update:**
Add retry logic documentation:
- Automatic retry: 3 attempts
- Retry delay: 1s, 5s, 30s
- Manual retry: Via API endpoint

---

### 2.7 Architecture - Missing Rate Limiting Details

**Issue:** Architecture mentions rate limiting but doesn't detail implementation.

**Required Update:**
Add rate limiting section:
- Redis-based rate limiting
- Per-IP and per-user limits
- Sliding window algorithm
- Rate limit headers in responses

---

### 2.8 Database Schema - Missing Soft Delete Support

**Issue:** Some tables should support soft deletes for audit trail.

**Required Update:**
Add `deleted_at` column to critical tables:
- users
- sellers
- products
- orders (already has status, but deleted_at useful)

---

## 3. MEDIUM PRIORITY UPDATES

### 3.1 API Documentation - Add Request/Response Examples for Edge Cases

**Issue:** API docs only show happy path examples.

**Required Update:**
Add examples for:
- Out of stock products
- Invalid promo codes
- Payment failures
- Order cancellation after payment

---

### 3.2 Architecture - Document WebSocket Events More Detail

**Issue:** WebSocket events mentioned but not fully documented.

**Required Update:**
Add complete WebSocket event documentation:
- Connection authentication
- Room joining
- Event types and payloads
- Error handling
- Reconnection logic

---

### 3.3 Database Schema - Add Full-Text Search Indexes

**Issue:** Product search mentioned but no FTS indexes.

**Required Update:**
```sql
-- Add full-text search indexes
CREATE INDEX idx_products_name_fts ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_description_fts ON products USING gin(to_tsvector('english', description));
CREATE INDEX idx_sellers_business_name_fts ON sellers USING gin(to_tsvector('english', business_name));
```

---

### 3.4 API Documentation - Add API Versioning Strategy

**Issue:** API versioning mentioned but strategy not detailed.

**Required Update:**
Document:
- URL-based versioning (/api/v1, /api/v2)
- Backward compatibility policy (6 months)
- Deprecation process (3 months notice)
- Version negotiation

---

### 3.5 Architecture - Add CDN Configuration Details

**Issue:** CDN mentioned but configuration not detailed.

**Required Update:**
Add CDN section:
- Cloudflare configuration
- Cache rules
- SSL/TLS settings
- DDoS protection

---

### 3.6 Database Schema - Add Data Archival Strategy

**Issue:** No archival tables for old data.

**Required Update:**
Add archival tables:
- orders_archive (for orders > 1 year old)
- reviews_archive
- audit_logs_archive

---

### 3.7 API Documentation - Add Idempotency Keys

**Issue:** Payment APIs should support idempotency.

**Required Update:**
Document idempotency:
- Idempotency-Key header
- 24-hour idempotency window
- Duplicate request handling

---

### 3.8 Architecture - Document Backup Strategy

**Issue:** Backup mentioned but strategy not detailed.

**Required Update:**
Add backup section:
- Database: Daily automated, 30-day retention
- Files: Weekly to S3
- Configuration: Git repository
- Recovery procedures

---

### 3.9 Database Schema - Add Constraints for Data Integrity

**Issue:** Some missing check constraints.

**Required Update:**
```sql
-- Add constraints
ALTER TABLE orders ADD CONSTRAINT check_total_positive CHECK (total_amount > 0);
ALTER TABLE order_items ADD CONSTRAINT check_quantity_positive CHECK (quantity > 0);
ALTER TABLE products ADD CONSTRAINT check_price_positive CHECK (price > 0);
```

---

### 3.10 API Documentation - Add API Health Check Endpoint

**Issue:** Health check endpoint not documented.

**Required Update:**
Add health check endpoint:
```
GET /health
Response: { "status": "ok", "timestamp": "...", "services": {...} }
```

---

### 3.11 Architecture - Document Load Balancing Strategy

**Issue:** Load balancing mentioned but strategy not detailed.

**Required Update:**
Add load balancing section:
- Algorithm: Round-robin with health checks
- Session affinity: Not required (stateless)
- SSL termination: At load balancer

---

### 3.12 Database Schema - Add Materialized Views for Analytics

**Issue:** Analytics queries might be slow.

**Required Update:**
Add materialized views:
- daily_order_stats
- seller_performance_summary
- product_popularity

---

## 4. DOCUMENTATION GAPS

### 4.1 Missing API Integration Guide

**Status:** ✅ Created (`docs/API_INTEGRATION_GUIDE.md`)

### 4.2 Missing Operations Manual

**Status:** ⏳ To be created

### 4.3 Missing Disaster Recovery Plan

**Status:** ⏳ To be created

### 4.4 Missing Business Continuity Plan

**Status:** ⏳ To be created

### 4.5 Missing Performance Optimization Guide

**Status:** ⏳ Can be added to Architecture doc

### 4.6 Missing Troubleshooting Guide

**Status:** ⏳ Can be added to Operations Manual

---

## 5. INCONSISTENCIES FOUND

### 5.1 OTP Expiry Time

**Issue:** Different values mentioned:
- Security doc: 5 minutes
- Architecture: 5 minutes
- API docs: 300 seconds (consistent)

**Resolution:** All consistent at 5 minutes ✅

### 5.2 Commission Rate

**Issue:** Different values mentioned:
- PRD: 15%
- Database schema: 15.00 (default)
- Architecture: 15%

**Resolution:** All consistent at 15% ✅

### 5.3 Delivery Time

**Issue:** Hub delivery time mentioned as:
- PRD: 2-4 hours
- Architecture: 2-4 hours
- API docs: "2-4 hours"

**Resolution:** All consistent ✅

---

## 6. RECOMMENDED UPDATES SUMMARY

### Immediate (Before Development Starts):
1. ✅ Add cart persistence tables
2. ✅ Add inventory reservation system
3. ✅ Add audit logging table
4. ✅ Add seller payout schedule table
5. ✅ Update database schema with missing indexes

### High Priority (Phase 1):
1. Document message queue architecture
2. Add webhook security documentation
3. Add caching strategy details
4. Add monitoring details
5. Add rate limiting implementation

### Medium Priority (Phase 1-2):
1. Add full-text search indexes
2. Add API versioning strategy
3. Add CDN configuration
4. Add backup strategy details
5. Add health check endpoint

---

## 7. FILES TO UPDATE

### DATABASE_SCHEMA.sql
- [ ] Add `carts` table
- [ ] Add `cart_items` table
- [ ] Add `inventory_reservations` table
- [ ] Add `seller_payout_schedules` table
- [ ] Add `audit_logs` table
- [ ] Add missing indexes
- [ ] Add full-text search indexes
- [ ] Add check constraints
- [ ] Add soft delete support

### ARCHITECTURE.md
- [ ] Add message queue architecture section
- [ ] Add caching strategy details
- [ ] Add monitoring details
- [ ] Add rate limiting implementation
- [ ] Add CDN configuration
- [ ] Add backup strategy
- [ ] Add load balancing strategy
- [ ] Update data layer diagram (add cart tables)

### API_DOCUMENTATION.md
- [ ] Add webhook security documentation
- [ ] Add pagination specification
- [ ] Add error retry logic
- [ ] Add idempotency keys
- [ ] Add health check endpoint
- [ ] Add API versioning strategy
- [ ] Add edge case examples
- [ ] Add WebSocket event details

### SECURITY_AND_COMPLIANCE.md
- [ ] Reference audit_logs table
- [ ] Add rate limiting details
- [ ] Add monitoring details

---

## 8. NEXT STEPS

1. **Review this document** with tech lead
2. **Prioritize updates** based on development timeline
3. **Create tickets** for each update
4. **Update documentation** before starting development
5. **Validate** updates with team

---

## 9. VALIDATION CHECKLIST

After updates:
- [ ] All critical issues resolved
- [ ] Database schema complete
- [ ] Architecture document complete
- [ ] API documentation complete
- [ ] Security plan aligned
- [ ] No inconsistencies
- [ ] All cross-references valid

---

**End of Document**

