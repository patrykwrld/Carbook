"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function NavAuth() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!loaded) return <span className="w-14" />;

  return email ? (
    <Link href="/me" className="text-muted hover:text-foreground">
      My garage
    </Link>
  ) : (
    <Link
      href="/login"
      className="rounded-full border border-edge px-3 py-1 text-muted transition-colors hover:border-amber hover:text-amber"
    >
      Sign in
    </Link>
  );
}
