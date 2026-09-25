import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export async function sendEmail(
  to: string,
  subject: string,
  body: string
) {
  const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user,
      pass,
    },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });

  console.log('Email sent successfully');
  console.log('Message ID:', info.messageId);

  // If using Ethereal, log preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('Preview URL:', previewUrl);
  }

  return info;
}