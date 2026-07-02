/** EU-style registration plate rendering. */
export function PlateChip({
  country,
  plate,
  size = "md",
}: {
  country: string;
  plate: string;
  size?: "md" | "lg";
}) {
  const sizes = {
    md: { text: "text-lg px-3 py-1", band: "text-[9px] px-1.5" },
    lg: { text: "text-3xl px-5 py-2 sm:text-4xl", band: "text-xs px-2" },
  }[size];

  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-md border-2 border-black bg-white shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
      <span
        className={`flex flex-col items-center justify-center bg-[#003399] font-bold text-white ${sizes.band}`}
      >
        <span aria-hidden className="text-amber leading-none">
          ★
        </span>
        <span>{country}</span>
      </span>
      <span
        className={`font-mono font-bold tracking-[0.15em] text-black ${sizes.text}`}
      >
        {plate}
      </span>
    </span>
  );
}
