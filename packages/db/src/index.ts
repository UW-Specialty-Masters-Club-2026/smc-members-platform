import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './audit';
export * from './events';

/**
 * Build MySQL pool options from a mysql:// URL. The session timezone is pinned
 * to UTC so DATETIME values never shift with the server's local time.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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
    // MySQL 8's default auth (caching_sha2_password) needs the server's RSA key on a plain
    // connection after a restart. Fetching it is safe only on this machine; remote databases
    // should use TLS, or opt in explicitly with ?allowPublicKeyRetrieval=true.
    allowPublicKeyRetrieval:
      LOCAL_HOSTS.has(url.hostname) || url.searchParams.get('allowPublicKeyRetrieval') === 'true',
  };
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfigFromUrl(databaseUrl)) });
}
