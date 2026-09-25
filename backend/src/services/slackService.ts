import { redisClient } from '../config/redis';

export async function sendSlackNotification(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl || webhookUrl.trim() === '') {
    console.log('[Slack] SLACK_WEBHOOK_URL not configured. Skipping notification.');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error(`[Slack] Webhook failed with status ${response.status}`);
      return false;
    }

    console.log('[Slack] Notification sent successfully');
    return true;
  } catch (error) {
    console.error('[Slack] Error sending webhook notification:', error);
    return false;
  }
}

export async function notifyRateLimitReached(
  fromEmail: string,
  limit: number,
  nextHour: Date
): Promise<void> {
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);
  const hourKey = currentHour.toISOString().slice(0, 13);
  const alertDedupeKey = `slack-alert-sent:${fromEmail}:${hourKey}`;

  // Check if we already alerted for this sender this hour
  const alreadySent = await redisClient.get(alertDedupeKey);
  if (alreadySent) {
    return;
  }

  const message = `⚠️ *ReachInbox Hourly Rate Limit Reached*\n` +
    `• *Sender:* \`${fromEmail}\`\n` +
    `• *Configured Limit:* \`${limit}\` emails/hour\n` +
    `• *Action Taken:* Excess emails have been delayed and rescheduled for \`${nextHour.toISOString()}\`.\n` +
    `• *Time:* ${new Date().toLocaleString()}`;

  const sent = await sendSlackNotification(message);
  if (sent) {
    // Deduplicate for 1 hour
    await redisClient.set(alertDedupeKey, '1', 'EX', 3600);
  }
}
