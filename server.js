import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Helpers ----------

const VALID_TAGS = new Set(["praise", "warning", "parking", "funny", "general"]);
const REPORT_HIDE_THRESHOLD = 3;

function normalizePlate(raw) {
  if (typeof raw !== "string") return null;
  const plate = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length < 2 || plate.length > 10) return null;
  return plate;
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

const commentColumns = `
  id, author, text, tag, votes, reports, created_at,
  CASE WHEN hidden = 1 OR reports >= ${REPORT_HIDE_THRESHOLD} THEN 1 ELSE 0 END AS is_hidden
`;

function serializeComment(row) {
  const hidden = row.is_hidden === 1;
  return {
    id: row.id,
    author: hidden ? null : row.author,
    text: hidden ? null : row.text,
    tag: row.tag,
    votes: row.votes,
    hidden,
    created_at: row.created_at,
  };
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
    return res.json({ plate, country: null, comments: [], stats: { total: 0, praise: 0, warning: 0 } });
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
       FROM comments WHERE plate_id = ? AND hidden = 0 AND reports < ${REPORT_HIDE_THRESHOLD}`
    )
    .get(plateRow.id);

  res.json({ plate: plateRow.plate, country: plateRow.country, comments, stats });
});

// Post a comment on a plate (creates the plate on first comment).
app.post("/api/plates/:plate/comments", rateLimit("comment", 5, 60_000), (req, res) => {
  const plate = normalizePlate(req.params.plate);
  if (!plate) return res.status(400).json({ error: "Invalid plate. Use 2–10 letters/digits." });

  const { author, text, tag, country } = req.body || {};

  if (typeof text !== "string" || text.trim().length < 3) {
    return res.status(400).json({ error: "Comment must be at least 3 characters." });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: "Comment must be 500 characters or fewer." });
  }
  const cleanAuthor = typeof author === "string" && author.trim() ? author.trim().slice(0, 40) : "Anonymous";
  const cleanTag = VALID_TAGS.has(tag) ? tag : "general";
  const cleanCountry = typeof country === "string" && /^[A-Z]{1,3}$/.test(country) ? country : "PL";

  const insert = db.transaction(() => {
    db.prepare("INSERT INTO plates (plate, country) VALUES (?, ?) ON CONFLICT(plate) DO NOTHING").run(
      plate,
      cleanCountry
    );
    const plateRow = db.prepare("SELECT id FROM plates WHERE plate = ?").get(plate);
    const result = db
      .prepare("INSERT INTO comments (plate_id, author, text, tag) VALUES (?, ?, ?, ?)")
      .run(plateRow.id, cleanAuthor, text.trim(), cleanTag);
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

// Report a comment; auto-hidden once it crosses the threshold.
app.post("/api/comments/:id/report", rateLimit("report", 10, 60_000), (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare("UPDATE comments SET reports = reports + 1 WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Comment not found." });
  const row = db.prepare("SELECT reports FROM comments WHERE id = ?").get(id);
  res.json({ id, hidden: row.reports >= REPORT_HIDE_THRESHOLD });
});

app.listen(PORT, () => {
  console.log(`Carbook running at http://localhost:${PORT}`);
});
