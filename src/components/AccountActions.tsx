"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountActions() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_own_account");
    if (error) {
      setBusy(false);
      alert(`Could not delete account: ${error.message}`);
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 border-t border-edge pt-6">
      <button
        onClick={signOut}
        className="self-start rounded-lg border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        Sign out
      </button>
      {confirming ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-red-400">
            This deletes your account and every comment you wrote. Sure?
          </span>
          <button
            onClick={deleteAccount}
            disabled={busy}
            className="rounded-lg bg-red-500/90 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="self-start text-sm text-red-400/80 hover:text-red-400"
        >
          Delete account
        </button>
      )}
    </section>
  );
}
