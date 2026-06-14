// Load env BEFORE any other import — modules like utils/jwt validate env at
// import time and need it populated.
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import socketManager from './config/socket';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { startScheduler } from './jobs/scheduler';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import productVariantRoutes from './routes/product-variant.routes';
import stockAlertRoutes from './routes/stock-alert.routes';
import profitLossRoutes from './routes/profit-loss.routes';
import categoryRoutes from './routes/category.routes';
import categoryRequestRoutes from './routes/category-request.routes';
import orderRoutes from './routes/order.routes';
import cartRoutes from './routes/cart.routes';
import sellerOrderRoutes from './routes/seller-order.routes';
import adminOrderRoutes from './routes/admin-order.routes';
import realtimeOrderRoutes from './routes/realtime-order.routes';
import paymentRoutes from './routes/payment.routes';
import userProfileRoutes from './routes/user-profile.routes';
import sellerRoutes from './routes/seller.routes';
import adminRoutes from './routes/admin.routes';
import reviewRoutes from './routes/review.routes';
import promotionRoutes from './routes/promotion.routes';
import notificationRoutes from './routes/notification.routes';
import hubRoutes from './routes/hub.routes';
import supportRoutes from './routes/support.routes';
import uploadRoutes from './routes/upload.routes';
import favoriteRoutes from './routes/favorite.routes';
import riderRoutes from './routes/rider.routes';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Initialize Socket.io
socketManager.initialize(httpServer);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded from other origins
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('combined')); // Logging

// Parse JSON. For webhook routes we also capture the raw Buffer so HMAC
// signature checks can verify the exact bytes Safepay sent.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    if ((req as express.Request).path?.endsWith('/safepay-webhook')) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (uploaded images) - with CORS headers
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use(`/api/${API_VERSION}/health`, healthRoutes);
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/upload`, uploadRoutes);
app.use(`/api/${API_VERSION}/products`, productRoutes);
app.use(`/api/${API_VERSION}/product-variants`, productVariantRoutes);
app.use(`/api/${API_VERSION}/stock-alerts`, stockAlertRoutes);
app.use(`/api/${API_VERSION}/profit-loss`, profitLossRoutes);
app.use(`/api/${API_VERSION}/categories`, categoryRoutes);
app.use(`/api/${API_VERSION}/category-requests`, categoryRequestRoutes);
app.use(`/api/${API_VERSION}/orders`, orderRoutes);
app.use(`/api/${API_VERSION}/cart`, cartRoutes);
app.use(`/api/${API_VERSION}/seller`, sellerOrderRoutes);
app.use(`/api/${API_VERSION}/admin`, adminOrderRoutes);
app.use(`/api/${API_VERSION}/realtime`, realtimeOrderRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);
app.use(`/api/${API_VERSION}/users`, userProfileRoutes);
app.use(`/api/${API_VERSION}/sellers`, sellerRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/reviews`, reviewRoutes);
app.use(`/api/${API_VERSION}/promotions`, promotionRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/hubs`, hubRoutes);
app.use(`/api/${API_VERSION}/support`, supportRoutes);
app.use(`/api/${API_VERSION}/favorites`, favoriteRoutes);
app.use(`/api/${API_VERSION}/rider`, riderRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Nuray API',
    version: API_VERSION,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api/${API_VERSION}`);
  console.log(`🔌 WebSocket server initialized`);
  startScheduler();
});

export default app;

