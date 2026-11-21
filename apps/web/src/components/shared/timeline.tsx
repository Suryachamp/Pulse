import { ago, dateTime } from '@/lib/utils';
import type { TimelineEntry } from '@/types/api';

export function Timeline({ entries, empty = 'No activity yet.' }: { entries: Pick<TimelineEntry, 'id' | 'summary' | 'createdAt' | 'actor'>[]; empty?: string }) {
  if (!entries.length) return <p className="text-sm text-mist">{empty}</p>;
  return (
    <ol className="relative ml-1.5 border-l border-line/70">
      {entries.map((e) => (
        <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
          <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full border border-surface bg-faint" aria-hidden />
          <p className="text-sm">{e.summary}</p>
          <p className="text-xs text-faint"><time dateTime={e.createdAt} title={dateTime(e.createdAt)}>{ago(e.createdAt)}</time>{e.actor && ` · ${e.actor.name}`}</p>
        </li>
      ))}
    </ol>
  );
}
