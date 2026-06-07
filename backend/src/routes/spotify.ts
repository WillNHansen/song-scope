import { Router, Request, Response } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

function basicAuth() {
  return `Basic ${Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64')}`;
}

// Step 1: redirect to Spotify — accepts JWT as ?token= because browser redirects can't send headers
router.get('/connect', (req: Request, res: Response): void => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotify.clientId,
      scope: SCOPES,
      redirect_uri: config.spotify.redirectUri,
      state: payload.userId,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Step 2: Spotify redirects back with a code
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state: userId, error } = req.query as Record<string, string>;
  if (error || !code || !userId) {
    res.redirect(`${config.frontendUrl}/?spotify=error`);
    return;
  }
  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.spotify.redirectUri }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() } }
    );
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    await prisma.user.update({
      where: { id: userId },
      data: {
        spotifyAccessToken: access_token,
        spotifyRefreshToken: refresh_token,
        spotifyTokenExpiry: new Date(Date.now() + expires_in * 1000),
      },
    });
    res.redirect(`${config.frontendUrl}/?spotify=connected`);
  } catch (err) {
    console.error('Spotify callback error:', err);
    res.redirect(`${config.frontendUrl}/?spotify=error`);
  }
});

async function refreshAccessToken(refreshToken: string) {
  const tokenRes = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() } }
  );
  return tokenRes.data as { access_token: string; refresh_token?: string; expires_in: number };
}

// Get a valid access token for the current user (refreshes if needed)
router.get('/token', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { spotifyAccessToken: true, spotifyRefreshToken: true, spotifyTokenExpiry: true },
  });
  if (!user?.spotifyRefreshToken) { res.status(404).json({ error: 'No Spotify account connected' }); return; }

  // Refresh proactively if expiring within 60s
  if (!user.spotifyTokenExpiry || user.spotifyTokenExpiry.getTime() - Date.now() < 60_000) {
    try {
      const data = await refreshAccessToken(user.spotifyRefreshToken);
      const expiry = new Date(Date.now() + data.expires_in * 1000);
      await prisma.user.update({
        where: { id: req.userId },
        data: {
          spotifyAccessToken: data.access_token,
          spotifyTokenExpiry: expiry,
          ...(data.refresh_token ? { spotifyRefreshToken: data.refresh_token } : {}),
        },
      });
      res.json({ accessToken: data.access_token, expiresAt: expiry.toISOString() });
    } catch {
      res.status(401).json({ error: 'Token refresh failed — please reconnect Spotify' });
    }
    return;
  }

  res.json({ accessToken: user.spotifyAccessToken, expiresAt: user.spotifyTokenExpiry.toISOString() });
});

// Disconnect Spotify
router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { spotifyAccessToken: null, spotifyRefreshToken: null, spotifyTokenExpiry: null },
  });
  res.json({ ok: true });
});

export default router;
