# FrozenNuray Backend API

Backend API for FrozenNuray Platform - Pakistan's first frozen homemade food marketplace.

## Tech Stack

- **Runtime**: Node.js 20.x
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 15.x
- **ORM**: Prisma
- **Cache**: Redis
- **Validation**: Zod

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL 14.x or higher
- Redis 7.x or higher

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

### 3. Database Setup

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Seed database
npm run prisma:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Server will run on `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

## Project Structure

```
backend/
├── src/
│   ├── controllers/    # Route controllers
│   ├── services/       # Business logic
│   ├── models/         # Data models (Prisma)
│   ├── middleware/     # Express middleware
│   ├── routes/         # API routes
│   ├── utils/          # Utility functions
│   ├── config/         # Configuration files
│   └── index.ts        # Entry point
├── prisma/
│   └── schema.prisma   # Database schema
└── tests/              # Test files
```

## API Endpoints

### Health Check
- `GET /api/v1/health` - Health check endpoint

## Environment Variables

See `.env.example` for all required environment variables.

## Documentation

See main project README and `/docs` folder for complete documentation.

