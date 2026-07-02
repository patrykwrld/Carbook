import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-6xl font-bold text-amber">404</p>
      <h1 className="font-display text-2xl font-bold">Wrong turn.</h1>
      <p className="max-w-sm text-sm text-muted">
        That page isn&apos;t on the map. Head back and look up a plate instead.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-amber px-4 py-2 font-display font-semibold text-background"
      >
        Back to the road
      </Link>
    </div>
  );
}
