# FrozenNuray Platform - Developer Onboarding Guide

## Document Information
- **Version**: 1.0
- **Last Updated**: November 2025
- **Document Owner**: Tech Lead
- **Target Audience**: New Developers

---

## 1. Welcome to FrozenNuray!

Welcome to the FrozenNuray development team! This guide will help you get set up and productive quickly.

### 1.1 What is FrozenNuray?

FrozenNuray is Pakistan's first dedicated marketplace platform for frozen homemade food, connecting home-based food entrepreneurs with customers seeking authentic, convenient, and high-quality frozen meals.

### 1.2 Tech Stack Overview

**Backend:**
- Node.js 20.x LTS
- Express.js
- TypeScript
- PostgreSQL 15.x
- Redis 7.x
- Prisma ORM

**Frontend (Web):**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS

**Mobile:**
- Flutter 3.x
- Dart

---

## 2. Prerequisites

### 2.1 Required Software

**Development Tools:**
- Node.js 20.x or higher ([Download](https://nodejs.org/))
- PostgreSQL 15.x ([Download](https://www.postgresql.org/download/))
- Redis 7.x ([Download](https://redis.io/download))
- Git ([Download](https://git-scm.com/downloads))
- VS Code (recommended) or your preferred IDE

**Optional:**
- Docker & Docker Compose (for containerized development)
- Flutter SDK (for mobile development)
- Postman (for API testing)

### 2.2 Required Accounts

- GitHub account (for code repository)
- Slack account (for team communication)
- Email account (for notifications)

### 2.3 System Requirements

**Minimum:**
- OS: macOS, Linux, or Windows (WSL2)
- RAM: 8GB
- Storage: 20GB free space
- Internet: Stable connection

**Recommended:**
- OS: macOS or Linux
- RAM: 16GB
- Storage: 50GB free space
- Internet: High-speed connection

---

## 3. Getting Started

### 3.1 Repository Setup

**Clone Repository:**
```bash
git clone https://github.com/yourusername/frozen-nuray.git
cd frozen-nuray
```

**Repository Structure:**
```
frozen-nuray/
├── backend/          # Node.js backend API
├── frontend-web/     # Next.js web application
├── mobile-app/       # Flutter mobile app
├── docs/             # Documentation
└── scripts/          # Utility scripts
```

### 3.2 Backend Setup

**Install Dependencies:**
```bash
cd backend
npm install
```

**Environment Variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

**.env File:**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/frozennuray_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-local-secret-key
JWT_EXPIRES_IN=24h

# Development
NODE_ENV=development
PORT=3000
```

**Database Setup:**
```bash
# Create database
createdb frozennuray_dev

# Run migrations
npx prisma migrate dev

# Seed database
npm run seed
```

**Start Development Server:**
```bash
npm run dev
# Server runs on http://localhost:3000
```

### 3.3 Frontend Setup (Web)

**Install Dependencies:**
```bash
cd frontend-web
npm install
```

**Environment Variables:**
```bash
cp .env.example .env.local
# Edit .env.local
```

**.env.local File:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-key
```

**Start Development Server:**
```bash
npm run dev
# App runs on http://localhost:3001
```

### 3.4 Mobile App Setup

**Install Flutter:**
```bash
# Follow Flutter installation guide
# https://flutter.dev/docs/get-started/install
```

**Install Dependencies:**
```bash
cd mobile-app
flutter pub get
```

**Run App:**
```bash
# Android
flutter run

# iOS (macOS only)
flutter run -d ios
```

### 3.5 Docker Setup (Alternative)

**Start All Services:**
```bash
# From project root
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## 4. Development Workflow

### 4.1 Git Workflow

**Branch Naming:**
- Feature: `feature/feature-name`
- Bug fix: `fix/bug-description`
- Hotfix: `hotfix/issue-description`
- Documentation: `docs/documentation-update`

**Workflow:**
1. Create feature branch from `main`
2. Make changes and commit
3. Push to remote
4. Create Pull Request
5. Code review (2 approvals required)
6. Merge to `main`

**Commit Messages:**
```
feat: Add product search functionality
fix: Resolve cart calculation bug
docs: Update API documentation
refactor: Improve order processing logic
test: Add unit tests for payment service
```

### 4.2 Code Standards

**TypeScript/JavaScript:**
- Follow Airbnb style guide
- Use ESLint and Prettier
- Maximum line length: 100 characters
- Use meaningful variable names
- Add JSDoc comments for functions

**Example:**
```typescript
/**
 * Calculates the total order amount including delivery fee and discount
 * @param items - Array of order items
 * @param deliveryFee - Delivery fee amount
 * @param discount - Discount amount (optional)
 * @returns Total order amount
 */
function calculateOrderTotal(
  items: OrderItem[],
  deliveryFee: number,
  discount?: number
): number {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal + deliveryFee - (discount || 0);
  return Math.max(0, total);
}
```

**Dart/Flutter:**
- Follow official Dart style guide
- Use `dart format` for formatting
- Maximum line length: 80 characters

### 4.3 Testing

**Write Tests:**
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical flows

**Run Tests:**
```bash
# Backend
cd backend
npm test
npm run test:coverage

# Frontend
cd frontend-web
npm test

# Mobile
cd mobile-app
flutter test
```

---

## 5. Project Structure

### 5.1 Backend Structure

```
backend/
├── src/
│   ├── controllers/    # Route controllers
│   ├── services/       # Business logic
│   ├── models/         # Database models (Prisma)
│   ├── middleware/     # Auth, validation, etc.
│   ├── routes/         # API routes
│   ├── utils/          # Helper functions
│   └── config/         # Configuration files
├── prisma/
│   └── schema.prisma   # Database schema
├── tests/              # Test files
├── package.json
└── tsconfig.json
```

### 5.2 Frontend Structure

```
frontend-web/
├── src/
│   ├── app/            # Next.js app directory
│   ├── components/     # React components
│   ├── lib/            # Utilities, API client
│   ├── styles/         # Global styles
│   └── types/          # TypeScript types
├── public/             # Static assets
├── package.json
└── next.config.js
```

### 5.3 Mobile App Structure

```
mobile-app/
├── lib/
│   ├── core/           # Core utilities
│   ├── features/       # Feature modules
│   └── shared/         # Shared widgets
├── assets/             # Images, fonts
├── test/               # Tests
└── pubspec.yaml
```

---

## 6. Key Concepts

### 6.1 Authentication Flow

1. User requests OTP
2. OTP sent via SMS
3. User verifies OTP
4. JWT tokens generated
5. Tokens used for authenticated requests

### 6.2 Order Flow

1. Customer adds items to cart
2. Customer proceeds to checkout
3. Payment processed (escrow)
4. Order created
5. Seller notified
6. Order fulfilled
7. Payment released to seller

### 6.3 Hub System

- Sellers drop off products at hub
- Hub stores products in freezers
- Orders from hub inventory: 2-4 hour delivery
- Orders from direct sellers: 24 hour delivery

---

## 7. Common Tasks

### 7.1 Adding a New API Endpoint

1. Define route in `routes/`
2. Create controller in `controllers/`
3. Add business logic in `services/`
4. Add validation middleware
5. Write tests
6. Update API documentation

### 7.2 Adding a New Database Table

1. Update Prisma schema
2. Create migration: `npx prisma migrate dev`
3. Update models/services
4. Write tests

### 7.3 Adding a New Feature

1. Create feature branch
2. Implement backend API
3. Implement frontend UI
4. Write tests
5. Update documentation
6. Create PR

---

## 8. Debugging

### 8.1 Backend Debugging

**VS Code Debug Configuration:**
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "console": "integratedTerminal"
}
```

**Logging:**
```typescript
import logger from './utils/logger';

logger.info('Order created', { orderId: order.id });
logger.error('Payment failed', { error, orderId });
```

### 8.2 Frontend Debugging

**Browser DevTools:**
- React DevTools extension
- Network tab for API calls
- Console for errors

**Next.js Debugging:**
- Error overlay in development
- Source maps enabled
- Hot reload for changes

### 8.3 Database Debugging

**Prisma Studio:**
```bash
npx prisma studio
# Opens database GUI at http://localhost:5555
```

**Query Logging:**
```typescript
// Enable in Prisma schema
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  log      = ["query", "info", "warn", "error"]
}
```

---

## 9. Resources

### 9.1 Documentation

- [Architecture Document](../ARCHITECTURE.md)
- [API Documentation](../API_DOCUMENTATION.md)
- [Database Schema](../DATABASE_SCHEMA.sql)
- [Product Requirements](../PRODUCT_REQUIREMENTS.md)

### 9.2 External Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Next.js Documentation](https://nextjs.org/docs)
- [Flutter Documentation](https://flutter.dev/docs)
- [Prisma Documentation](https://www.prisma.io/docs)

### 9.3 Team Resources

- **Slack**: #engineering, #backend, #frontend, #mobile
- **GitHub**: Issues, Pull Requests, Discussions
- **Wiki**: Internal documentation

---

## 10. Getting Help

### 10.1 Questions?

- **Technical Questions**: Ask in Slack #engineering
- **Code Review**: Request in PR comments
- **Blockers**: Tag Tech Lead in Slack
- **Bugs**: Create GitHub issue

### 10.2 Code Review Process

1. Create PR with clear description
2. Request review from 2 team members
3. Address review comments
4. Get approval
5. Merge to main

### 10.3 Pair Programming

- Available for complex features
- Schedule via Slack
- Great for learning and knowledge sharing

---

## 11. Best Practices

### 11.1 Code Quality

- Write clean, readable code
- Follow DRY (Don't Repeat Yourself)
- Use meaningful names
- Add comments for complex logic
- Keep functions small and focused

### 11.2 Security

- Never commit secrets
- Validate all inputs
- Use parameterized queries
- Follow OWASP guidelines
- Review security checklist

### 11.3 Performance

- Optimize database queries
- Use caching where appropriate
- Minimize API calls
- Optimize images
- Use pagination for large datasets

---

## 12. Checklist

**First Day:**
- [ ] Repository cloned
- [ ] Development environment set up
- [ ] Backend running locally
- [ ] Frontend running locally
- [ ] Database seeded
- [ ] First commit made

**First Week:**
- [ ] Code reviewed
- [ ] First feature implemented
- [ ] Tests written
- [ ] Documentation updated
- [ ] Team members met

**First Month:**
- [ ] Multiple features shipped
- [ ] Code review process understood
- [ ] Architecture understood
- [ ] Contributing to discussions
- [ ] Comfortable with codebase

---

## 13. Contact Information

**Tech Lead:**
- Email: tech@frozennuray.com
- Slack: @tech-lead

**Backend Team:**
- Slack: #backend

**Frontend Team:**
- Slack: #frontend

**Mobile Team:**
- Slack: #mobile

---

**Welcome to the team! 🚀**

**End of Document**

