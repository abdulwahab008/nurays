-- ============================================
-- FrozenNuray Platform - Complete Database Schema
-- PostgreSQL 15+
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'seller', 'admin', 'hub_manager', 'rider')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'deleted')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    city VARCHAR(100),
    area VARCHAR(100),
    language_preference VARCHAR(10) DEFAULT 'en' CHECK (language_preference IN ('en', 'ur')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50), -- 'home', 'work', 'other'
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    area VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    landmark TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- 'registration', 'login', 'reset_password'
    attempts INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SELLERS
-- ============================================

CREATE TABLE sellers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    business_name_urdu VARCHAR(255),
    description TEXT,
    description_urdu TEXT,
    kitchen_video_url TEXT,
    cover_image_url TEXT,
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INT DEFAULT 0,
    total_orders INT DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0.00,
    commission_rate DECIMAL(5,2) DEFAULT 15.00, -- Percentage
    is_verified BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    featured_until TIMESTAMP,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    bank_account_name VARCHAR(255),
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(100),
    jazzcash_number VARCHAR(20),
    easypaisa_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seller_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- 'cnic', 'kitchen_photo', 'business_license'
    document_url TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seller_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    badge_type VARCHAR(50) NOT NULL, -- 'top_rated', 'customer_favorite', 'reliable', 'premium_quality'
    badge_name VARCHAR(100) NOT NULL,
    badge_icon TEXT,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PRODUCTS & CATEGORIES
-- ============================================

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    name_urdu VARCHAR(100),
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    name_urdu VARCHAR(255),
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    description_urdu TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2), -- For discounts
    unit VARCHAR(50) NOT NULL, -- 'piece', 'kg', 'dozen', 'pack'
    unit_urdu VARCHAR(50),
    weight_grams INT,
    ingredients TEXT,
    allergens TEXT,
    dietary_info TEXT[], -- ['halal', 'vegan', 'gluten_free']
    storage_days INT DEFAULT 30, -- How long it stays good frozen
    heating_instructions TEXT,
    heating_instructions_urdu TEXT,
    min_order_quantity INT DEFAULT 1,
    max_order_quantity INT,
    stock_quantity INT DEFAULT 0,
    stock_type VARCHAR(20) DEFAULT 'direct' CHECK (stock_type IN ('direct', 'hub', 'both')),
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INT DEFAULT 0,
    total_orders INT DEFAULT 0,
    views_count INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, tag)
);

-- ============================================
-- HUB CENTERS (Micro-Fulfillment)
-- ============================================

CREATE TABLE hub_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL, -- 'DHA_KHI', 'GULSHAN_KHI'
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    capacity_cubic_feet INT NOT NULL,
    current_utilization DECIMAL(5,2) DEFAULT 0.00, -- Percentage
    freezer_units INT DEFAULT 1,
    temperature_celsius DECIMAL(4,2),
    operating_hours JSONB, -- {"monday": {"open": "08:00", "close": "22:00"}, ...}
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    contact_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hub_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hub_id UUID REFERENCES hub_centers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0,
    batch_number VARCHAR(50),
    manufactured_date DATE,
    expiry_date DATE NOT NULL,
    storage_unit VARCHAR(20), -- 'A1', 'B2' - Physical location in freezer
    barcode VARCHAR(100),
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'expired', 'damaged')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hub_id, product_id, batch_number)
);

CREATE TABLE hub_inventory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hub_inventory_id UUID REFERENCES hub_inventory(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'stock_in', 'stock_out', 'adjustment', 'expired'
    quantity_change INT NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    reason TEXT,
    performed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hub_temperature_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hub_id UUID REFERENCES hub_centers(id) ON DELETE CASCADE,
    temperature_celsius DECIMAL(4,2) NOT NULL,
    freezer_unit INT,
    is_alert BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ORDERS
-- ============================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Pricing
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Payment
    payment_method VARCHAR(50) NOT NULL, -- 'jazzcash', 'easypaisa', 'card', 'cod', 'wallet'
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_transaction_id VARCHAR(255),
    paid_at TIMESTAMP,
    
    -- Delivery
    delivery_type VARCHAR(20) NOT NULL CHECK (delivery_type IN ('home_delivery', 'hub_pickup', 'self_pickup')),
    delivery_address_id UUID REFERENCES user_addresses(id) ON DELETE SET NULL,
    delivery_address_snapshot JSONB, -- Store full address in case deleted later
    hub_id UUID REFERENCES hub_centers(id) ON DELETE SET NULL,
    delivery_slot_date DATE,
    delivery_slot_time VARCHAR(20), -- 'morning', 'afternoon', 'evening'
    delivery_instructions TEXT,
    
    -- Status
    order_status VARCHAR(20) DEFAULT 'pending' CHECK (
        order_status IN ('pending', 'confirmed', 'preparing', 'ready', 'dispatched', 
                        'in_transit', 'delivered', 'completed', 'cancelled', 'refunded')
    ),
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20), -- 'customer', 'seller', 'admin'
    
    -- Tracking
    estimated_delivery_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
    
    -- Product snapshot (in case product deleted/changed)
    product_name VARCHAR(255) NOT NULL,
    product_image TEXT,
    
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Commission
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    seller_payout DECIMAL(10,2) NOT NULL,
    
    -- Fulfillment
    fulfillment_type VARCHAR(20) CHECK (fulfillment_type IN ('direct', 'hub')),
    hub_id UUID REFERENCES hub_centers(id) ON DELETE SET NULL,
    
    -- Status specific to this item
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'accepted', 'rejected', 'preparing', 'ready', 'delivered', 'cancelled')
    ),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DELIVERIES & RIDERS
-- ============================================

CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(50), -- 'bike', 'car', 'bicycle'
    vehicle_number VARCHAR(50),
    license_number VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    hub_id UUID REFERENCES hub_centers(id) ON DELETE SET NULL,
    rating_average DECIMAL(3,2) DEFAULT 0.00,
    total_deliveries INT DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
    
    -- Pickup details
    pickup_address TEXT NOT NULL,
    pickup_latitude DECIMAL(10, 8),
    pickup_longitude DECIMAL(11, 8),
    pickup_time TIMESTAMP,
    
    -- Delivery details
    delivery_address TEXT NOT NULL,
    delivery_latitude DECIMAL(10, 8),
    delivery_longitude DECIMAL(11, 8),
    delivery_time TIMESTAMP,
    
    -- Tracking
    distance_km DECIMAL(6,2),
    estimated_duration_minutes INT,
    actual_duration_minutes INT,
    tracking_url TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'assigned' CHECK (
        status IN ('assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled')
    ),
    
    -- Proof of delivery
    delivery_photo_url TEXT,
    customer_signature TEXT,
    delivery_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- REVIEWS & RATINGS
-- ============================================

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- Ratings
    product_rating INT CHECK (product_rating >= 1 AND product_rating <= 5),
    seller_rating INT CHECK (seller_rating >= 1 AND seller_rating <= 5),
    delivery_rating INT CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
    
    -- Review content
    comment TEXT,
    pros TEXT,
    cons TEXT,
    
    -- Media
    photos TEXT[], -- Array of image URLs
    
    -- Response
    seller_response TEXT,
    seller_responded_at TIMESTAMP,
    
    -- Verification
    is_verified_purchase BOOLEAN DEFAULT TRUE,
    is_anonymous BOOLEAN DEFAULT FALSE,
    
    -- Moderation
    is_approved BOOLEAN DEFAULT TRUE,
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PAYMENTS & WALLETS
-- ============================================

CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'PKR',
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    transaction_type VARCHAR(50) NOT NULL, -- 'credit', 'debit', 'refund', 'payout', 'bonus'
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    
    description TEXT,
    reference_id VARCHAR(255),
    
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seller_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    
    amount DECIMAL(10,2) NOT NULL,
    commission_deducted DECIMAL(10,2) NOT NULL,
    net_amount DECIMAL(10,2) NOT NULL,
    
    payout_method VARCHAR(50) NOT NULL, -- 'bank_transfer', 'jazzcash', 'easypaisa'
    account_details JSONB, -- Store encrypted account info
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    transaction_id VARCHAR(255),
    
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    processed_at TIMESTAMP,
    failed_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROMOTIONS & DISCOUNTS
-- ============================================

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_delivery')),
    discount_value DECIMAL(10,2) NOT NULL,
    max_discount_amount DECIMAL(10,2), -- For percentage discounts
    
    min_order_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Applicability
    applicable_to VARCHAR(20) DEFAULT 'all' CHECK (applicable_to IN ('all', 'new_users', 'specific_users', 'specific_products', 'specific_categories')),
    applicable_cities TEXT[],
    
    -- Usage limits
    usage_limit_total INT, -- Total times code can be used
    usage_limit_per_user INT DEFAULT 1,
    used_count INT DEFAULT 0,
    
    -- Validity
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE promotion_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    discount_applied DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    type VARCHAR(50) NOT NULL, -- 'order_update', 'payment', 'review', 'promotion', 'system'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    data JSONB, -- Additional structured data
    
    action_url TEXT,
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    channel VARCHAR(20) DEFAULT 'push' CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUPPORT & COMPLAINTS
-- ============================================

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    category VARCHAR(50) NOT NULL, -- 'order_issue', 'payment', 'delivery', 'quality', 'other'
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    message TEXT NOT NULL,
    attachments TEXT[],
    
    is_internal BOOLEAN DEFAULT FALSE, -- Internal notes not visible to customer
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CARTS (Persistent Cart Storage)
-- ============================================

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
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    stock_type VARCHAR(20) CHECK (stock_type IN ('direct', 'hub')),
    hub_id UUID REFERENCES hub_centers(id) ON DELETE SET NULL,
    price_snapshot DECIMAL(10,2) NOT NULL CHECK (price_snapshot > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INVENTORY RESERVATIONS
-- ============================================

CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    reservation_type VARCHAR(20) NOT NULL CHECK (reservation_type IN ('cart', 'order')),
    reservation_id UUID NOT NULL, -- cart_id or order_id
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SELLER PAYOUT SCHEDULES
-- ============================================

CREATE TABLE seller_payout_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
    payout_day INT CHECK (payout_day BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
    payout_method VARCHAR(50) NOT NULL,
    minimum_payout_amount DECIMAL(10,2) DEFAULT 1000.00 CHECK (minimum_payout_amount >= 0),
    auto_payout BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seller_id)
);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'user_login', 'order_created', 'payment_processed', 'admin_action'
    entity_type VARCHAR(50), -- 'user', 'order', 'payment', 'seller'
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_data JSONB,
    response_status INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ANALYTICS & TRACKING
-- ============================================

CREATE TABLE user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    activity_type VARCHAR(50) NOT NULL, -- 'page_view', 'product_view', 'search', 'add_to_cart', 'purchase'
    entity_type VARCHAR(50), -- 'product', 'category', 'seller'
    entity_id UUID,
    
    metadata JSONB,
    
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    query TEXT NOT NULL,
    filters JSONB,
    results_count INT,
    
    clicked_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SYSTEM CONFIGURATION
-- ============================================

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_status ON users(status);

-- Sellers
CREATE INDEX idx_sellers_user_id ON sellers(user_id);
CREATE INDEX idx_sellers_status ON sellers(status);
CREATE INDEX idx_sellers_verification_status ON sellers(verification_status);
CREATE INDEX idx_sellers_rating ON sellers(rating_average DESC);
CREATE INDEX idx_sellers_featured ON sellers(is_featured) WHERE is_featured = TRUE;

-- Products
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_rating ON products(rating_average DESC);
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_price ON products(price);

-- Orders
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_hub_id ON orders(hub_id);

-- Order Items
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_seller_id ON order_items(seller_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Hub Inventory
CREATE INDEX idx_hub_inventory_hub_id ON hub_inventory(hub_id);
CREATE INDEX idx_hub_inventory_product_id ON hub_inventory(product_id);
CREATE INDEX idx_hub_inventory_seller_id ON hub_inventory(seller_id);
CREATE INDEX idx_hub_inventory_expiry ON hub_inventory(expiry_date);

-- Reviews
CREATE INDEX idx_reviews_product_id ON reviews(product_id);
CREATE INDEX idx_reviews_seller_id ON reviews(seller_id);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;

-- Promotions
CREATE INDEX idx_promotions_code ON promotions(code);
CREATE INDEX idx_promotions_active ON promotions(is_active, valid_from, valid_until);

-- User Activity
CREATE INDEX idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_type ON user_activity_logs(activity_type);
CREATE INDEX idx_user_activity_created_at ON user_activity_logs(created_at DESC);

-- Carts
CREATE INDEX idx_carts_user_id ON carts(user_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product_id ON cart_items(product_id);
CREATE INDEX idx_cart_items_seller_id ON cart_items(seller_id);

-- Inventory Reservations
CREATE INDEX idx_inventory_reservations_product_id ON inventory_reservations(product_id);
CREATE INDEX idx_inventory_reservations_expires_at ON inventory_reservations(expires_at);
CREATE INDEX idx_inventory_reservations_type_id ON inventory_reservations(reservation_type, reservation_id);

-- Seller Payout Schedules
CREATE INDEX idx_seller_payout_schedules_seller_id ON seller_payout_schedules(seller_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Additional Indexes for Performance
CREATE INDEX idx_orders_delivery_slot_date ON orders(delivery_slot_date);
CREATE INDEX idx_orders_estimated_delivery_at ON orders(estimated_delivery_at);
CREATE INDEX idx_hub_inventory_status ON hub_inventory(status);
CREATE INDEX idx_reviews_is_approved ON reviews(is_approved) WHERE is_approved = TRUE;
CREATE INDEX idx_promotions_code_active ON promotions(code, is_active) WHERE is_active = TRUE;

-- Full-Text Search Indexes
CREATE INDEX idx_products_name_fts ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_description_fts ON products USING gin(to_tsvector('english', description));
CREATE INDEX idx_sellers_business_name_fts ON sellers USING gin(to_tsvector('english', business_name));

-- ============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sellers_updated_at BEFORE UPDATE ON sellers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hub_centers_updated_at BEFORE UPDATE ON hub_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hub_inventory_updated_at BEFORE UPDATE ON hub_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_seller_payout_schedules_updated_at BEFORE UPDATE ON seller_payout_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update product rating when review is added
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET 
        rating_average = (
            SELECT AVG(product_rating)::DECIMAL(3,2)
            FROM reviews
            WHERE product_id = NEW.product_id
            AND is_approved = TRUE
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM reviews
            WHERE product_id = NEW.product_id
            AND is_approved = TRUE
        )
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_rating_on_review AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- Trigger to update seller rating when review is added
CREATE OR REPLACE FUNCTION update_seller_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sellers
    SET 
        rating_average = (
            SELECT AVG(seller_rating)::DECIMAL(3,2)
            FROM reviews
            WHERE seller_id = NEW.seller_id
            AND is_approved = TRUE
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM reviews
            WHERE seller_id = NEW.seller_id
            AND is_approved = TRUE
        )
    WHERE id = NEW.seller_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_seller_rating_on_review AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_seller_rating();

-- ============================================
-- INITIAL DATA SEEDS
-- ============================================

-- Insert default categories
INSERT INTO categories (name, name_urdu, slug, description, sort_order) VALUES
('Frozen Parathas', 'منجمد پراٹھے', 'frozen-parathas', 'Fresh homemade frozen parathas', 1),
('Samosas & Snacks', 'سموسے اور نمکین', 'samosas-snacks', 'Delicious frozen samosas and snacks', 2),
('Ready Meals', 'تیار کھانے', 'ready-meals', 'Complete frozen meals ready to heat', 3),
('Kebabs & Tikkas', 'کباب اور ٹکے', 'kebabs-tikkas', 'Frozen kebabs and tikka varieties', 4),
('Desserts', 'میٹھائیاں', 'desserts', 'Frozen desserts and sweets', 5),
('Bread & Roti', 'روٹی اور نان', 'bread-roti', 'Frozen bread, roti, and naan', 6),
('Diet Meals', 'ڈائیٹ کھانے', 'diet-meals', 'Healthy frozen meal options', 7),
('Kids Favorites', 'بچوں کی پسند', 'kids-favorites', 'Kid-friendly frozen items', 8);

-- Insert system settings
INSERT INTO system_settings (key, value, description) VALUES
('default_commission_rate', '15', 'Default commission rate for sellers'),
('delivery_fee_base', '100', 'Base delivery fee in PKR'),
('free_delivery_threshold', '1000', 'Minimum order amount for free delivery in PKR'),
('hub_delivery_fee', '50', 'Delivery fee for hub orders in PKR'),
('max_order_items', '50', 'Maximum items per order'),
('order_cancellation_window', '30', 'Minutes within which customer can cancel order'),
('seller_payout_day', '7', 'Day of week for seller payouts (1=Monday, 7=Sunday)'),
('platform_currency', '"PKR"', 'Platform currency code'),
('otp_expiry_minutes', '5', 'OTP expiry time in minutes'),
('max_otp_attempts', '3', 'Maximum OTP verification attempts');

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for active products with seller info
CREATE VIEW active_products_view AS
SELECT 
    p.*,
    s.business_name as seller_name,
    s.rating_average as seller_rating,
    s.is_verified as seller_verified,
    c.name as category_name,
    (
        SELECT image_url 
        FROM product_images 
        WHERE product_id = p.id AND is_primary = TRUE 
        LIMIT 1
    ) as primary_image
FROM products p
JOIN sellers s ON p.seller_id = s.id
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.is_active = TRUE 
AND p.approval_status = 'approved'
AND s.status = 'active';

-- View for order summary
CREATE VIEW order_summary_view AS
SELECT 
    o.*,
    u.full_name as customer_name,
    u.phone as customer_phone,
    COUNT(oi.id) as total_items,
    COUNT(DISTINCT oi.seller_id) as total_sellers
FROM orders o
JOIN users usr ON o.customer_id = usr.id
JOIN user_profiles u ON usr.id = u.user_id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, u.full_name, u.phone;

-- ============================================
-- FUNCTIONS FOR BUSINESS LOGIC
-- ============================================

-- Function to calculate seller earnings for a period
CREATE OR REPLACE FUNCTION calculate_seller_earnings(
    p_seller_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    total_orders BIGINT,
    total_sales DECIMAL(10,2),
    total_commission DECIMAL(10,2),
    net_earnings DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT oi.order_id)::BIGINT,
        COALESCE(SUM(oi.total_price), 0)::DECIMAL(10,2),
        COALESCE(SUM(oi.commission_amount), 0)::DECIMAL(10,2),
        COALESCE(SUM(oi.seller_payout), 0)::DECIMAL(10,2)
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.seller_id = p_seller_id
    AND o.order_status = 'completed'
    AND o.payment_status = 'paid'
    AND o.created_at::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE users IS 'Core user authentication and account information';
COMMENT ON TABLE sellers IS 'Seller profiles and business information';
COMMENT ON TABLE products IS 'Product catalog with inventory and pricing';
COMMENT ON TABLE hub_centers IS 'Micro-fulfillment centers for high-density areas';
COMMENT ON TABLE hub_inventory IS 'Real-time inventory at hub locations';
COMMENT ON TABLE orders IS 'Customer orders and transactions';
COMMENT ON TABLE order_items IS 'Individual items within orders';
COMMENT ON TABLE reviews IS 'Customer reviews and ratings';
COMMENT ON TABLE promotions IS 'Discount codes and promotional campaigns';
COMMENT ON TABLE notifications IS 'System notifications for users';
COMMENT ON TABLE support_tickets IS 'Customer support and complaint management';
