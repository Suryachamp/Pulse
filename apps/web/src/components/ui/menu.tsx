import type { ReactNode } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as T from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn('glass z-50 min-w-48 rounded-xl border border-line p-1 shadow-lift', className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, disabled }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-raised data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-faint', danger ? 'text-rose' : 'text-ink')}
    >
      {children}
    </DM.Item>
  );
}

export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line/70" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <DM.Label className="px-2.5 py-1.5 text-xs text-faint">{children}</DM.Label>;

export function Tip({ label, children, side = 'right' }: { label: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={8} className="z-50 rounded-md border border-line bg-raised px-2 py-1 text-xs text-ink shadow-lift">{label}</T.Content>
      </T.Portal>
    </T.Root>
  );
}
