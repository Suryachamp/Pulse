import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/logo';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(var(--brass)/0.10),transparent)]" aria-hidden />
      <div className="relative w-full max-w-[25rem]">
        <Link to="/" className="mb-10 inline-block"><Logo /></Link>
        <h1 className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.01em]">{title}</h1>
        <p className="mt-2 text-mist">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-8 text-sm text-mist">{footer}</p>
      </div>
    </div>
  );
}
