"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimate, useReducedMotion } from "framer-motion";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  isValidPlate,
  normalizePlate,
  platePath,
} from "@/lib/plates";

export function PlateSearch() {
  const router = useRouter();
  const [scope, animate] = useAnimate();
  const reducedMotion = useReducedMotion();
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [plate, setPlate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (leaving) return;
    if (!isValidPlate(plate)) {
      setError("That doesn't look like a plate (2–12 letters and digits).");
      return;
    }
    setError(null);
    setLeaving(true);
    const target = platePath(country, plate);
    if (!reducedMotion) {
      // the plate drives off before the route changes
      await animate(
        scope.current,
        { x: "70vw", opacity: 0, filter: "blur(4px)" },
        { duration: 0.35, ease: [0.5, 0, 0.9, 0.4] }
      );
    }
    router.push(target);
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-3">
      <motion.div
        ref={scope}
        className="flex items-stretch overflow-hidden rounded-lg border-2 border-black bg-white shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
      >
        <select
          aria-label="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="cursor-pointer appearance-none bg-[#003399] px-2 text-center text-sm font-bold text-white outline-none"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="WX 12345"
          maxLength={16}
          autoFocus
          aria-label="Registration plate"
          className="w-full bg-white px-4 py-3 font-mono text-2xl font-bold tracking-[0.15em] text-black placeholder:text-black/30 focus:outline-none"
        />
      </motion.div>
      <button
        type="submit"
        disabled={leaving || normalizePlate(plate).length === 0}
        className="rounded-lg bg-amber px-4 py-3 font-display font-semibold text-background transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
      >
        {leaving ? "Pulling up…" : "Look it up"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
