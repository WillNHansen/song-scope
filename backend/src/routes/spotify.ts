import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const SCOPES = 'streaming user-read-email user-read-private';

// Step 1: redirect user to Spotify login
router.get('/connect', requireAuth, (req: AuthRequest, res: Response) => {
  const state = req.userId!; // embed userId in state so callback knows who to save to
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: SCOPES,
    redirect_uri: config.spotify.redirectUri,
    state,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2: Spotify redirects back here with a code
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state: userId, error } = req.query as Record<string, string>;

  if (error || !code || !userId) {
    res.redirect(`${config.frontendUrl}/?spotify=error`);
    return;
  }

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.spotify.redirectUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.spotify.clientId}:${config.spotify.clientSecret}`
          ).toString('base64')}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiry = new Date(Date.now() + expires_in * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        spotifyAccessToken: access_token,
        spotifyRefreshToken: refresh_token,
        spotifyTokenExpiry: expiry,
      },
    });

    res.redirect(`${config.frontendUrl}/?spotify=connected`);
  } catch (err) {
    console.error('Spotify callback error:', err);
    res.redirect(`${config.frontendUrl}/?spotify=error`);
  }
});

// Refresh token — called by frontend when access token is expired
router.post('/refresh', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { spotifyRefreshToken: true },
  });

  if (!user?.spotifyRefreshToken) {
    res.status(400).json({ error: 'No Spotify account connected' });
    return;
  }

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.spotifyRefreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.spotify.clientId}:${config.spotify.clientSecret}`
          ).toString('base64')}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiry = new Date(Date.now() + expires_in * 1000);

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        spotifyAccessToken: access_token,
        spotifyTokenExpiry: expiry,
        // Spotify sometimes rotates the refresh token
        ...(refresh_token ? { spotifyRefreshToken: refresh_token } : {}),
      },
    });

    res.json({ accessToken: access_token, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('Spotify refresh error:', err);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

// Get current Spotify token for this user (and refresh if needed)
router.get('/token', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { spotifyAccessToken: true, spotifyRefreshToken: true, spotifyTokenExpiry: true },
  });

  if (!user?.spotifyAccessToken || !user.spotifyRefreshToken) {
    res.status(404).json({ error: 'No Spotify account connected' });
    return;
  }

  // If token expires within 60s, proactively refresh
  const expiresAt = user.spotifyTokenExpiry;
  if (!expiresAt || expiresAt.getTime() - Date.now() < 60_000) {
    try {
      const tokenRes = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: user.spotifyRefreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${config.spotify.clientId}:${config.spotify.clientSecret}`
            ).toString('base64')}`,
          },
        }
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;
      const newExpiry = new Date(Date.now() + expires_in * 1000);

      await prisma.user.update({
        where: { id: req.userId },
        data: {
          spotifyAccessToken: access_token,
          spotifyTokenExpiry: newExpiry,
          ...(refresh_token ? { spotifyRefreshToken: refresh_token } : {}),
        },
      });

      res.json({ accessToken: access_token, expiresAt: newExpiry.toISOString() });
      return;
    } catch {
      res.status(401).json({ error: 'Token refresh failed, please reconnect Spotify' });
      return;
    }
  }

  res.json({ accessToken: user.spotifyAccessToken, expiresAt: expiresAt.toISOString() });
});

// Disconnect Spotify
router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.user.update({
    where: { id: req.userId },
    data: {
      spotifyAccessToken: null,
      spotifyRefreshToken: null,
      spotifyTokenExpiry: null,
    },
  });
  res.json({ ok: true });
});

export default router;
