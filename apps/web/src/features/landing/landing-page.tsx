import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { History, Lock, PackageCheck, Receipt, UsersRound } from 'lucide-react';
import { useSession } from '@/lib/session';
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

gsap.registerPlugin(ScrollTrigger);
const PulseScene = lazy(() => import('./pulse-scene'));

const CHAPTERS = [
  {
    title: 'Most small businesses run on five tools that don’t talk.',
    body: 'Orders in one spreadsheet, stock counts in another, payments in a banking app, follow-ups in someone’s head. Every handoff is a chance to sell something you don’t have or forget money you’re owed.',
  },
  {
    title: 'PULSE puts every record in one place.',
    body: 'Customers, orders, inventory, payments and tasks share one database. Confirming an order reserves its stock. Recording a payment updates the balance. Your team sees the same numbers.',
  },
  {
    title: 'So you can see how the business is really doing.',
    body: 'Revenue comes from payments you’ve recorded, not estimates. Outstanding balances, refunds and low stock are calculated from real transactions, for any date range you choose.',
  },
];

const FEATURES = [
  { icon: PackageCheck, title: 'Stock that can’t oversell', body: 'Confirmed orders reserve units in a single database transaction. Two people can’t sell the last item twice.' },
  { icon: Receipt, title: 'Payments you can trust', body: 'Partial payments, refunds and balances come from recorded transactions. Duplicate submissions are caught automatically.' },
  { icon: History, title: 'Every change on the record', body: 'An append-only audit log shows who changed what and when. No one can edit it, including owners.' },
  { icon: UsersRound, title: 'Roles that match your team', body: 'Owners, admins, managers and staff each get exactly the access they need, enforced on the server.' },
];

function canUse3D() {
  if (typeof window === 'undefined' || window.innerWidth < 768) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Lightweight fallback for mobile, reduced motion and devices without WebGL. */
function StaticPulse() {
  return (
    <svg viewBox="0 0 600 260" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sp" x1="0" x2="1"><stop offset="0" stopColor="#DDA94B" stopOpacity="0" /><stop offset="0.5" stopColor="#DDA94B" /><stop offset="1" stopColor="#DDA94B" stopOpacity="0" /></linearGradient>
      </defs>
      {Array.from({ length: 40 }, (_, i) => {
        const x = 20 + i * 14.3;
        const beat = Math.exp(-(((i - 24) / 2.2) ** 2)) * 150 - Math.exp(-(((i - 20) / 1.4) ** 2)) * 30 + Math.exp(-(((i - 12) / 2.5) ** 2)) * 40;
        const h = Math.max(6, beat + 18);
        return <rect key={i} x={x} y={200 - h} width={8} height={h} rx={2} fill={i === 24 ? '#DDA94B' : '#3A4050'} />;
      })}
      <path d="M0 200 H600" stroke="url(#sp)" strokeWidth="1.5" />
    </svg>
  );
}

export default function LandingPage() {
  const { me } = useSession();
  const reduced = usePrefersReducedMotion();
  const [use3D] = useState(canUse3D);
  const progress = useRef(0);
  const story = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const cinematic = use3D && !reduced;

  useEffect(() => { document.title = 'PULSE · Run your business on one workspace'; }, []);

  useLayoutEffect(() => {
    if (!root.current) return;
    const ctx = gsap.context(() => {
      if (cinematic && story.current) {
        ScrollTrigger.create({
          trigger: story.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          onUpdate: (self) => { progress.current = self.progress * 2; },
        });
      }
      if (!reduced) {
        gsap.utils.toArray<HTMLElement>('[data-chapter]').forEach((el) => {
          gsap.fromTo(el, { autoAlpha: 0.15, y: 40 }, { autoAlpha: 1, y: 0, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 75%', end: 'top 40%', scrub: true } });
        });
        gsap.from('[data-hero] > *', { autoAlpha: 0, y: 24, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.1 });
      }
    }, root);
    return () => ctx.revert();
  }, [cinematic, reduced]);

  return (
    <div ref={root} className="relative bg-canvas text-ink">
      <header className="glass fixed inset-x-0 top-0 z-30 border-b border-line/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/"><Logo /></Link>
          <nav className="flex items-center gap-2">
            {me ? <Button asChild variant="primary"><Link to="/app">Open workspace</Link></Button> : (
              <>
                <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
                <Button asChild variant="primary"><Link to="/register">Create workspace</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* The 3D field stays fixed behind the story and is driven by scroll position. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {cinematic ? (
          <Suspense fallback={null}><PulseScene progress={progress} /></Suspense>
        ) : (
          <div className="absolute inset-x-0 bottom-0 h-[45vh] opacity-60"><StaticPulse /></div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(21_23_28/0.92)_0%,rgb(21_23_28/0.55)_45%,transparent_75%)]" />
      </div>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[100svh] max-w-6xl items-center px-4 pt-16 sm:px-6">
          <div data-hero className="max-w-2xl">
            <h1 className="font-display text-[clamp(3rem,7vw,5.75rem)] leading-[0.95] tracking-[-0.02em]">The operating rhythm of your business, in one place.</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-mist">PULSE is where small teams manage customers, orders, stock, payments and tasks, with numbers everyone can trust.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="primary"><Link to={me ? '/app' : '/register'}>{me ? 'Open workspace' : 'Create your workspace'}</Link></Button>
              {!me && <Button asChild size="lg" variant="outline"><Link to="/login">Sign in</Link></Button>}
            </div>
            <p className="mt-6 text-sm text-faint">Scroll to see how it works</p>
          </div>
        </section>

        <div ref={story}>
          {CHAPTERS.map((c, i) => (
            <section key={c.title} className="mx-auto flex min-h-[110vh] max-w-6xl items-center px-4 sm:px-6" aria-labelledby={`chapter-${i}`}>
              <div data-chapter className="max-w-xl">
                <p className="tnum mb-4 text-sm text-brass">{i + 1} of {CHAPTERS.length}</p>
                <h2 id={`chapter-${i}`} className="font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.02] tracking-[-0.015em]">{c.title}</h2>
                <p className="mt-5 text-lg leading-relaxed text-mist">{c.body}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="relative border-t border-line/50 bg-canvas/95 py-24 backdrop-blur" aria-labelledby="features">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="features" className="max-w-xl font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05]">Built around the rules your business actually runs on.</h2>
            <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <f.icon className="mt-1 size-5 shrink-0 text-brass" aria-hidden />
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1.5 leading-relaxed text-mist">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-20 flex flex-col items-start justify-between gap-6 border-t border-line/60 pt-10 sm:flex-row sm:items-center">
              <div>
                <p className="text-xl font-semibold">Set up takes about ten minutes.</p>
                <p className="mt-1 text-mist">Add your products and customers, then create your first order.</p>
              </div>
              <Button asChild size="lg" variant="primary"><Link to={me ? '/app' : '/register'}>{me ? 'Open workspace' : 'Create your workspace'}</Link></Button>
            </div>
          </div>
        </section>
        <footer className="relative border-t border-line/50 bg-canvas py-8 text-sm text-faint">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:justify-between sm:px-6">
            <Logo className="opacity-70" />
            <span className="flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden />Your data stays in your workspace. PULSE tracks payments; it never processes them.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
