export default function PlateLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-10">
      <div className="h-14 w-56 animate-pulse rounded-md bg-surface-raised" />
      <div className="h-4 w-40 animate-pulse rounded bg-surface" />
      <div className="flex w-full flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 w-full animate-pulse rounded-lg border border-edge bg-surface"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
