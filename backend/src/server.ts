import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import prisma from './config/database';
import { emailQueue } from './queues/emailQueue';
import emailRouter from './routes/emailRoutes';
import authRouter from './routes/authRoutes';
// Initialize email worker
import './workers/emailWorker';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// BullMQ Bull Board Dashboard setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// API Routes
app.use('/api/emails', emailRouter);
app.use('/api/auth', authRouter);

// Health & Diagnostics
app.get('/db-test', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json({
      message: 'Database connection successful!',
      users,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Database connection failed!',
      error: String(error),
    });
  }
});

app.get('/queue-test', async (req, res) => {
  try {
    const job = await emailQueue.add('send-email', {
      to: process.env.SMTP_FROM || 'test@example.com',
      subject: 'ReachInbox test email',
      body: 'Hello! This is a test email from the ReachInbox project.',
      hourlyLimit: 100,
    });

    res.json({
      message: 'Job added to the queue successfully!',
      jobId: job.id,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to add job to the queue!',
      error: String(error),
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'ReachInbox backend is running successfully!',
    dashboard: '/admin/queues',
    endpoints: {
      emails: '/api/emails',
      search: '/api/emails/search?q=...',
      auth: '/api/auth/me',
      queues: '/admin/queues',
    },
  });
});

const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 ReachInbox Server running on port ${PORT}`);
  console.log(`📊 Bull Board UI: http://localhost:${PORT}/admin/queues`);
  console.log(`📧 API Base URL:  http://localhost:${PORT}/api/emails`);
  console.log(`=========================================`);
});