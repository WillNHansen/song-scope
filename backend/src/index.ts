import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRouter from './routes/auth';
import songsRouter from './routes/songs';
import ratingsRouter from './routes/ratings';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

app.use('/api/auth', authRouter);
app.use('/api/songs', songsRouter);
app.use('/api/ratings', ratingsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`SongScope API running on port ${config.port}`);
});
