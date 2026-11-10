import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The Prisma CLI (generate, migrate, the seeds) reads its database from here; the app builds its own connection pool in
// src/config/database.ts. `prisma generate` needs no database (CI's build jobs and the Docker build run it without one),
// so the datasource is only set when DATABASE_URL is; migrate then says it has no database.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
