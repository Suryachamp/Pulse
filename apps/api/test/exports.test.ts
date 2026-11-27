import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, pay, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

/** Parses the simple CSVs these tests produce (no embedded newlines). */
function rows(text: string) {
  return text.replace(/^\uFEFF/, '').trim().split('\r\n').map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

const asRecords = (text: string) => {
  const [header, ...body] = rows(text);
  return body.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i]])));
};

async function sales() {
  const owner = await signUp();
  const c = await makeCustomer(owner.agent, 'Northwind, Ltd');
  const p = await makeProduct(owner.agent, { priceCents: 1250, stock: 20 });
  const sold = await makeOrder(owner.agent, c, [{ productId: p, quantity: 2 }]);
  await transition(owner.agent, sold, 'CONFIRMED').expect(200);
  await pay(owner.agent, sold, 1000, { reference: 'TX-1' }).expect(201);
  await pay(owner.agent, sold, 300, { kind: 'REFUND' }).expect(201);
  const draft = await makeOrder(owner.agent, c, [{ productId: p, quantity: 1 }]);
  return { ...owner, customer: c, sold, draft };
}

describe('CSV exports', () => {
  it('exports orders as a downloadable CSV with decimal amounts', async () => {
    const { agent } = await sales();
    const res = await agent.get('/api/exports/orders.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="pulse-orders-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    const recs = asRecords(res.text);
    expect(recs).toHaveLength(2);
    expect(recs.find((r) => r.number === '1')).toMatchObject({
      status: 'CONFIRMED', payment_status: 'PARTIALLY_REFUNDED', invoice_status: 'DUE', customer: 'Northwind, Ltd',
      subtotal: '25.00', total: '25.00', paid: '10.00', refunded: '3.00', balance: '18.00',
    });
    expect(recs.find((r) => r.number === '2')).toMatchObject({ status: 'DRAFT', invoice_status: '', balance: '0.00' });
  });

  it('exports customers with the same booked-sales totals as the customer list', async () => {
    const { agent } = await sales();
    await agent.post('/api/customers').send({ name: '=HYPERLINK("http://evil")', tags: ['wholesale', 'vip'] }).expect(201);
    const recs = asRecords((await agent.get('/api/exports/customers.csv')).text);
    expect(recs.find((r) => r.name === 'Northwind, Ltd')).toMatchObject({ orders: '1', lifetime_value: '25.00', outstanding: '18.00', status: 'active' });
    const evil = recs.find((r) => r.name?.includes('HYPERLINK'));
    expect(evil?.name).toBe(`'=HYPERLINK("http://evil")`);
    expect(evil?.tags).toBe('wholesale; vip');
  });

  it('exports payments with refunds as negative amounts and honours the date range', async () => {
    const { agent } = await sales();
    const recs = asRecords((await agent.get('/api/exports/payments.csv')).text);
    expect(recs.map((r) => [r.kind, r.amount]).sort()).toEqual([['PAYMENT', '10.00'], ['REFUND', '-3.00']]);
    expect(recs.find((r) => r.kind === 'PAYMENT')).toMatchObject({ order_number: '1', customer: 'Northwind, Ltd', reference: 'TX-1', method: 'CARD' });

    const past = asRecords((await agent.get('/api/exports/payments.csv?from=2020-01-01&to=2020-12-31')).text);
    expect(past).toHaveLength(0);
    expect((await agent.get('/api/exports/payments.csv?from=2026-12-31&to=2020-01-01')).status).toBe(400);
  });

  it('records each export in the audit log', async () => {
    const { agent, orgId } = await sales();
    await agent.get('/api/exports/orders.csv').expect(200);
    const entry = await prisma.auditLog.findFirst({ where: { organizationId: orgId, action: 'data.exported' } });
    expect(entry).toMatchObject({ entityType: 'Organization', entityId: orgId, summary: 'Exported orders (2 rows)' });
  });

  it('is limited to managers and above, and to the caller’s organization', async () => {
    const { agent } = await sales();
    const staff = await addMember(agent, 'STAFF');
    expect((await staff.agent.get('/api/exports/orders.csv')).status).toBe(403);
    const manager = await addMember(agent, 'MANAGER');
    expect((await manager.agent.get('/api/exports/orders.csv')).status).toBe(200);

    const other = await signUp('Rival Goods');
    expect(asRecords((await other.agent.get('/api/exports/orders.csv')).text)).toHaveLength(0);
    expect(asRecords((await other.agent.get('/api/exports/customers.csv')).text)).toHaveLength(0);
    expect((await other.agent.get('/api/exports/secrets.csv')).status).toBe(404);
  });

  it('requires a session', async () => {
    const { request, app } = await import('./helpers');
    expect((await request(app).get('/api/exports/orders.csv')).status).toBe(401);
  });
});
