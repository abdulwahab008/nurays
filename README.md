# FrozenNuray - Project README

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android%20%7C%20iOS-lightgrey.svg)](https://frozennuray.com)
[![Status](https://img.shields.io/badge/status-In%20Development-yellow.svg)]()

## 🥘 About FrozenNuray

**FrozenNuray** is Pakistan's first dedicated marketplace platform for frozen homemade food, connecting talented home-based food entrepreneurs with customers seeking authentic, convenient, and high-quality frozen meals.

### The Problem We're Solving

- **For Customers**: Limited access to quality, authentic frozen homemade food with no reliable discovery platform
- **For Sellers**: Stuck in local WhatsApp groups with limited reach and manual payment/delivery hassles
- **For Everyone**: No professional frozen food marketplace in Pakistan (Foodpanda/Cheetah focus on fresh restaurant food)

### Our Solution

A comprehensive multi-platform marketplace featuring:
- 🌐 **Web App**: Full-featured responsive web application
- 📱 **Android App**: Native-like Flutter application
- 🍎 **iOS App**: Native-like Flutter application
- 🏪 **Hub Centers**: Innovative micro-fulfillment centers for fast delivery & quality control
- 💳 **Secure Payments**: Escrow system with multiple payment options (JazzCash, EasyPaisa, COD, Cards)
- ⭐ **Quality Assurance**: Verified sellers, product reviews, and hub-based quality checks

---

## 📊 Project Status

**Current Phase**: MVP Development (Phase 1)
**Target Launch**: Q1 2026
**Launch City**: Karachi, Pakistan

### Milestones

- [x] Market validation (200-300 orders via WhatsApp)
- [x] Architecture design
- [x] Database schema design
- [x] API documentation
- [ ] Backend development (In Progress)
- [ ] Frontend development (Web)
- [ ] Mobile app development (Android)
- [ ] Hub center setup
- [ ] Seller onboarding
- [ ] Beta testing
- [ ] Public launch

---

## 🏗️ Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  Web (Next.js) | Android (Flutter) | iOS (Flutter)       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              API GATEWAY (Node.js + Express)             │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
    Auth Service  Business Logic  Integration
                                  (Payments, SMS, etc.)
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│          DATA LAYER                                      │
│  PostgreSQL | Redis Cache | Cloudinary (Files)          │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Runtime: Node.js 20.x LTS
- Framework: Express.js
- Language: TypeScript
- Database: PostgreSQL 15.x
- Cache: Redis 7.x
- ORM: Prisma
- Queue: Bull (Redis-based)

**Frontend (Web):**
- Framework: Next.js 14 (App Router)
- Language: TypeScript
- UI: React 18 + Tailwind CSS
- State: Zustand
- Forms: React Hook Form + Zod

**Mobile Apps:**
- Framework: Flutter 3.x
- Language: Dart
- State: Riverpod
- HTTP: Dio

**Infrastructure:**
- Hosting: AWS (Bahrain region) or DigitalOcean
- CDN: Cloudflare
- File Storage: Cloudinary
- CI/CD: GitHub Actions

**Third-Party Integrations:**
- Payments: JazzCash, EasyPaisa, Stripe
- SMS: Twilio / Local gateway
- Email: SendGrid
- Maps: Google Maps API
- Push: Firebase Cloud Messaging

---

## 📁 Repository Structure

```
frozen-nuray/
├── backend/                    # Node.js backend API
│   ├── src/
│   │   ├── controllers/       # Route controllers
│   │   ├── services/          # Business logic
│   │   ├── models/            # Database models (Prisma)
│   │   ├── middleware/        # Auth, validation, etc.
│   │   ├── routes/            # API routes
│   │   ├── utils/             # Helper functions
│   │   └── config/            # Configuration files
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── tests/                 # Unit & integration tests
│   ├── package.json
│   └── tsconfig.json
│
├── frontend-web/               # Next.js web application
│   ├── src/
│   │   ├── app/               # Next.js app directory
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities, API client
│   │   ├── styles/            # Global styles
│   │   └── types/             # TypeScript types
│   ├── public/                # Static assets
│   ├── package.json
│   └── next.config.js
│
├── mobile-app/                 # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/              # Core utilities
│   │   ├── features/          # Feature modules
│   │   │   ├── auth/
│   │   │   ├── home/
│   │   │   ├── products/
│   │   │   ├── cart/
│   │   │   ├── orders/
│   │   │   └── profile/
│   │   └── shared/            # Shared widgets
│   ├── assets/                # Images, fonts
│   ├── test/                  # Tests
│   ├── pubspec.yaml
│   └── README.md
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md        # System architecture
│   ├── API_DOCUMENTATION.md   # API reference
│   ├── DATABASE_SCHEMA.sql    # Database schema
│   ├── PRODUCT_REQUIREMENTS.md # PRD
│   └── DEPLOYMENT.md          # Deployment guide
│
├── scripts/                    # Utility scripts
│   ├── seed-db.js             # Database seeding
│   ├── migrate.js             # Database migrations
│   └── deploy.sh              # Deployment script
│
├── .github/
│   └── workflows/             # CI/CD workflows
│       ├── backend.yml
│       ├── frontend.yml
│       └── mobile.yml
│
├── docker-compose.yml          # Local development
├── .env.example               # Environment variables template
├── .gitignore
├── LICENSE
└── README.md                  # This file
```

---

## 🚀 Getting Started

### Prerequisites

**Required:**
- Node.js 20.x or higher
- PostgreSQL 15.x
- Redis 7.x
- Flutter 3.x (for mobile development)
- Git

**Optional:**
- Docker & Docker Compose (for containerized development)
- VS Code or preferred IDE

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/yourusername/frozen-nuray.git
cd frozen-nuray
```

#### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# DATABASE_URL, REDIS_URL, JWT_SECRET, etc.

# Run database migrations
npx prisma migrate dev

# Seed database with initial data
npm run seed

# Start development server
npm run dev
```

Backend will run on `http://localhost:3000`

#### 3. Web Frontend Setup

```bash
cd frontend-web

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with API URL
# NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

# Start development server
npm run dev
```

Web app will run on `http://localhost:3001`

#### 4. Mobile App Setup

```bash
cd mobile-app

# Install dependencies
flutter pub get

# Run on Android emulator/device
flutter run

# Or run on iOS simulator (macOS only)
flutter run -d ios
```

### Using Docker (Alternative)

The repo ships Dockerfiles for both the backend and the frontend and a
`docker-compose.yml` that runs them together. Postgres and Redis are
expected on the host machine (where you already use them in dev).

```bash
# 1. Make sure backend/.env exists (copy from .env.example and fill in)
cp backend/.env.example backend/.env

# 2. Build + run both containers
docker compose up --build

# Tail logs
docker compose logs -f

# Stop
docker compose down
```

After `up`, the frontend is on http://localhost:3000 and the backend on
http://localhost:3001. The frontend container talks to the backend via
the compose network; the backend talks to your host's Postgres/Redis via
`host.docker.internal`.

### CI/CD

GitHub Actions:
- **CI** (`.github/workflows/ci.yml`) — runs on every PR and push to
  `main`: typechecks + builds both packages, then builds both Docker
  images as a smoke test. No push to a registry on PRs.
- **Publish** (`.github/workflows/docker-publish.yml`) — runs on push to
  `main` and on `v*` tags: builds and pushes images to
  `ghcr.io/<owner>/nuray-backend` and `ghcr.io/<owner>/nuray-frontend`.
  Tags emitted: `main`, `sha-<short>`, plus `:v1.2.3` / `:latest` on
  release tags.

---

## 📚 Documentation

**Core Documentation:**
- **[System Architecture](docs/ARCHITECTURE.md)**: Complete technical architecture, database design, and system components
- **[API Documentation](docs/API_DOCUMENTATION.md)**: Full API reference with request/response examples
- **[Database Schema](docs/DATABASE_SCHEMA.sql)**: PostgreSQL database schema with tables, indexes, and relationships
- **[Product Requirements](docs/PRODUCT_REQUIREMENTS.md)**: Detailed product requirements, user stories, and feature specifications

**Additional Documentation:**
- **[Security & Compliance](docs/SECURITY_AND_COMPLIANCE.md)**: Security architecture and compliance requirements
- **[Hub Operations Manual](docs/HUB_OPERATIONS_MANUAL.md)**: Complete hub center operations guide
- **[Testing Strategy](docs/TESTING_STRATEGY.md)**: Comprehensive testing approach and guidelines
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)**: Infrastructure setup and deployment procedures
- **[Developer Onboarding](docs/DEVELOPER_ONBOARDING.md)**: Setup guide for new developers
- **[Technology Stack Review](docs/TECHNOLOGY_STACK_REVIEW.md)**: Assessment of technology choices
- **[Architecture Review](docs/ARCHITECTURE_REVIEW_AND_UPDATES.md)**: Issues identified and updates made

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.ts
```

### Frontend Tests

```bash
cd frontend-web

# Run unit tests
npm test

# Run E2E tests
npm run test:e2e
```

### Mobile App Tests

```bash
cd mobile-app

# Run unit tests
flutter test

# Run integration tests
flutter test integration_test/
```

---

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/frozennuray

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Payment Gateways
JAZZCASH_MERCHANT_ID=your-merchant-id
JAZZCASH_PASSWORD=your-password
EASYPAISA_STORE_ID=your-store-id
STRIPE_SECRET_KEY=sk_test_...

# SMS
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# File Storage
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email
SENDGRID_API_KEY=your-sendgrid-key

# Maps
GOOGLE_MAPS_API_KEY=your-google-maps-key
```

**Frontend (.env.local):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-google-maps-key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
```

**Mobile App (lib/core/config.dart):**
```dart
class AppConfig {
  static const String apiBaseUrl = 'http://localhost:3000/api/v1';
  static const String googleMapsApiKey = 'your-google-maps-key';
}
```

---

## 📦 Deployment

### Production Deployment

**Backend (AWS EC2 or DigitalOcean):**

```bash
# Build TypeScript
npm run build

# Start production server
npm run start:prod
```

**Frontend (Vercel - Recommended):**

```bash
# Deploy to Vercel
vercel --prod
```

**Mobile Apps:**

```bash
# Build Android APK
flutter build apk --release

# Build Android App Bundle (for Play Store)
flutter build appbundle --release

# Build iOS (macOS only)
flutter build ios --release
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Code Standards

- **TypeScript/JavaScript**: Follow Airbnb style guide
- **Dart/Flutter**: Follow official Dart style guide
- **Commit Messages**: Use conventional commits (feat, fix, docs, etc.)
- **Tests**: Write tests for new features
- **Documentation**: Update docs for API/feature changes

### Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add description of changes
4. Request review from maintainers
5. Address review feedback
6. Squash commits before merge

---

## 🐛 Bug Reports & Feature Requests

- **Bug Reports**: [Open an issue](https://github.com/yourusername/frozen-nuray/issues/new?template=bug_report.md)
- **Feature Requests**: [Open an issue](https://github.com/yourusername/frozen-nuray/issues/new?template=feature_request.md)

Please include:
- Clear description
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Screenshots/logs if applicable
- Environment details (OS, browser, app version)

---

## 📈 Roadmap

### Phase 1: MVP (Q1 2026) - Current
- ✅ Architecture & design
- 🔄 Backend API development
- 🔄 Web application
- 🔄 Android app
- 🔄 Payment integration
- 🔄 Hub center setup
- 🔄 Seller onboarding

### Phase 2: Growth (Q2 2026)
- iOS app launch
- Advanced analytics
- Loyalty program
- Marketing campaigns
- Lahore expansion

### Phase 3: Scale (Q3-Q4 2026)
- Multi-city expansion (5+ cities)
- Subscription boxes
- Corporate bulk ordering
- 200+ sellers, 10K+ customers

### Phase 4: Maturity (2027)
- 10+ cities nationwide
- Private label products
- International expansion
- Franchise model

---

## 📞 Contact & Support

- **Website**: [https://frozennuray.com](https://frozennuray.com) (coming soon)
- **Email**: support@frozennuray.com
- **WhatsApp**: +92-300-XXXXXXX
- **Facebook**: [@FrozenNuray](https://facebook.com/frozennuray)
- **Instagram**: [@frozen_nuray](https://instagram.com/frozen_nuray)

### Team

- **Founder**: [Your Name]
- **Tech Lead**: [Name]
- **Product Manager**: [Name]

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- All the home cooks who validated this idea through WhatsApp orders
- The amazing Pakistani tech community
- Open-source contributors whose libraries we use
- Our beta testers and early adopters

---

## 🌟 Star History

If you find this project useful, please consider giving it a ⭐️ on GitHub!

---

## 📊 Project Statistics

![GitHub stars](https://img.shields.io/github/stars/yourusername/frozen-nuray?style=social)
![GitHub forks](https://img.shields.io/github/forks/yourusername/frozen-nuray?style=social)
![GitHub issues](https://img.shields.io/github/issues/yourusername/frozen-nuray)
![GitHub pull requests](https://img.shields.io/github/issues-pr/yourusername/frozen-nuray)

---

**Made with ❤️ in Pakistan for Pakistan** 🇵🇰

**Bringing the taste of home to every Pakistani** 🥘
