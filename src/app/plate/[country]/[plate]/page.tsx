import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlateChip } from "@/components/PlateChip";
import { PlateFeed, type FeedComment } from "@/components/PlateFeed";
import { FadeUp } from "@/components/motion";
import { normalizePlate } from "@/lib/plates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; plate: string }>;
}) {
  const { country, plate } = await params;
  const normalized = normalizePlate(decodeURIComponent(plate));
  return {
    title: `${decodeURIComponent(country).toUpperCase()} ${normalized} — Carbook`,
    description: `What the road says about ${normalized}.`,
  };
}

export default async function PlatePage({
  params,
}: {
  params: Promise<{ country: string; plate: string }>;
}) {
  const { country: rawCountry, plate: rawPlate } = await params;
  const country = decodeURIComponent(rawCountry).toUpperCase();
  const plate = normalizePlate(decodeURIComponent(rawPlate));

  if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(country) || plate.length < 2 || plate.length > 12) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: plateRow } = await supabase
    .from("plates")
    .select("id")
    .eq("country_code", country)
    .eq("normalized_plate", plate)
    .maybeSingle();

  let comments: FeedComment[] = [];
  if (plateRow) {
    const { data } = await supabase
      .from("comments")
      .select(
        "id, body, vibe, created_at, author_id, profiles(username, avatar_url), reactions(kind, user_id)"
      )
      .eq("plate_id", plateRow.id)
      .order("created_at", { ascending: false })
      .limit(100);
    comments = (data as FeedComment[]) ?? [];
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <FadeUp className="flex flex-col items-center gap-3 text-center">
        <PlateChip country={country} plate={plate} size="lg" />
        <p className="text-sm text-muted">
          {comments.length === 0
            ? "This car has a clean record… so far."
            : `${comments.length} comment${comments.length === 1 ? "" : "s"} from the road`}
        </p>
      </FadeUp>
      <PlateFeed
        plateId={plateRow?.id ?? null}
        country={country}
        plate={plate}
        initialComments={comments}
        userId={user?.id ?? null}
      />
    </div>
  );
}
