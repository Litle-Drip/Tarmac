import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REPORT_RETENTION_DAYS } from "@shared/schema";

/**
 * What Tarmac collects, in the plainest terms we can manage.
 *
 * Every claim here is checkable against the code, and it needs to stay that
 * way — if the data handling changes, this page changes in the same commit.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 h-10" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Back to airports
            </Button>
          </Link>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full flex-1 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Privacy</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Last updated 15 August 2026
          </p>
        </div>

        <section className="space-y-3">
          <p className="text-base leading-relaxed">
            Tarmac has no accounts, no sign-in and no email addresses. We don't
            know who you are, and we've built it so we can't find out.
          </p>
          <p className="text-base leading-relaxed">
            We do store a few things, and this page says exactly what.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">What we store</h2>
          <dl className="space-y-4">
            <div>
              <dt className="font-semibold text-sm">Your wait time reports</dt>
              <dd className="text-sm text-muted-foreground leading-relaxed">
                The airport, the line type, how long you waited, roughly when
                you went through, and the terminal or checkpoint if you enter
                one. This is the point of the app, and it's shown to everyone.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-sm">A random device token</dt>
              <dd className="text-sm text-muted-foreground leading-relaxed">
                A string of random characters your browser generates and keeps.
                It isn't derived from anything about you or your device — it
                exists so we can stop one person submitting hundreds of fake
                reports. Clearing your browser storage erases it and creates a
                new one.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-sm">A scrambled version of your IP address</dt>
              <dd className="text-sm text-muted-foreground leading-relaxed">
                When you submit a report we run your IP address through a
                one-way scrambling function together with a secret value, and
                store only the result. The original address is never written
                down, and the scrambled version can't be turned back into it.
                It's a second signal for spotting abuse.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-sm">Some settings, on your device only</dt>
              <dd className="text-sm text-muted-foreground leading-relaxed">
                Whether you prefer PreCheck, light or dark mode, how long it
                takes you to reach the airport. These stay in your browser and
                are never sent to us.
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">What we don't store</h2>
          <ul className="text-sm text-muted-foreground leading-relaxed space-y-1.5 list-disc pl-5">
            <li>Your name, email address or phone number — we never ask</li>
            <li>Your raw IP address</li>
            <li>Your location, unless you tap "Nearest" and allow it — and
              even then it stays in your browser and is only used to sort the
              list. It is never sent to our servers.</li>
            <li>Your flight details. The departure time you enter into the
              planner is used to calculate an answer and is not recorded.</li>
            <li>Anything from advertising or analytics trackers. There aren't
              any on this site.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">How long we keep it</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Wait time reports stop affecting what the app displays after six
            hours, and are deleted after {REPORT_RETENTION_DAYS} days. The
            device token and scrambled IP attached to a report are deleted with
            it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Who else sees it</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Nobody. We don't sell data, share it with advertisers, or hand it
            to third parties. The site runs on Vercel and the database is
            hosted by Neon; both process data on our behalf in order to keep
            the site running, and neither uses it for anything else.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Wait times themselves are public — that's the whole idea — but they
            are published as numbers, never attached to a person.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Deleting your reports</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Because there are no accounts, we can't look up "your" reports from
            an email address. If you want a report removed, email us with the
            airport and roughly when you submitted it and we'll find and delete
            it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">This is not flight advice</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Wait times are reported by other travelers and, where nobody has
            reported recently, estimated from typical patterns. They can be
            wrong. The departure planner is a guide, not a guarantee — please
            use your own judgement, and leave more time than the app suggests
            if anything about your trip matters.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Contact</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tarmac is run by Edison Labs LLC. For anything on this page,
            including deletion requests, email{" "}
            <a href="mailto:privacy@edisonlabs.co" className="text-primary underline">
              privacy@edisonlabs.co
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs text-muted-foreground">
            Experimental software by Edison Labs LLC
          </span>
        </div>
      </footer>
    </div>
  );
}
