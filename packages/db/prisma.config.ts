import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Only migrate/introspect commands need a live database; generate does not.
    url: process.env.DATABASE_URL ?? 'mysql://placeholder@localhost:3306/placeholder',
  },
});
