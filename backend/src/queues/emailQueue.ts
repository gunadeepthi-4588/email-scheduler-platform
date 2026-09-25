import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';

export const emailQueue = new Queue('emailQueue', {
  connection: redisConnectionOptions,
});
