import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlateChip } from "@/components/PlateChip";
import { ProfileForm } from "@/components/ProfileForm";
import { AccountActions } from "@/components/AccountActions";
import { platePath } from "@/lib/plates";

export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const [{ data: profile }, { data: comments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("comments")
      .select("id, body, vibe, created_at, is_hidden, plates(country_code, normalized_plate)")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-10">
      <section>
        <h1 className="font-display text-2xl font-bold">My garage</h1>
        <p className="mt-1 text-sm text-muted">{user.email}</p>
        <div className="mt-6">
          <ProfileForm initialUsername={profile.username} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Your comments</h2>
        {!comments?.length ? (
          <p className="mt-3 text-sm text-muted">
            Nothing yet. Go find a car worth talking about.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-edge bg-surface p-4"
              >
                {c.plates && (
                  <Link
                    href={platePath(
                      c.plates.country_code,
                      c.plates.normalized_plate ?? ""
                    )}
                  >
                    <PlateChip
                      country={c.plates.country_code}
                      plate={c.plates.normalized_plate ?? ""}
                    />
                  </Link>
                )}
                <p className="mt-2 text-sm">{c.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(c.created_at).toLocaleDateString()}
                  {c.is_hidden && " · hidden by moderation"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountActions />
    </div>
  );
}
