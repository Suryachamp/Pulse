import { Download } from 'lucide-react';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

/**
 * Plain link download: the browser sends the session cookie and saves the file
 * from the API's Content-Disposition header. Hidden for roles without data:export
 * (the API enforces it regardless).
 */
export function ExportButton({ dataset, from, to }: { dataset: 'orders' | 'customers' | 'payments'; from?: string; to?: string }) {
  const { can } = useSession();
  if (!can('data:export')) return null;
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return (
    <Button asChild>
      <a href={`/api/exports/${dataset}.csv${qs ? `?${qs}` : ''}`} download><Download />Export CSV</a>
    </Button>
  );
}
