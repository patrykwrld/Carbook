import { PlateSearch } from "@/components/PlateSearch";
import { FadeUp } from "@/components/motion";

export default function Home() {
  return (
    <div className="film-grain relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden px-4">
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center gap-8 pb-24 text-center">
        <FadeUp>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Every car has a story.
            <br />
            <span className="text-amber">Read the comments.</span>
          </h1>
        </FadeUp>
        <FadeUp delay={0.12}>
          <p className="max-w-md text-balance text-muted">
            Type any registration plate to see what the road is saying — or
            leave a note of your own.
          </p>
        </FadeUp>
        <FadeUp delay={0.24} className="flex w-full justify-center">
          <PlateSearch />
        </FadeUp>
        <FadeUp delay={0.4}>
          <p className="text-xs text-muted/70">
            Comment on cars, not people. Be decent — the road remembers.
          </p>
        </FadeUp>
      </div>
    </div>
  );
}
