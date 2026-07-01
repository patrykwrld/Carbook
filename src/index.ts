import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleCreateComment, handleGetPlate } from './routes/comments';
import { handleFlagComment } from './routes/flag';
import { handleGetImage } from './routes/image';
import { handleTrending } from './routes/trending';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// The frontend may be hosted on a different origin than this Worker (e.g.
// Vercel). There's no cookie/session auth to protect, so open CORS on the
// API routes is safe — it doesn't weaken the KV/D1 abuse controls, which
// apply regardless of caller origin.
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));

app.post('/api/comments', handleCreateComment);
app.post('/api/comments/:id/flag', handleFlagComment);
app.get('/api/plate/:plate', handleGetPlate);
app.get('/api/trending', handleTrending);
app.get('/api/image/:key', handleGetImage);

// run_worker_first is enabled for all routes, so non-API requests fall
// through here to be served from the static asset bundle.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
