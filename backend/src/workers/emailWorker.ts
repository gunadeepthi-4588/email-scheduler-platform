import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import { sendEmail } from '../services/emailService';
import prisma from '../config/database';
import { emailQueue } from '../queues/emailQueue';
import { redisClient, redisConnectionOptions } from '../config/redis';
import { notifyRateLimitReached } from '../services/slackService';
import { indexEmailInElasticsearch } from '../services/searchService';

dotenv.config();

export const emailWorker = new Worker(
  'emailQueue',
  async (job) => {
    console.log(`[Worker] Processing job ID: ${job.id} (name: ${job.name})`);
    const { emailId, to, subject, body, hourlyLimit } = job.data;

    // Check if email exists in database
    const email = await prisma.email.findUnique({
      where: {
        id: emailId,
      },
    });

    if (!email) {
      console.warn(`[Worker] Email with ID ${emailId} not found in database. Skipping.`);
      return {
        success: false,
        reason: 'Email not found',
      };
    }

    // Idempotency check: Skip if already marked SENT
    if (email.status === 'SENT') {
      console.log(`[Worker] Email ${emailId} is already marked as SENT. Skipping duplicate execution.`);
      return {
        success: true,
        skipped: true,
      };
    }

    // Redis-backed hourly rate counter
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    const hourKey = currentHour.toISOString().slice(0, 13);
    const rateLimitKey = `email-rate:${email.fromEmail}:${hourKey}`;
    const limit = Number(hourlyLimit || 100);

    const currentCount = await redisClient.incr(rateLimitKey);

    if (currentCount === 1) {
      await redisClient.expire(rateLimitKey, 3700);
    }

    // If hourly limit is reached, reschedule for next hour
    if (currentCount > limit) {
      await redisClient.decr(rateLimitKey);

      const nextHour = new Date(currentHour.getTime() + 60 * 60 * 1000);
      const delay = Math.max(nextHour.getTime() - Date.now(), 1000);

      console.log(
        `[Worker] Rate limit of ${limit}/hr reached for ${email.fromEmail}. Rescheduling email ${emailId} for ${nextHour.toISOString()} (delay: ${delay}ms)`
      );

      // Trigger Slack alert (deduplicated per hour)
      await notifyRateLimitReached(email.fromEmail, limit, nextHour);

      // Add rescheduled job with a unique deterministic ID
      await emailQueue.add(
        'send-email',
        {
          emailId,
          to,
          subject,
          body,
          hourlyLimit: limit,
        },
        {
          delay,
          jobId: `email-${emailId}-rescheduled-${nextHour.getTime()}`,
        }
      );

      return {
        success: true,
        rescheduled: true,
        nextRunAt: nextHour.toISOString(),
      };
    }

    try {
      // Send the email via SMTP/Nodemailer
      const info = await sendEmail(to, subject, body);

      // Update email record in PostgreSQL
      const updatedEmail = await prisma.email.update({
        where: {
          id: emailId,
        },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      // Index in Elasticsearch if configured
      await indexEmailInElasticsearch(updatedEmail);

      console.log(`[Worker] Email ${emailId} sent successfully to ${to}`);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (sendError: any) {
      console.error(`[Worker] Error sending email ${emailId}:`, sendError);

      await prisma.email.update({
        where: {
          id: emailId,
        },
        data: {
          status: 'FAILED',
        },
      }).catch((dbErr) => console.error('[Worker] Failed to update email status to FAILED:', dbErr));

      throw sendError;
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
});

console.log('ReachInbox Email Worker is initialized and listening for jobs...');