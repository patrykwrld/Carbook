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

const TAG_META = {
  praise: { icon: "👏", label: "Nice driving" },
  warning: { icon: "⚠️", label: "Careless driving" },
  parking: { icon: "🅿️", label: "Parking issue" },
  funny: { icon: "😄", label: "Funny moment" },
  general: { icon: "💬", label: "General" },
};

let currentPlate = null;

// ---------- API ----------

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Routing ----------

function showHome() {
  currentPlate = null;
  viewPlate.classList.add("hidden");
  viewHome.classList.remove("hidden");
  location.hash = "";
  loadActivity();
}

function showPlate(plate) {
  currentPlate = plate;
  viewHome.classList.add("hidden");
  viewPlate.classList.remove("hidden");
  plateNumber.textContent = plate;
  location.hash = plate;
  loadPlate(plate);
}

function handleHash() {
  const plate = normalize(location.hash.slice(1));
  if (plate) showPlate(plate);
  else showHome();
}

function normalize(raw) {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

// ---------- Home / activity ----------

async function loadActivity() {
  try {
    const items = await api("/api/activity");
    if (!items.length) {
      activityList.innerHTML = '<p class="muted">No comments yet — be the first to look up a plate.</p>';
      return;
    }
    activityList.innerHTML = "";
    for (const item of items) {
      const div = document.createElement("div");
      div.className = "activity-item";
      div.innerHTML = `
        <span class="activity-tag">${TAG_META[item.tag]?.icon || "💬"}</span>
        <span class="activity-plate"></span>
        <span class="activity-preview"></span>`;
      div.querySelector(".activity-plate").textContent = item.plate;
      div.querySelector(".activity-preview").textContent = item.preview;
      div.addEventListener("click", () => showPlate(item.plate));
      activityList.appendChild(div);
    }
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
  commentsList.innerHTML = '<p class="muted">Loading…</p>';
  plateStats.innerHTML = "";
  try {
    const data = await api(`/api/plates/${encodeURIComponent(plate)}`);
    renderStats(data.stats);
    renderComments(data.comments);
  } catch (err) {
    commentsList.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderStats(stats) {
  plateStats.innerHTML = `
    <span>${stats.total} comment${stats.total === 1 ? "" : "s"}</span>
    <span class="stat-praise">👏 ${stats.praise || 0}</span>
    <span class="stat-warning">⚠️ ${stats.warning || 0}</span>`;
}

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = '<p class="muted">No comments yet. Be the first to leave feedback.</p>';
    return;
  }
  commentsList.innerHTML = "";
  for (const c of comments) commentsList.appendChild(renderComment(c));
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
    } catch { /* rate limited — ignore */ }
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

  const report = document.createElement("button");
  report.className = "report-btn";
  report.textContent = "🚩 Report";
  report.addEventListener("click", async () => {
    if (!confirm("Report this comment as abusive or false?")) return;
    try {
      const data = await api(`/api/comments/${c.id}/report`, { method: "POST" });
      report.textContent = "Reported ✓";
      report.disabled = true;
      if (data.hidden) loadPlate(currentPlate);
    } catch { /* ignore */ }
  });

  body.append(meta, text, report);
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
  try {
    await api(`/api/plates/${encodeURIComponent(currentPlate)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: $("comment-author").value,
        text,
        tag: $("comment-tag").value,
      }),
    });
    commentText.value = "";
    charCount.textContent = "0 / 500";
    loadPlate(currentPlate);
  } catch (err) {
    formError.textContent = err.message;
    formError.classList.remove("hidden");
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
