"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { VIBES, type Vibe } from "@/lib/vibes";

export type FeedComment = {
  id: string;
  body: string;
  vibe: string;
  created_at: string;
  author_id: string;
  profiles: { username: string; avatar_url: string | null } | null;
  reactions: { kind: string; user_id: string }[];
};

const VIBE_STYLES: Record<string, string> = {
  praise: "border-amber/50 text-amber",
  neutral: "border-edge text-muted",
  gripe: "border-edge text-muted/70",
  warning: "border-red-400/50 text-red-400",
};

const REACTION_KINDS = [
  { kind: "up", emoji: "👍" },
  { kind: "down", emoji: "👎" },
  { kind: "funny", emoji: "😂" },
] as const;

export function PlateFeed({
  plateId: initialPlateId,
  country,
  plate,
  initialComments,
  userId,
}: {
  plateId: string | null;
  country: string;
  plate: string;
  initialComments: FeedComment[];
  userId: string | null;
}) {
  const [plateId, setPlateId] = useState(initialPlateId);
  const [comments, setComments] = useState(initialComments);
  const [filter, setFilter] = useState<Vibe | "all">("all");
  const supabase = useMemo(() => createClient(), []);
  const seenIds = useRef(new Set(initialComments.map((c) => c.id)));

  const addComment = useCallback((comment: FeedComment) => {
    if (seenIds.current.has(comment.id)) return;
    seenIds.current.add(comment.id);
    setComments((prev) => [comment, ...prev]);
  }, []);

  // Live feed: new comments from other people arrive with a spring.
  useEffect(() => {
    if (!plateId) return;
    const channel = supabase
      .channel(`plate-${plateId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `plate_id=eq.${plateId}`,
        },
        async (payload) => {
          const row = payload.new as Omit<FeedComment, "profiles" | "reactions">;
          if (seenIds.current.has(row.id)) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", row.author_id)
            .single();
          addComment({ ...row, profiles: profile, reactions: [] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [plateId, supabase, addComment]);

  const visible =
    filter === "all" ? comments : comments.filter((c) => c.vibe === filter);

  return (
    <div className="flex flex-col gap-6">
      <Composer
        country={country}
        plate={plate}
        userId={userId}
        onPosted={(comment) => {
          addComment(comment);
          if (!plateId) setPlateId(comment.plate_id);
        }}
      />

      {comments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["all", ...VIBES.map((v) => v.value)] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v as Vibe | "all")}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === v
                  ? "border-amber text-amber"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              {v === "all" ? "All" : VIBES.find((x) => x.value === v)?.label}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {visible.map((comment, i) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              userId={userId}
              index={i}
              onDeleted={(id) =>
                setComments((prev) => prev.filter((c) => c.id !== id))
              }
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function Composer({
  country,
  plate,
  userId,
  onPosted,
}: {
  country: string;
  plate: string;
  userId: string | null;
  onPosted: (comment: FeedComment & { plate_id: string }) => void;
}) {
  const [body, setBody] = useState("");
  const [vibe, setVibe] = useState<Vibe>("neutral");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    return (
      <div className="rounded-lg border border-dashed border-edge p-4 text-center text-sm text-muted">
        <Link
          href={`/login?next=/plate/${country}/${plate}`}
          className="text-amber underline"
        >
          Sign in
        </Link>{" "}
        to leave a comment on this car.
      </div>
    );
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, plate, body, vibe }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong.");
      return;
    }
    setBody("");
    setVibe("neutral");
    onPosted({ ...json.comment, reactions: [] });
  }

  return (
    <form
      onSubmit={post}
      className="flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's the story with this car?"
        rows={3}
        maxLength={500}
        className="resize-none bg-transparent text-sm focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {VIBES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVibe(v.value)}
              title={v.label}
              className={`rounded-full border px-2.5 py-1 text-xs transition-all ${
                vibe === v.value
                  ? "scale-105 border-amber text-amber"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{body.length}/500</span>
          <button
            type="submit"
            disabled={busy || body.trim().length === 0}
            className="rounded-lg bg-amber px-4 py-1.5 text-sm font-semibold text-background transition-transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}

function CommentCard({
  comment,
  userId,
  index,
  onDeleted,
}: {
  comment: FeedComment;
  userId: string | null;
  index: number;
  onDeleted: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const vibeMeta = VIBES.find((v) => v.value === comment.vibe);

  return (
    <motion.li
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 28,
        delay: Math.min(index * 0.05, 0.4),
      }}
      className={`rounded-lg border bg-surface p-4 ${
        comment.vibe === "gripe" ? "opacity-80" : ""
      } ${VIBE_STYLES[comment.vibe] ?? "border-edge"}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground">
          {comment.profiles?.username ?? "driver"}
        </span>
        <span className="text-muted">
          {vibeMeta && `${vibeMeta.emoji} `}
          {new Date(comment.created_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
        {comment.body}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <ReactionBar comment={comment} userId={userId} />
        <div className="flex gap-3 text-xs text-muted">
          {userId === comment.author_id ? (
            <DeleteButton commentId={comment.id} onDeleted={onDeleted} />
          ) : (
            userId && <ReportButton commentId={comment.id} userId={userId} />
          )}
        </div>
      </div>
    </motion.li>
  );
}

function ReactionBar({
  comment,
  userId,
}: {
  comment: FeedComment;
  userId: string | null;
}) {
  const [reactions, setReactions] = useState(comment.reactions);
  const supabase = useMemo(() => createClient(), []);
  const mine = reactions.find((r) => r.user_id === userId)?.kind ?? null;

  async function toggle(kind: string) {
    if (!userId) return;
    const previous = reactions;
    if (mine === kind) {
      setReactions(previous.filter((r) => r.user_id !== userId));
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", userId);
      if (error) setReactions(previous);
    } else {
      setReactions([
        ...previous.filter((r) => r.user_id !== userId),
        { kind, user_id: userId },
      ]);
      await supabase
        .from("reactions")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", userId);
      const { error } = await supabase
        .from("reactions")
        .insert({ comment_id: comment.id, user_id: userId, kind });
      if (error) setReactions(previous);
    }
  }

  return (
    <div className="flex gap-1.5">
      {REACTION_KINDS.map(({ kind, emoji }) => {
        const count = reactions.filter((r) => r.kind === kind).length;
        return (
          <motion.button
            key={kind}
            whileTap={{ scale: 1.25 }}
            onClick={() => toggle(kind)}
            disabled={!userId}
            title={userId ? kind : "Sign in to react"}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              mine === kind
                ? "border-amber text-amber"
                : "border-edge text-muted hover:text-foreground"
            } disabled:cursor-default`}
          >
            {emoji}
            {count > 0 && <span className="ml-1">{count}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "doxxing", label: "Personal info" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

function ReportButton({
  commentId,
  userId,
}: {
  commentId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  async function report(reason: string) {
    const { error } = await supabase
      .from("reports")
      .insert({ comment_id: commentId, reporter_id: userId, reason });
    // 23505 = already reported by this user; treat as done
    if (!error || error.code === "23505") setDone(true);
    setOpen(false);
  }

  if (done) return <span className="text-muted/60">Reported ✓</span>;

  return open ? (
    <span className="flex flex-wrap gap-2">
      {REPORT_REASONS.map((r) => (
        <button
          key={r.value}
          onClick={() => report(r.value)}
          className="underline hover:text-red-400"
        >
          {r.label}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="hover:text-foreground">
        ✕
      </button>
    </span>
  ) : (
    <button onClick={() => setOpen(true)} className="hover:text-red-400">
      Report
    </button>
  );
}

function DeleteButton({
  commentId,
  onDeleted,
}: {
  commentId: string;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  async function remove() {
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);
    if (!error) onDeleted(commentId);
  }

  return (
    <button onClick={remove} className="hover:text-red-400">
      Delete
    </button>
  );
}
