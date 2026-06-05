import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function signToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, username, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    res.status(409).json({ error: 'Email or username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
    select: { id: true, email: true, username: true, createdAt: true },
  });

  res.status(201).json({ user, token: signToken(user.id) });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  res.json({
    user: { id: user.id, email: user.email, username: user.username },
    token: signToken(user.id),
  });
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      username: true,
      bio: true,
      createdAt: true,
      _count: { select: { songRatings: true, intervalRatings: true } },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

router.get('/profile/:username', async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true,
      username: true,
      bio: true,
      createdAt: true,
      songRatings: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          rating: true,
          updatedAt: true,
          song: { select: { id: true, title: true, artist: true, albumArtUrl: true } },
        },
      },
      intervalRatings: {
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          rating: true,
          startMs: true,
          endMs: true,
          updatedAt: true,
          song: { select: { id: true, title: true, artist: true, albumArtUrl: true, durationMs: true } },
        },
      },
      _count: { select: { songRatings: true, intervalRatings: true } },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Count unique songs the user has contributed to (song rating OR interval rating)
  const [{ count: songsContributed }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT "songId") as count FROM (
      SELECT "songId" FROM "SongRating" WHERE "userId" = ${user.id}
      UNION
      SELECT "songId" FROM "IntervalRating" WHERE "userId" = ${user.id}
    ) combined
  `;

  res.json({ ...user, songsContributed: Number(songsContributed) });
});

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Always respond with success to prevent email enumeration
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    token: z.string(),
    password: z.string().min(8),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { token, password } = parsed.data;

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired reset link.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } }),
  ]);

  res.json({ message: 'Password updated successfully.' });
});

export default router;
