import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option<T extends string = string> { value: T; label: string }

interface SelectProps<T extends string> {
  value: T | undefined;
  onValueChange: (v: T) => void;
  options: readonly Option<T>[];
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Select<T extends string>({ value, onValueChange, options, placeholder, id, className, disabled, ...rest }: SelectProps<T>) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={rest['aria-label']}
        className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-canvas/60 px-3 text-sm text-ink hover:border-faint focus:outline-none focus:ring-2 focus:ring-brass/20 data-[placeholder]:text-faint', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon><ChevronDown className="size-4 text-faint" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="glass z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line p-1 shadow-lift">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-3 text-sm text-ink outline-none data-[highlighted]:bg-raised">
                <SelectPrimitive.ItemIndicator className="absolute left-2"><Check className="size-4 text-brass" /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
