import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCommentBody } from "@/lib/content-filter";
import { isValidPlate, normalizePlate } from "@/lib/plates";
import { isVibe } from "@/lib/vibes";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }

  let payload: { country?: string; plate?: string; body?: string; vibe?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const country = (payload.country ?? "").toUpperCase().slice(0, 6);
  const rawPlate = payload.plate ?? "";
  const body = (payload.body ?? "").trim();
  const vibe = payload.vibe ?? "neutral";

  if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(country) || !isValidPlate(rawPlate)) {
    return NextResponse.json({ error: "Invalid plate." }, { status: 400 });
  }
  if (!isVibe(vibe)) {
    return NextResponse.json({ error: "Invalid vibe." }, { status: 400 });
  }
  const filter = checkCommentBody(body);
  if (!filter.ok) {
    return NextResponse.json({ error: filter.reason }, { status: 422 });
  }

  // Find or create the plate (lazily created on first comment).
  const normalized = normalizePlate(rawPlate);
  let { data: plate } = await supabase
    .from("plates")
    .select("id")
    .eq("country_code", country)
    .eq("normalized_plate", normalized)
    .maybeSingle();

  if (!plate) {
    const { data: created, error: insertError } = await supabase
      .from("plates")
      .insert({ country_code: country, raw_plate: normalized })
      .select("id")
      .single();
    if (insertError) {
      // 23505 = someone else created it between our select and insert
      if (insertError.code === "23505") {
        ({ data: plate } = await supabase
          .from("plates")
          .select("id")
          .eq("country_code", country)
          .eq("normalized_plate", normalized)
          .single());
      } else {
        return NextResponse.json(
          { error: "Could not register the plate." },
          { status: 500 }
        );
      }
    } else {
      plate = created;
    }
  }
  if (!plate) {
    return NextResponse.json({ error: "Plate lookup failed." }, { status: 500 });
  }

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ plate_id: plate.id, author_id: user.id, body, vibe })
    .select("*, profiles(username, avatar_url)")
    .single();

  if (error) {
    const isRateLimit = error.message.includes("rate_limit_exceeded");
    return NextResponse.json(
      {
        error: isRateLimit
          ? "Easy there — max 10 comments an hour."
          : "Could not post the comment.",
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }

  return NextResponse.json({ comment }, { status: 201 });
}
