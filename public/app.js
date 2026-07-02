"use strict";

const $ = (id) => document.getElementById(id);

const viewHome = $("view-home");
const viewPlate = $("view-plate");
const searchForm = $("search-form");
const searchInput = $("search-input");
const suggestions = $("search-suggestions");
const activityList = $("activity-list");
const plateNumber = $("plate-number");
const plateStats = $("plate-stats");
const commentForm = $("comment-form");
const commentsList = $("comments-list");
const commentText = $("comment-text");
const charCount = $("char-count");
const formError = $("form-error");
const insights = $("insights");
const insightsBody = $("insights-body");
const photoInput = $("photo-input");
const photoPreview = $("photo-preview");
const photoPreviewImg = $("photo-preview-img");
const lightbox = $("lightbox");
const lightboxImg = $("lightbox-img");

const TAG_META = {
  praise: { icon: "👏", label: "Nice driving" },
  warning: { icon: "⚠️", label: "Careless driving" },
  parking: { icon: "🅿️", label: "Parking issue" },
  funny: { icon: "😄", label: "Funny moment" },
  general: { icon: "💬", label: "General" },
};
const REACTIONS = ["🔥", "👍", "😂", "😡"];

// Chart palette — validated with the dataviz six-checks script on white.
const CHART = {
  bar: "#a8752f",
  positive: "#2a78d6",
  negative: "#e34948",
  neutral: "#e5e1d7",
  grid: "#ddd8cc",
  ink: "#8c877d",
};

let currentPlate = null;
let pendingPhoto = null; // data URL awaiting submit

// ---------- API ----------

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Toasts ----------

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  $("toast-container").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2600);
}

// ---------- Routing ----------

function showHome() {
  currentPlate = null;
  $("sticky-bar").classList.remove("visible");
  viewPlate.classList.add("hidden");
  viewHome.classList.remove("hidden");
  if (location.hash) history.pushState(null, "", location.pathname);
  loadActivity();
  loadLeaderboards();
}

function showPlate(plate) {
  currentPlate = plate;
  viewHome.classList.add("hidden");
  viewPlate.classList.remove("hidden");
  plateNumber.textContent = plate;
  $("sticky-plate").textContent = plate;
  $("sticky-score").textContent = "–";
  if (location.hash.slice(1) !== plate) location.hash = plate;
  insights.open = false;
  insightsLoaded = false;
  resetReputation();
  loadPlate(plate);
}

function handleHash() {
  const plate = normalize(location.hash.slice(1));
  if (plate && plate.length >= 2) showPlate(plate);
  else showHome();
}

function normalize(raw) {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

// ---------- Home: standings ----------

async function loadLeaderboards() {
  try {
    const boards = await api("/api/leaderboards");
    for (const name of ["praised", "reported", "trending"]) {
      renderBoard($(`board-${name}`), boards[name] || []);
    }
  } catch {
    for (const name of ["praised", "reported", "trending"]) {
      $(`board-${name}`).innerHTML = '<p class="board-empty">Could not load.</p>';
    }
  }
}

function renderBoard(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="board-empty">Nothing here yet.</p>';
    return;
  }
  container.innerHTML = "";
  rows.forEach((row, i) => {
    const div = document.createElement("div");
    div.className = "board-row";
    div.style.animationDelay = `${i * 55}ms`;
    const scoreClass = row.reputation.score >= 55 ? "good" : row.reputation.score < 45 ? "bad" : "";
    div.innerHTML = `
      <span class="board-rank">${i + 1}</span>
      <span class="mini-plate"></span>
      <span class="board-count"></span>
      <span class="board-score ${scoreClass}"></span>`;
    div.querySelector(".mini-plate").textContent = row.plate;
    div.querySelector(".board-count").textContent =
      `${row.comment_count} entr${row.comment_count === 1 ? "y" : "ies"}`;
    div.querySelector(".board-score").textContent = row.reputation.score;
    div.title = `Reputation: ${row.reputation.label}`;
    div.addEventListener("click", () => showPlate(row.plate));
    container.appendChild(div);
  });
}

// ---------- Home: activity ----------

async function loadActivity() {
  try {
    const items = await api("/api/activity");
    if (!items.length) {
      activityList.innerHTML = '<p class="muted">No comments yet — be the first to look up a plate.</p>';
      return;
    }
    activityList.innerHTML = "";
    items.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "activity-item";
      div.style.animationDelay = `${i * 40}ms`;
      div.innerHTML = `
        <span class="activity-tag">${TAG_META[item.tag]?.icon || "💬"}</span>
        <span class="mini-plate"></span>
        <span class="activity-preview"></span>
        <span class="activity-time"></span>`;
      div.querySelector(".mini-plate").textContent = item.plate;
      div.querySelector(".activity-preview").textContent = item.preview;
      div.querySelector(".activity-time").textContent = formatDate(item.created_at);
      div.addEventListener("click", () => showPlate(item.plate));
      activityList.appendChild(div);
    });
  } catch {
    activityList.innerHTML = '<p class="muted">Could not load activity.</p>';
  }
}

// ---------- Search ----------

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const plate = normalize(searchInput.value);
  if (plate.length >= 2) {
    suggestions.classList.add("hidden");
    showPlate(plate);
  }
});

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = normalize(searchInput.value);
  if (q.length < 2) {
    suggestions.classList.add("hidden");
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (!results.length) {
        suggestions.classList.add("hidden");
        return;
      }
      suggestions.innerHTML = "";
      for (const r of results) {
        const li = document.createElement("li");
        const plateSpan = document.createElement("span");
        plateSpan.textContent = r.plate;
        const countSpan = document.createElement("span");
        countSpan.className = "muted";
        countSpan.textContent = `${r.comment_count} comment${r.comment_count === 1 ? "" : "s"}`;
        li.append(plateSpan, countSpan);
        li.addEventListener("click", () => {
          suggestions.classList.add("hidden");
          showPlate(r.plate);
        });
        suggestions.appendChild(li);
      }
      suggestions.classList.remove("hidden");
    } catch {
      suggestions.classList.add("hidden");
    }
  }, 250);
});

// ---------- Plate view ----------

async function loadPlate(plate) {
  commentsList.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  plateStats.innerHTML = "";
  try {
    const data = await api(`/api/plates/${encodeURIComponent(plate)}`);
    renderReputation(data.reputation);
    renderStats(data.stats);
    renderComments(data.comments);
  } catch (err) {
    commentsList.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

const REP_CIRCUMFERENCE = 2 * Math.PI * 42;

function resetReputation() {
  const arc = $("rep-arc");
  arc.style.transition = "none";
  arc.style.strokeDashoffset = REP_CIRCUMFERENCE;
  $("rep-score").textContent = "–";
  $("rep-label").textContent = "Reputation";
}

function renderReputation({ score, label }) {
  const arc = $("rep-arc");
  const scoreText = $("rep-score");
  const color = score >= 55 ? "var(--sage)" : score < 45 ? "var(--red)" : "var(--gold)";
  arc.style.stroke = color;
  requestAnimationFrame(() => {
    arc.style.transition = "";
    arc.style.strokeDashoffset = REP_CIRCUMFERENCE * (1 - score / 100);
  });
  $("rep-label").textContent = label;
  $("sticky-score").textContent = `${score} · ${label}`;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    scoreText.textContent = score;
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 900);
    const eased = 1 - Math.pow(1 - t, 3);
    scoreText.textContent = Math.round(score * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats(stats) {
  plateStats.innerHTML = `
    <span>${stats.total} comment${stats.total === 1 ? "" : "s"}</span>
    <span class="stat-praise">👏 ${stats.praise || 0}</span>
    <span class="stat-warning">⚠️ ${stats.warning || 0}</span>`;
}

// ---------- Share ----------

async function shareCurrent() {
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: `Carbook — ${currentPlate}`, url });
      return;
    } catch {
      /* user cancelled; fall through to clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard");
  } catch {
    toast(url);
  }
}
$("share-btn").addEventListener("click", shareCurrent);
$("sticky-share-btn").addEventListener("click", shareCurrent);

// Slide the compact summary bar in once the plate hero scrolls out of view.
new IntersectionObserver(
  ([entry]) => {
    $("sticky-bar").classList.toggle("visible", !entry.isIntersecting && currentPlate !== null);
  },
  { rootMargin: "-60px 0px 0px 0px" }
).observe($("plate-hero"));

// ---------- Insights (charts) ----------

let insightsLoaded = false;

insights.addEventListener("toggle", () => {
  if (insights.open && !insightsLoaded) loadInsights();
});

async function loadInsights() {
  insightsLoaded = true;
  insightsBody.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div>';
  try {
    const data = await api(`/api/plates/${encodeURIComponent(currentPlate)}/stats`);
    insightsBody.innerHTML = "";
    insightsBody.appendChild(sentimentChart(data.sentiment));
    insightsBody.appendChild(timelineChart(data.timeline));
    insightsBody.appendChild(categoryChart(data.tags));
  } catch {
    insightsBody.innerHTML = '<p class="muted">Could not load insights.</p>';
  }
}

function chartBlock(title) {
  const block = document.createElement("div");
  block.className = "chart-block";
  const h = document.createElement("h4");
  h.textContent = title;
  block.appendChild(h);
  return block;
}

const svgEl = (tag, attrs) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// Sentiment: horizontal stacked proportion bar, diverging poles + neutral,
// 2px surface gaps between segments, direct labels + legend.
function sentimentChart(sentiment) {
  const block = chartBlock("Sentiment");
  const entries = [
    { key: "positive", label: "Positive", color: CHART.positive, value: sentiment.positive },
    { key: "neutral", label: "Neutral", color: CHART.neutral, value: sentiment.neutral },
    { key: "negative", label: "Negative", color: CHART.negative, value: sentiment.negative },
  ];
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (!total) {
    block.insertAdjacentHTML("beforeend", '<p class="muted">No visible comments yet.</p>');
    return block;
  }

  const W = 600, H = 36, GAP = 2;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  let x = 0;
  for (const e of entries) {
    if (!e.value) continue;
    const w = (e.value / total) * (W - GAP * (entries.filter((s) => s.value).length - 1));
    const rect = svgEl("rect", { x, y: 6, width: w, height: 24, rx: 4, fill: e.color });
    rect.appendChild(svgEl("title", {})).textContent =
      `${e.label}: ${e.value} (${Math.round((e.value / total) * 100)}%)`;
    svg.appendChild(rect);
    if (w > 44) {
      const lbl = svgEl("text", {
        x: x + w / 2, y: 22, "text-anchor": "middle",
        "font-size": "12", "font-weight": "600",
        fill: e.key === "neutral" ? "#52514e" : "#ffffff",
      });
      lbl.textContent = e.value;
      svg.appendChild(lbl);
    }
    x += w + GAP;
  }
  block.appendChild(svg);

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  for (const e of entries) {
    legend.insertAdjacentHTML(
      "beforeend",
      `<span><i style="background:${e.color}"></i>${e.label} · ${e.value}</span>`
    );
  }
  block.appendChild(legend);
  return block;
}

// Activity: 30-day column chart, single sequential hue, rounded data-ends,
// hairline baseline, per-bar hover tooltip, max value direct-labeled.
function timelineChart(timeline) {
  const block = chartBlock("Activity — last 30 days");
  const byDay = new Map(timeline.map((t) => [t.day, t.count]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: byDay.get(key) || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));

  const W = 600, H = 120, PLOT_H = 84, BASE = 100;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
  svg.appendChild(svgEl("line", { x1: 0, y1: BASE, x2: W, y2: BASE, stroke: CHART.grid, "stroke-width": 1 }));

  const slot = W / 30;
  const barW = Math.min(12, slot - 2);
  days.forEach((d, i) => {
    const h = d.count ? Math.max(4, (d.count / max) * PLOT_H) : 0;
    const x = i * slot + (slot - barW) / 2;
    if (d.count) {
      const bar = svgEl("rect", {
        x, y: BASE - h, width: barW, height: h,
        rx: 3, fill: CHART.bar,
      });
      bar.appendChild(svgEl("title", {})).textContent = `${d.key}: ${d.count} comment${d.count === 1 ? "" : "s"}`;
      svg.appendChild(bar);
      if (d.count === max) {
        const lbl = svgEl("text", {
          x: Math.min(W - 8, Math.max(8, x + barW / 2)), y: BASE - h - 6,
          "text-anchor": "middle", "font-size": "11", fill: CHART.ink,
        });
        lbl.textContent = d.count;
        svg.appendChild(lbl);
      }
    } else {
      svg.appendChild(svgEl("rect", { x, y: BASE - 2, width: barW, height: 2, rx: 1, fill: CHART.grid }));
    }
    if (i === 0 || i === 29) {
      const lbl = svgEl("text", {
        x: x + barW / 2, y: H - 4,
        "text-anchor": i === 0 ? "start" : "end", "font-size": "10", fill: CHART.ink,
      });
      lbl.textContent = d.key.slice(5).replace("-", "/");
      svg.appendChild(lbl);
    }
  });
  block.appendChild(svg);
  return block;
}

// Categories: horizontal bars, single hue, direct value labels.
function categoryChart(tags) {
  const block = chartBlock("Categories");
  const entries = Object.keys(TAG_META)
    .map((tag) => ({ tag, count: tags[tag] || 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!entries.length) {
    block.insertAdjacentHTML("beforeend", '<p class="muted">No visible comments yet.</p>');
    return block;
  }

  const W = 600, ROW = 30, LABEL_W = 150;
  const max = Math.max(...entries.map((e) => e.count));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${entries.length * ROW}` });
  entries.forEach((e, i) => {
    const y = i * ROW;
    const meta = TAG_META[e.tag];
    const name = svgEl("text", { x: LABEL_W - 10, y: y + 19, "text-anchor": "end", "font-size": "12", fill: "#52514e" });
    name.textContent = `${meta.icon} ${meta.label}`;
    svg.appendChild(name);

    const w = Math.max(4, (e.count / max) * (W - LABEL_W - 40));
    const bar = svgEl("rect", { x: LABEL_W, y: y + 7, width: w, height: 16, rx: 4, fill: CHART.bar });
    bar.appendChild(svgEl("title", {})).textContent = `${meta.label}: ${e.count}`;
    svg.appendChild(bar);

    const val = svgEl("text", { x: LABEL_W + w + 8, y: y + 19, "font-size": "12", fill: CHART.ink });
    val.textContent = e.count;
    svg.appendChild(val);
  });
  block.appendChild(svg);
  return block;
}

// ---------- Comments ----------

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = '<p class="muted">No comments yet. Be the first to leave feedback.</p>';
    return;
  }
  commentsList.innerHTML = "";
  comments.forEach((c, i) => {
    const el = renderComment(c);
    el.style.animationDelay = `${Math.min(i, 8) * 60}ms`;
    commentsList.appendChild(el);
  });
}

function renderComment(c) {
  const div = document.createElement("div");
  div.className = "comment" + (c.hidden ? " hidden-comment" : "");

  const voteCol = document.createElement("div");
  voteCol.className = "vote-col";
  const upBtn = document.createElement("button");
  upBtn.className = "vote-btn";
  upBtn.textContent = "▲";
  upBtn.title = "Agree";
  const count = document.createElement("span");
  count.className = "vote-count" + (c.votes > 0 ? " pos" : c.votes < 0 ? " neg" : "");
  count.textContent = c.votes;
  const downBtn = document.createElement("button");
  downBtn.className = "vote-btn";
  downBtn.textContent = "▼";
  downBtn.title = "Disagree";
  voteCol.append(upBtn, count, downBtn);

  const vote = async (dir) => {
    try {
      const data = await api(`/api/comments/${c.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });
      count.textContent = data.votes;
      count.className = "vote-count" + (data.votes > 0 ? " pos" : data.votes < 0 ? " neg" : "");
    } catch (err) {
      toast(err.message);
    }
  };
  upBtn.addEventListener("click", () => vote("up"));
  downBtn.addEventListener("click", () => vote("down"));

  const body = document.createElement("div");
  body.className = "comment-body";

  if (c.hidden) {
    body.innerHTML = '<p class="comment-text muted">This comment was hidden after community reports.</p>';
    div.append(voteCol, body);
    return div;
  }

  const meta = document.createElement("div");
  meta.className = "comment-meta";
  const author = document.createElement("span");
  author.className = "comment-author";
  author.textContent = c.author;
  const chip = document.createElement("span");
  chip.className = "comment-tag-chip";
  const tagMeta = TAG_META[c.tag] || TAG_META.general;
  chip.textContent = `${tagMeta.icon} ${tagMeta.label}`;
  const date = document.createElement("span");
  date.className = "comment-date";
  date.textContent = formatDate(c.created_at);
  meta.append(author, chip, date);

  const text = document.createElement("p");
  text.className = "comment-text";
  text.textContent = c.text;

  body.append(meta, text);

  if (c.has_photo) {
    const img = document.createElement("img");
    img.className = "comment-photo";
    img.loading = "lazy";
    img.alt = "Photo attached to comment";
    img.src = `/api/photos/${c.id}`;
    img.addEventListener("click", () => openLightbox(img.src));
    body.appendChild(img);
  }

  const actions = document.createElement("div");
  actions.className = "comment-actions";
  for (const emoji of REACTIONS) {
    const btn = document.createElement("button");
    btn.className = "react-btn";
    const countFor = (r) => (r && r[emoji] ? ` ${r[emoji]}` : "");
    btn.textContent = emoji + countFor(c.reactions);
    btn.addEventListener("click", async () => {
      btn.classList.add("reacted");
      try {
        const data = await api(`/api/comments/${c.id}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
        btn.textContent = emoji + countFor(data.reactions);
      } catch (err) {
        btn.classList.remove("reacted");
        toast(err.message);
      }
    });
    actions.appendChild(btn);
  }

  // Two-tap report: first tap arms it, second within 3s confirms.
  const report = document.createElement("button");
  report.className = "report-btn";
  report.textContent = "🚩 Report";
  let armed = false;
  let disarmTimer;
  report.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      report.classList.add("confirming");
      report.textContent = "Tap again to confirm";
      disarmTimer = setTimeout(() => {
        armed = false;
        report.classList.remove("confirming");
        report.textContent = "🚩 Report";
      }, 3000);
      return;
    }
    clearTimeout(disarmTimer);
    try {
      const data = await api(`/api/comments/${c.id}/report`, { method: "POST" });
      report.textContent = "Reported ✓";
      report.disabled = true;
      report.classList.remove("confirming");
      toast("Thanks — this comment was reported.");
      if (data.hidden) loadPlate(currentPlate);
    } catch (err) {
      toast(err.message);
    }
  });
  actions.appendChild(report);
  body.appendChild(actions);

  div.append(voteCol, body);
  return div;
}

function formatDate(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

// ---------- Photos ----------

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.remove("hidden");
}
lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") lightbox.classList.add("hidden");
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Please choose an image file.");
    photoInput.value = "";
    return;
  }
  try {
    pendingPhoto = await compressImage(file);
    photoPreviewImg.src = pendingPhoto;
    photoPreview.classList.remove("hidden");
  } catch {
    toast("Could not process that image.");
    photoInput.value = "";
  }
});

$("photo-remove").addEventListener("click", () => {
  pendingPhoto = null;
  photoInput.value = "";
  photoPreview.classList.add("hidden");
});

// Downscale to max 1280px edge and re-encode as JPEG, stepping quality
// down until it fits the server's 500 KB cap.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5, 0.35]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length * 0.75 <= 500 * 1024) return resolve(dataUrl);
      }
      reject(new Error("Image too large"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image"));
    };
    img.src = url;
  });
}

// ---------- Comment form ----------

commentText.addEventListener("input", () => {
  charCount.textContent = `${commentText.value.length} / 500`;
});

commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.classList.add("hidden");
  const text = commentText.value.trim();
  if (text.length < 3) {
    formError.textContent = "Comment must be at least 3 characters.";
    formError.classList.remove("hidden");
    return;
  }
  const submitBtn = commentForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await api(`/api/plates/${encodeURIComponent(currentPlate)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: $("comment-author").value,
        text,
        tag: $("comment-tag").value,
        photo: pendingPhoto || undefined,
      }),
    });
    commentText.value = "";
    charCount.textContent = "0 / 500";
    pendingPhoto = null;
    photoInput.value = "";
    photoPreview.classList.add("hidden");
    toast("Comment posted");
    insightsLoaded = false;
    if (insights.open) loadInsights();
    loadPlate(currentPlate);
  } catch (err) {
    formError.textContent = err.message;
    formError.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Init ----------

$("back-btn").addEventListener("click", showHome);
$("logo-link").addEventListener("click", (e) => {
  e.preventDefault();
  showHome();
});
window.addEventListener("hashchange", handleHash);
document.addEventListener("click", (e) => {
  if (!suggestions.contains(e.target) && e.target !== searchInput) {
    suggestions.classList.add("hidden");
  }
});

handleHash();
