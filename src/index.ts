import { Hono } from 'hono';
import { handleClaim } from './routes/claim';
import { handleGetPlate } from './routes/plate';
import { handleSubmit } from './routes/submit';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.post('/api/submit', handleSubmit);
app.get('/api/plate/:plate', handleGetPlate);
app.post('/api/claim', handleClaim);

// run_worker_first is enabled for all routes, so non-API requests fall
// through here to be served from the static asset bundle.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
