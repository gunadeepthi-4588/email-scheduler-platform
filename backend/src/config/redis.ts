import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
};

export const redisClient = new IORedis(redisConnectionOptions);
