import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, pay, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;

/** Three confirmed orders (total 1000 each, terms 14 days): one overdue, one paid & old, one recent. */
async function setup() {
  const owner = await signUp();
  const c = await makeCustomer(owner.agent);
  const p = await makeProduct(owner.agent, { priceCents: 1000, stock: 50 });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await makeOrder(owner.agent, c, [{ productId: p, quantity: 1 }]);
    await transition(owner.agent, id, 'CONFIRMED').expect(200);
    ids.push(id);
  }
  const [overdue, paidOld, recent] = ids as [string, string, string];
  await pay(owner.agent, overdue, 400).expect(201);
  await pay(owner.agent, paidOld, 1000).expect(201);
  const old = new Date(Date.now() - 20 * DAY);
  await prisma.order.updateMany({ where: { id: { in: [overdue, paidOld] } }, data: { confirmedAt: old } });
  // A draft never counts, however old.
  await makeOrder(owner.agent, c, [{ productId: p, quantity: 1 }]);
  return { ...owner, overdue, paidOld, recent };
}

describe('overdue invoices', () => {
  it('filters the order list to invoices past their due date with a balance', async () => {
    const { agent, overdue } = await setup();
    const res = await agent.get('/api/orders?overdue=true');
    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([overdue]);
    expect(res.body.total).toBe(1);
    expect((await agent.get('/api/orders?overdue=false')).body.total).toBe(4);
    expect((await agent.get('/api/orders?overdue=yes')).status).toBe(400);
  });

  it('labels each listed order with its invoice status', async () => {
    const { agent, overdue, paidOld, recent } = await setup();
    const rows: { id: string; status: string; invoiceStatus: string | null }[] = (await agent.get('/api/orders?pageSize=10')).body.data;
    const by = new Map(rows.map((r) => [r.id, r.invoiceStatus]));
    expect(by.get(overdue)).toBe('OVERDUE');
    expect(by.get(paidOld)).toBe('PAID');
    expect(by.get(recent)).toBe('DUE');
    expect(rows.find((r) => r.status === 'DRAFT')?.invoiceStatus).toBeNull();
  });

  it('follows the organization’s payment terms', async () => {
    const { agent, orgId } = await setup();
    await prisma.organization.update({ where: { id: orgId }, data: { paymentTermsDays: 30 } });
    expect((await agent.get('/api/orders?overdue=true')).body.total).toBe(0);
  });

  it('raises a dashboard alert with the overdue amount for roles that see money', async () => {
    const { agent } = await setup();
    const alerts: { id: string; title: string; description: string; href: string }[] = (await agent.get('/api/dashboard')).body.alerts;
    const a = alerts.find((x) => x.id === 'overdue-invoices');
    expect(a).toMatchObject({ title: '1 invoice overdue', href: '/app/orders?overdue=true' });
    expect(a?.description).toContain('$6.00');

    const staff = await addMember(agent, 'STAFF');
    const staffAlerts: { id: string }[] = (await staff.agent.get('/api/dashboard')).body.alerts;
    expect(staffAlerts.some((x) => x.id === 'overdue-invoices')).toBe(false);
  });

  it('never counts another organization’s orders', async () => {
    await setup();
    const other = await signUp('Rival Goods');
    expect((await other.agent.get('/api/orders?overdue=true')).body.total).toBe(0);
  });
});
