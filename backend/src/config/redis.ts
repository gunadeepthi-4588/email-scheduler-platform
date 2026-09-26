import IORedis, { RedisOptions } from 'ioredis';
import { ConnectionOptions } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL;

function getRedisConnectionOptions(): ConnectionOptions {
  if (redisUrl) {
    try {
      const parsedUrl = new URL(redisUrl);
      const isTls = parsedUrl.protocol === 'rediss:';
      const dbNumber = parsedUrl.pathname && parsedUrl.pathname.length > 1
        ? parseInt(parsedUrl.pathname.slice(1), 10)
        : undefined;

      return {
        host: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 6379,
        username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
        password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
        db: !isNaN(dbNumber as number) ? dbNumber : undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
      };
    } catch (err) {
      console.warn('[Redis] Failed to parse REDIS_URL as URL:', err);
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export const redisConnectionOptions: ConnectionOptions = getRedisConnectionOptions();

export const redisClient = redisUrl
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : new IORedis(redisConnectionOptions as RedisOptions);

redisClient.on('error', (err) => {
  console.error('[Redis Client] Error:', err.message);
});

