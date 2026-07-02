export const metadata = { title: "Rules — Carbook" };

export default function RulesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">The rules of the road</h1>
      <p className="mt-2 text-muted">
        Carbook is a guestbook for cars. One rule above all:{" "}
        <strong className="text-foreground">
          comment on cars, not people.
        </strong>
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-lg font-semibold text-amber">
            Fair game
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>The car: the build, the wrap, the sound, the stance.</li>
            <li>Driving and parking, described as behavior on the road.</li>
            <li>Heads-ups: lights left on, flat tire, window down in rain.</li>
            <li>Compliments. Always fair game.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-amber">
            Off limits — removed, and repeat offenders banned
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>
              Anything about the <em>person</em>: names, workplaces, addresses,
              phone numbers, or photos of people.
            </li>
            <li>Threats, harassment, or organizing pile-ons.</li>
            <li>Claims about who owns the car or where it can be found.</li>
            <li>Spam and links.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-amber">
            Enforcement
          </h2>
          <p className="mt-2 text-muted">
            Every comment has a report button. Three independent reports hide a
            comment automatically pending review. We rate-limit posting, and we
            filter contact info at the door. If your comment was hidden and you
            think that&apos;s wrong, delete it and say it better.
          </p>
        </section>
      </div>
    </div>
  );
}
