"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ initialUsername }: { initialUsername: string }) {
  const [username, setUsername] = useState(initialUsername);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim() })
      .eq("id", user.id);
    setBusy(false);
    setStatus(
      error
        ? error.code === "23505"
          ? "That username is taken."
          : error.message
        : "Saved."
    );
  }

  return (
    <form onSubmit={save} className="flex items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-muted">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_]+"
          title="Letters, digits and underscores"
          className="rounded-lg border border-edge bg-surface px-3 py-2 focus:border-amber focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy || username.trim() === initialUsername}
        className="rounded-lg border border-edge px-4 py-2 text-sm transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      {status && <span className="pb-2 text-xs text-muted">{status}</span>}
    </form>
  );
}
