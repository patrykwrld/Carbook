import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (Fly, Railway, nginx…) set TRUST_PROXY so the
// rate limiter sees real client IPs instead of the proxy's.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === "true");
}
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", setHeaders: (res, p) => {
  if (p.endsWith(".woff2")) res.set("Cache-Control", "public, max-age=31536000, immutable");
} }));

// ---------- Helpers ----------

const VALID_TAGS = new Set(["praise", "warning", "parking", "funny", "general"]);
const VALID_REACTIONS = new Set(["🔥", "👍", "😂", "😡"]);
const REPORT_HIDE_THRESHOLD = 3;
const MAX_PHOTO_BYTES = 500 * 1024;

function normalizePlate(raw) {
  if (typeof raw !== "string") return null;
  const plate = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length < 2 || plate.length > 10) return null;
  return plate;
}

// All-ages board: mask common profanity while keeping the message readable.
const PROFANITY = /\b(fuck\w*|shit\w*|bitch\w*|asshole\w*|cunt\w*|dick(?:head)?s?|bastard\w*|wanker\w*|twat\w*|prick\w*|bollocks|piss(?:ed|es)?)\b/gi;
function maskProfanity(text) {
  return text.replace(PROFANITY, (word) => word[0] + "*".repeat(word.length - 2) + word[word.length - 1]);
}

// Simple fixed-window rate limiter (per IP, per bucket), no extra deps.
const rateBuckets = new Map();
function rateLimit(bucket, limit, windowMs) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      return res.status(429).json({ error: "Slow down — too many requests. Try again in a minute." });
    }
    entry.count++;
    next();
  };
}
// Prevent unbounded growth of the limiter map.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) {
    if (now > entry.resetAt) rateBuckets.delete(key);
  }
}, 60_000).unref();

const visibleCond = `hidden = 0 AND reports < ${REPORT_HIDE_THRESHOLD}`;

const commentColumns = `
  id, author, text, tag, votes, reports, created_at,
  photo_mime IS NOT NULL AS has_photo,
  CASE WHEN hidden = 1 OR reports >= ${REPORT_HIDE_THRESHOLD} THEN 1 ELSE 0 END AS is_hidden
`;

const reactionsForComment = db.prepare(
  "SELECT emoji, count FROM reactions WHERE comment_id = ? AND count > 0"
);

function serializeComment(row) {
  const hidden = row.is_hidden === 1;
  return {
    id: row.id,
    author: hidden ? null : row.author,
    text: hidden ? null : row.text,
    tag: row.tag,
    votes: row.votes,
    hidden,
    has_photo: !hidden && row.has_photo === 1,
    reactions: hidden
      ? {}
      : Object.fromEntries(reactionsForComment.all(row.id).map((r) => [r.emoji, r.count])),
    created_at: row.created_at,
  };
}

// Per-plate reputation: praise counts up, warning/parking count down, upvotes
// amplify. Raw sum is mapped onto 0–100 with a bounded curve.
const reputationExpr = `
  SUM(
    CASE WHEN c.tag = 'praise' THEN 1 WHEN c.tag IN ('warning', 'parking') THEN -1 ELSE 0 END
    * (1 + 0.25 * MAX(0, c.votes))
  )
`;

function reputationFromRaw(raw) {
  if (raw === null || raw === undefined) return { score: 50, label: "Neutral" };
  const score = Math.round(50 + (50 * raw) / (Math.abs(raw) + 4));
  const label = score >= 75 ? "Excellent" : score >= 55 ? "Good" : score >= 45 ? "Neutral" : "Poor";
  return { score, label };
}

// ---------- API ----------

// Recent activity feed for the home page.
app.get("/api/activity", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.plate, p.country, c.tag, c.created_at,
              CASE WHEN c.hidden = 1 OR c.reports >= ${REPORT_HIDE_THRESHOLD} THEN NULL ELSE substr(c.text, 1, 120) END AS preview
       FROM comments c
       JOIN plates p ON p.id = c.plate_id
       ORDER BY c.id DESC
       LIMIT 12`
    )
    .all();
  res.json(rows.filter((r) => r.preview !== null));
});

// Home page leaderboards: best/worst reputation and most active this week.
app.get("/api/leaderboards", (req, res) => {
  const ranked = db
    .prepare(
      `SELECT p.plate, COUNT(c.id) AS comment_count, ${reputationExpr} AS raw
       FROM plates p
       JOIN comments c ON c.plate_id = p.id AND ${visibleCond}
       GROUP BY p.id
       HAVING comment_count >= 2
       ORDER BY raw DESC`
    )
    .all()
    .map((r) => ({ plate: r.plate, comment_count: r.comment_count, reputation: reputationFromRaw(r.raw) }));

  const trending = db
    .prepare(
      `SELECT p.plate, COUNT(c.id) AS comment_count, ${reputationExpr} AS raw
       FROM plates p
       JOIN comments c ON c.plate_id = p.id AND ${visibleCond}
       WHERE c.created_at >= datetime('now', '-7 days')
       GROUP BY p.id
       ORDER BY comment_count DESC
       LIMIT 5`
    )
    .all()
    .map((r) => ({ plate: r.plate, comment_count: r.comment_count, reputation: reputationFromRaw(r.raw) }));

  res.json({
    praised: ranked.filter((r) => r.reputation.score >= 55).slice(0, 5),
    reported: ranked.filter((r) => r.reputation.score < 50).reverse().slice(0, 5),
    trending,
  });
});

// Search plates by prefix.
app.get("/api/search", (req, res) => {
  const q = normalizePlate(String(req.query.q || ""));
  if (!q) return res.json([]);
  const rows = db
    .prepare(
      `SELECT p.plate, p.country, COUNT(c.id) AS comment_count
       FROM plates p
       LEFT JOIN comments c ON c.plate_id = p.id
       WHERE p.plate LIKE ? || '%'
       GROUP BY p.id
       ORDER BY comment_count DESC
       LIMIT 10`
    )
    .all(q);
  res.json(rows);
});

// Get a plate with its comments (creates nothing; unknown plates return empty).
app.get("/api/plates/:plate", (req, res) => {
  const plate = normalizePlate(req.params.plate);
  if (!plate) return res.status(400).json({ error: "Invalid plate. Use 2–10 letters/digits." });

  const plateRow = db.prepare("SELECT id, plate, country FROM plates WHERE plate = ?").get(plate);
  if (!plateRow) {
    return res.json({
      plate,
      country: null,
      comments: [],
      stats: { total: 0, praise: 0, warning: 0 },
      reputation: reputationFromRaw(null),
    });
  }

  const comments = db
    .prepare(`SELECT ${commentColumns} FROM comments WHERE plate_id = ? ORDER BY votes DESC, id DESC LIMIT 200`)
    .all(plateRow.id)
    .map(serializeComment);

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN tag = 'praise' THEN 1 ELSE 0 END) AS praise,
              SUM(CASE WHEN tag IN ('warning', 'parking') THEN 1 ELSE 0 END) AS warning
       FROM comments WHERE plate_id = ? AND ${visibleCond}`
    )
    .get(plateRow.id);

  const rep = db
    .prepare(`SELECT ${reputationExpr} AS raw FROM comments c WHERE c.plate_id = ? AND ${visibleCond}`)
    .get(plateRow.id);

  res.json({
    plate: plateRow.plate,
    country: plateRow.country,
    comments,
    stats,
    reputation: reputationFromRaw(rep?.raw),
  });
});

// Insights data for the per-plate dashboard.
app.get("/api/plates/:plate/stats", (req, res) => {
  const plate = normalizePlate(req.params.plate);
  if (!plate) return res.status(400).json({ error: "Invalid plate. Use 2–10 letters/digits." });

  const plateRow = db.prepare("SELECT id FROM plates WHERE plate = ?").get(plate);
  if (!plateRow) return res.json({ timeline: [], tags: {}, sentiment: { positive: 0, negative: 0, neutral: 0 } });

  const timeline = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
       FROM comments
       WHERE plate_id = ? AND ${visibleCond} AND created_at >= datetime('now', '-30 days')
       GROUP BY day ORDER BY day`
    )
    .all(plateRow.id);

  const tagRows = db
    .prepare(`SELECT tag, COUNT(*) AS count FROM comments WHERE plate_id = ? AND ${visibleCond} GROUP BY tag`)
    .all(plateRow.id);
  const tags = Object.fromEntries(tagRows.map((r) => [r.tag, r.count]));

  const sentiment = {
    positive: tags.praise || 0,
    negative: (tags.warning || 0) + (tags.parking || 0),
    neutral: (tags.funny || 0) + (tags.general || 0),
  };

  res.json({ timeline, tags, sentiment });
});

// Photo attached to a comment; hidden comments never serve their photo.
app.get("/api/photos/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT photo, photo_mime FROM comments
       WHERE id = ? AND photo IS NOT NULL AND ${visibleCond}`
    )
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Photo not found." });
  res.set("Content-Type", row.photo_mime);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(row.photo);
});

function parsePhoto(photo) {
  if (photo === undefined || photo === null || photo === "") return { buffer: null, mime: null };
  if (typeof photo !== "string") return { error: "Invalid photo." };
  const match = photo.match(/^data:(image\/jpeg|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { error: "Photo must be a JPEG or WebP data URL." };
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return { error: "Invalid photo." };
  if (buffer.length > MAX_PHOTO_BYTES) return { error: "Photo must be 500 KB or smaller." };
  return { buffer, mime: match[1] };
}

// Post a comment on a plate (creates the plate on first comment).
app.post("/api/plates/:plate/comments", rateLimit("comment", 5, 60_000), (req, res) => {
  const plate = normalizePlate(req.params.plate);
  if (!plate) return res.status(400).json({ error: "Invalid plate. Use 2–10 letters/digits." });

  const { author, text, tag, country, photo } = req.body || {};

  if (typeof text !== "string" || text.trim().length < 3) {
    return res.status(400).json({ error: "Comment must be at least 3 characters." });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: "Comment must be 500 characters or fewer." });
  }
  const parsedPhoto = parsePhoto(photo);
  if (parsedPhoto.error) return res.status(400).json({ error: parsedPhoto.error });

  const cleanAuthor = maskProfanity(
    typeof author === "string" && author.trim() ? author.trim().slice(0, 40) : "Anonymous"
  );
  const cleanText = maskProfanity(text.trim());
  const cleanTag = VALID_TAGS.has(tag) ? tag : "general";
  const cleanCountry = typeof country === "string" && /^[A-Z]{1,3}$/.test(country) ? country : "GB";

  const insert = db.transaction(() => {
    db.prepare("INSERT INTO plates (plate, country) VALUES (?, ?) ON CONFLICT(plate) DO NOTHING").run(
      plate,
      cleanCountry
    );
    const plateRow = db.prepare("SELECT id FROM plates WHERE plate = ?").get(plate);
    const result = db
      .prepare("INSERT INTO comments (plate_id, author, text, tag, photo, photo_mime) VALUES (?, ?, ?, ?, ?, ?)")
      .run(plateRow.id, cleanAuthor, cleanText, cleanTag, parsedPhoto.buffer, parsedPhoto.mime);
    return result.lastInsertRowid;
  });

  const id = insert();
  const row = db.prepare(`SELECT ${commentColumns} FROM comments WHERE id = ?`).get(id);
  res.status(201).json(serializeComment(row));
});

// Vote a comment up or down.
app.post("/api/comments/:id/vote", rateLimit("vote", 30, 60_000), (req, res) => {
  const id = Number(req.params.id);
  const dir = req.body?.dir === "down" ? -1 : 1;
  const result = db.prepare("UPDATE comments SET votes = votes + ? WHERE id = ?").run(dir, id);
  if (result.changes === 0) return res.status(404).json({ error: "Comment not found." });
  const row = db.prepare("SELECT votes FROM comments WHERE id = ?").get(id);
  res.json({ id, votes: row.votes });
});

// React to a comment with an emoji from the allowlist.
app.post("/api/comments/:id/react", rateLimit("react", 30, 60_000), (req, res) => {
  const id = Number(req.params.id);
  const emoji = req.body?.emoji;
  if (!VALID_REACTIONS.has(emoji)) return res.status(400).json({ error: "Unsupported reaction." });

  const comment = db.prepare(`SELECT id FROM comments WHERE id = ? AND ${visibleCond}`).get(id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });

  db.prepare(
    `INSERT INTO reactions (comment_id, emoji, count) VALUES (?, ?, 1)
     ON CONFLICT(comment_id, emoji) DO UPDATE SET count = count + 1`
  ).run(id, emoji);

  const reactions = Object.fromEntries(reactionsForComment.all(id).map((r) => [r.emoji, r.count]));
  res.json({ id, reactions });
});

// Report a comment; auto-hidden once it crosses the threshold.
app.post("/api/comments/:id/report", rateLimit("report", 10, 60_000), (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare("UPDATE comments SET reports = reports + 1 WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Comment not found." });
  const row = db.prepare("SELECT reports FROM comments WHERE id = ?").get(id);
  res.json({ id, hidden: row.reports >= REPORT_HIDE_THRESHOLD });
});

// Liveness probe for orchestrators and uptime monitors.
app.get("/healthz", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Carbook running at http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
