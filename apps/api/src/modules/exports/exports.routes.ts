import { Router } from 'express';
import { z } from 'zod';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, parse } from '../../utils/http';
import { exportDataset, type Dataset } from './exports.service';

const rangeQuery = z
  .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: '`from` must be before `to`', path: ['from'] });

export const exportsRouter = Router();

for (const dataset of ['orders', 'customers', 'payments'] as const satisfies readonly Dataset[]) {
  exportsRouter.get(`/${dataset}.csv`, requirePermission('data:export'), handler(async (req, res) => {
    const csv = await exportDataset(ctxOf(req), dataset, parse(rangeQuery, req.query));
    const day = new Date().toISOString().slice(0, 10);
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="pulse-${dataset}-${day}.csv"`)
      .set('Cache-Control', 'no-store')
      // The byte-order mark makes Excel read the file as UTF-8 (names with accents, the "−" sign).
      .send(`\uFEFF${csv}`);
  }));
}
