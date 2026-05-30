# FrozenNuray - AI Coding Agent Instructions

## Project Overview
FrozenNuray is Pakistan's first frozen homemade food marketplace platform with a monolithic backend (Node.js/Express/Prisma), Next.js web frontend, and planned Flutter mobile apps. The platform connects home-based food entrepreneurs with customers through hub-based micro-fulfillment centers.

## Architecture & Key Concepts

### Multi-Tier User System
- **5 user types** (customer, seller, admin, hub_manager, rider) all stored in single `users` table
- User type determines access via `requireRole()` middleware in [backend/src/middleware/auth.middleware.ts](../backend/src/middleware/auth.middleware.ts)
- Most entities have relationships to `User` model, not specific role models
- Sellers have extended data in separate `Seller` model with `userId` foreign key

### Database Conventions (Prisma)
- **Snake_case in database**, camelCase in TypeScript code
- All Prisma fields use `@map("snake_case")` for database columns
- Table names use `@@map("table_name")` 
- Example: `fullName String @map("full_name")` in code maps to `full_name` column
- Always use camelCase when writing Prisma queries: `prisma.user.findUnique({ where: { id: userId } })`

### Real-Time Architecture
- Socket.io WebSocket server initialized in [backend/src/index.ts](../backend/src/index.ts) via `socketManager`
- Room-based notifications: `user:${userId}`, `role:${role}`, `order:${orderId}`
- Authentication via JWT in socket handshake: `socket.handshake.auth.token`
- See [backend/docs/REALTIME_ORDER_MANAGEMENT.md](../backend/docs/REALTIME_ORDER_MANAGEMENT.md) for event patterns

### API Structure
- RESTful with versioned routes: `/api/v1/{resource}`
- All routes in [backend/src/routes/](../backend/src/routes/) follow pattern: `{resource}.routes.ts`
- Controllers in [backend/src/controllers/](../backend/src/controllers/) named `{resource}.controller.ts`
- Authentication via JWT Bearer tokens with `authenticate` middleware
- Role-based access with `requireRole(['seller', 'admin'])` middleware

## Development Workflows

### Backend Development
```bash
cd backend
npm run dev              # Start with nodemon (auto-restart on changes)
npm run prisma:studio    # Open Prisma Studio GUI for database inspection
npm run prisma:migrate   # Create and apply new migrations
```

### Frontend Development  
```bash
cd frontend-web
npm run dev              # Start Next.js dev server on localhost:3000
```

### Database Operations
- **Never modify migrations directly** - create new ones with `prisma migrate dev --name <description>`
- Seed scripts in [backend/scripts/](../backend/scripts/): `seed-categories.js`, `create-admin.js`, etc.
- Run scripts: `node backend/scripts/<script-name>.js`

### Testing Database State
Use Prisma Studio (`npm run prisma:studio` in backend/) to inspect data visually rather than writing queries.

## Project-Specific Patterns

### Authentication Flow
1. Frontend stores JWT in localStorage via Zustand persistent store
2. ApiClient in [frontend-web/lib/api-client.ts](../frontend-web/lib/api-client.ts) auto-injects token via axios interceptor
3. Backend verifies with `authenticate` middleware, attaches `req.user` with `{ userId, userType }`
4. 401 responses trigger automatic logout and redirect to `/login`

### State Management (Frontend)
- **Zustand stores** in [frontend-web/lib/store/](../frontend-web/lib/store/):
  - `useAuthStore` - user session (persisted to localStorage)
  - `useCartStore` - shopping cart state
- Pattern: `const { user, setUser } = useAuthStore();`
- Stores use `persist()` middleware for automatic localStorage sync

### Error Handling
- Backend uses custom `AppError` class with `(message, statusCode, errorCode)`
- Centralized error handler in [backend/src/middleware/errorHandler.ts](../backend/src/middleware/errorHandler.ts)
- Always throw `AppError` for business logic errors, not generic `Error`

### File Uploads
- Images stored locally in [backend/uploads/products/](../backend/uploads/products/)
- Served statically via `/uploads` route
- Upload controller handles multipart/form-data with multer
- Frontend cloudinary integration planned but not yet implemented

## Common Tasks

### Adding New API Endpoint
1. Define route in `backend/src/routes/{resource}.routes.ts`
2. Add controller function in `backend/src/controllers/{resource}.controller.ts`
3. Use middleware: `router.post('/', authenticate, requireRole(['admin']), controller.create)`
4. Always validate input with Zod or similar before database operations

### Adding New Database Model
1. Add model to [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)
2. Use `@map()` for all fields to match snake_case database convention
3. Run `npm run prisma:migrate` to create migration
4. Update TypeScript types if needed (Prisma Client auto-generates most)

### Adding Real-Time Feature
1. Emit events via `socketManager.emitToUser(userId, 'event:name', data)` from controllers
2. Add socket event listener in [backend/src/config/socket.ts](../backend/src/config/socket.ts) if client-initiated
3. Frontend connects via [frontend-web/lib/hooks/useSocket.ts](../frontend-web/lib/hooks/) (if exists) or raw socket.io-client

### Creating Seller-Specific Features
- Always check `req.user.userType === 'seller'` or use `requireRole(['seller'])`
- Get seller record: `await prisma.seller.findUnique({ where: { userId: req.user.userId } })`
- Sellers can only access their own products/orders - always filter by `sellerId`

## Critical Gotchas

### Database Field Naming
❌ `prisma.user.findUnique({ where: { full_name: 'John' } })` - WRONG (database name)
✅ `prisma.user.findUnique({ where: { profile: { fullName: 'John' } } })` - CORRECT (TypeScript name)

### Authentication Context
- `req.user` only exists AFTER `authenticate` middleware runs
- Contains `{ userId, userType }` - use these for authorization checks
- Never trust client-provided user IDs - always use `req.user.userId`

### Socket.io Rooms
- Users auto-join `user:${userId}` and `role:${userType}` rooms on connect
- Must explicitly join order rooms: `socket.emit('join:order', orderId)`
- Emit to specific rooms with `socketManager.emitToUser()` or `emitToRole()`

## Key Files Reference
- **Entry point**: [backend/src/index.ts](../backend/src/index.ts) - all routes registered here
- **Schema**: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) - single source of truth for data models
- **Auth middleware**: [backend/src/middleware/auth.middleware.ts](../backend/src/middleware/auth.middleware.ts) - JWT verification and role checks
- **Socket config**: [backend/src/config/socket.ts](../backend/src/config/socket.ts) - WebSocket authentication and room management
- **API client**: [frontend-web/lib/api-client.ts](../frontend-web/lib/api-client.ts) - axios wrapper with auth interceptors
- **Architecture docs**: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - high-level system design

## Development Environment
- Node.js 20.x LTS required
- PostgreSQL 15.x for database
- Redis 7.x for caching (planned, not yet integrated)
- Backend runs on port 3001, frontend on 3000
- Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` in `backend/.env`
