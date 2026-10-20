import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './audit';

/**
 * Build MySQL pool options from a mysql:// URL. The session timezone is pinned
 * to UTC so DATETIME values never shift with the server's local time.
 */
export function poolConfigFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use the mysql:// scheme');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    timezone: 'Z',
    connectionLimit: Number(url.searchParams.get('connection_limit') ?? 10),
  };
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfigFromUrl(databaseUrl)) });
}
