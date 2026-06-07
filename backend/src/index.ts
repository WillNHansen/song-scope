import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRouter from './routes/auth';
import songsRouter from './routes/songs';
import ratingsRouter from './routes/ratings';
import spotifyRouter from './routes/spotify';
import { errorHandler } from './middleware/errorHandler';

// Crash immediately in production if critical secrets are missing
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required in production');
  if (!process.env.SPOTIFY_CLIENT_ID) throw new Error('SPOTIFY_CLIENT_ID env var is required in production');
  if (!process.env.SPOTIFY_CLIENT_SECRET) throw new Error('SPOTIFY_CLIENT_SECRET env var is required in production');
}

const app = express();

// Trust Railway's proxy so rate limiting and IP detection work correctly
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser requests
    const allowed = [
      config.frontendUrl,
      /^https:\/\/song-scope[a-z0-9-]*\.vercel\.app$/,
    ];
    const ok = allowed.some((r) =>
      typeof r === 'string' ? r === origin : r.test(origin)
    );
    callback(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  credentials: true,
}));
app.use(express.json());

// General rate limit
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/songs', songsRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api/auth/spotify', spotifyRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`SongScope API running on port ${config.port}`);
});
