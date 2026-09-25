import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { emailQueue } from '../queues/emailQueue';
import { searchEmails } from '../services/searchService';

const emailRouter = Router();

// Search emails (Elasticsearch with PostgreSQL fallback)
emailRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const result = await searchEmails(q);
    res.json(result);
  } catch (error) {
    console.error('[EmailRoutes] Search error:', error);
    res.status(500).json({ message: 'Failed to search emails.' });
  }
});

// Schedule single or batch emails
emailRouter.post('/send-email', async (req: Request, res: Response) => {
  try {
    const {
      fromEmail,
      toEmail,
      subject,
      body,
      scheduledAt,
      delay,
      hourlyLimit,
      recipients,
    } = req.body;

    if (!fromEmail || !subject || !body || !scheduledAt) {
      return res.status(400).json({
        message: 'Please provide fromEmail, subject, body and scheduledAt.',
      });
    }

    let emailList: string[] = [];

    if (Array.isArray(recipients) && recipients.length > 0) {
      emailList = recipients.map((r: string) => String(r).trim()).filter((r: string) => r.includes('@'));
    } else if (toEmail) {
      emailList = [String(toEmail).trim()];
    } else {
      return res.status(400).json({
        message: 'Please provide at least one valid recipient.',
      });
    }

    if (emailList.length === 0) {
      return res.status(400).json({
        message: 'No valid recipient email addresses found.',
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid scheduled date format.',
      });
    }

    if (scheduledDate.getTime() < Date.now() - 60000) {
      return res.status(400).json({
        message: 'Scheduled time must be in the future.',
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: fromEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: fromEmail },
      });
    }

    const createdEmails: number[] = [];
    const stepDelaySeconds = Number(delay) || 0;

    for (let i = 0; i < emailList.length; i++) {
      const recipient = emailList[i]!;

      // Create scheduled email record in database
      const email = await prisma.email.create({
        data: {
          fromEmail,
          toEmail: recipient,
          subject,
          body,
          status: 'SCHEDULED',
          scheduleAt: scheduledDate,
          userId: user.id,
        },
      });

      // Calculate staggered delay for each recipient
      const baseDelay = scheduledDate.getTime() - Date.now();
      const emailDelay = Math.max(0, baseDelay + i * stepDelaySeconds * 1000);

      // Add job to BullMQ queue
      await emailQueue.add(
        'send-email',
        {
          emailId: email.id,
          to: recipient,
          subject,
          body,
          hourlyLimit: Number(hourlyLimit || 100),
        },
        {
          delay: emailDelay,
          jobId: `email-${email.id}`,
        }
      );

      createdEmails.push(email.id);
    }

    res.status(201).json({
      message: 'Email(s) scheduled successfully.',
      recipientCount: emailList.length,
      emailIds: createdEmails,
    });
  } catch (error) {
    console.error('[EmailRoutes] Failed to schedule email:', error);
    res.status(500).json({
      message: 'Failed to schedule email.',
    });
  }
});

// List all emails
emailRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const whereClause: any = {};
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const emails = await prisma.email.findMany({
      where: whereClause,
      orderBy: {
        scheduleAt: 'desc',
      },
    });

    res.json(emails);
  } catch (error) {
    console.error('[EmailRoutes] Error fetching emails:', error);
    res.status(500).json({
      message: 'Failed to fetch emails.',
    });
  }
});

// Cancel / Delete a scheduled email
emailRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const emailId = Number(req.params.id);
    if (isNaN(emailId)) {
      return res.status(400).json({ message: 'Invalid email ID.' });
    }

    const email = await prisma.email.findUnique({
      where: { id: emailId },
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found.' });
    }

    // Guard: Prevent cancelling/deleting SENT emails
    if (email.status === 'SENT') {
      return res.status(400).json({
        message: 'Cannot cancel an email that has already been sent. Sent emails are preserved in history.',
      });
    }

    // Try to remove from BullMQ queue
    try {
      const job = await emailQueue.getJob(`email-${emailId}`);
      if (job) {
        await job.remove();
      }
    } catch (jobErr) {
      console.warn('[EmailRoutes] Job removal from queue skipped:', jobErr);
    }

    await prisma.email.delete({
      where: { id: emailId },
    });

    res.json({ message: 'Scheduled email cancelled and removed successfully.' });
  } catch (error) {
    console.error('[EmailRoutes] Error deleting email:', error);
    res.status(500).json({ message: 'Failed to cancel email.' });
  }
});

export default emailRouter;