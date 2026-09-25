import { Router } from 'express';
import dotenv from 'dotenv';
import prisma from '../config/database';

dotenv.config();

const authRouter = Router();

// Initiate Google OAuth
authRouter.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  if (!clientId || clientId.trim() === '') {
    return res.status(200).json({
      configured: false,
      message: 'Google OAuth is not yet configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.',
      requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'],
    });
  }

  const scope = encodeURIComponent('openid profile email');
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    callbackUrl
  )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  return res.redirect(googleAuthUrl);
});

// Google OAuth callback
authRouter.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Authorization code is missing.' });
  }

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) missing on server.',
    });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;
    if (!tokenResponse.ok) {
      return res.status(400).json({ error: 'Failed to exchange token with Google', details: tokenData });
    }

    // Fetch user profile from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = (await userResponse.json()) as any;

    // Upsert user in database
    let user = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name || googleUser.email.split('@')[0],
        },
      });
    }

    // Redirect to frontend with auth details
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}?auth=success&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return res.status(500).json({ error: 'Failed to complete Google OAuth authentication' });
  }
});

// Current user endpoint
authRouter.get('/me', async (req, res) => {
  const defaultEmail = process.env.SMTP_FROM || 'reachinbox-user@reachinbox.ai';
  let user = await prisma.user.findUnique({
    where: { email: defaultEmail },
  });

  if (!user) {
    user = await prisma.user.findFirst();
  }

  res.json({
    authenticated: true,
    user: user || {
      id: 1,
      email: defaultEmail,
      name: 'ReachInbox User',
    },
    googleOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

// Logout endpoint
authRouter.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default authRouter;
