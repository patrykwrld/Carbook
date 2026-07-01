import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleClaim } from './routes/claim';
import { handleGetPlate } from './routes/plate';
import { handleSubmit } from './routes/submit';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// The frontend may be hosted on a different origin (e.g. Vercel) than this
// Worker. There's no cookie/session auth to protect, so open CORS on the
// API routes is safe — it doesn't weaken the KV/D1 abuse controls, which
// apply regardless of caller origin.
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST'] }));

app.post('/api/submit', handleSubmit);
app.get('/api/plate/:plate', handleGetPlate);
app.post('/api/claim', handleClaim);

// run_worker_first is enabled for all routes, so non-API requests fall
// through here to be served from the static asset bundle.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
