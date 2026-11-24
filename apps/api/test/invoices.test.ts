import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, pay, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;

async function confirmedOrder(opts: { price?: number; qty?: number } = {}) {
  const owner = await signUp();
  const customer = await makeCustomer(owner.agent);
  const product = await makeProduct(owner.agent, { priceCents: opts.price ?? 2500, stock: 20 });
  const order = await makeOrder(owner.agent, customer, [{ productId: product, quantity: opts.qty ?? 2 }], { taxRateBps: 1000 });
  await transition(owner.agent, order, 'CONFIRMED').expect(200);
  return { ...owner, customer, product, order };
}

describe('invoice settings', () => {
  it('saves business details and payment terms, and returns them on /auth/me', async () => {
    const { agent } = await signUp();
    const res = await agent.patch('/api/organization').send({
      invoiceAddress: '12 Harbour Road\nPortsmouth', invoiceEmail: 'Billing@Acme.test', invoicePhone: '+44 20 7946 0000',
      invoiceTaxId: 'GB123456789', invoiceFooter: 'Bank transfer to 12-34-56 / 87654321', paymentTermsDays: 30,
    });
    expect(res.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.organization).toMatchObject({ invoiceEmail: 'billing@acme.test', invoiceTaxId: 'GB123456789', paymentTermsDays: 30 });

    await agent.patch('/api/organization').send({ invoiceTaxId: '', invoiceEmail: '' }).expect(200);
    const cleared = await agent.get('/api/auth/me');
    expect(cleared.body.organization).toMatchObject({ invoiceTaxId: null, invoiceEmail: null, paymentTermsDays: 30 });
  });

  it('rejects payment terms outside 0..365 in the API and the database', async () => {
    const { agent, orgId } = await signUp();
    expect((await agent.patch('/api/organization').send({ paymentTermsDays: 400 })).status).toBe(400);
    expect((await agent.patch('/api/organization').send({ invoiceEmail: 'not-an-email' })).status).toBe(400);
    await expect(prisma.organization.update({ where: { id: orgId }, data: { paymentTermsDays: -1 } })).rejects.toThrow();
  });

  it('only lets roles with org:manage change invoice details', async () => {
    const { agent } = await signUp();
    const manager = await addMember(agent, 'MANAGER');
    expect((await manager.agent.patch('/api/organization').send({ paymentTermsDays: 7 })).status).toBe(403);
  });
});

describe('GET /orders/:id/invoice', () => {
  it('builds the invoice from the order, the seller details and the payment terms', async () => {
    const { agent, order } = await confirmedOrder();
    await agent.patch('/api/organization').send({ invoiceAddress: '12 Harbour Road', invoiceTaxId: 'GB1', paymentTermsDays: 30 }).expect(200);
    const res = await agent.get(`/api/orders/${order}/invoice`);
    expect(res.status).toBe(200);
    const inv = res.body;
    expect(inv).toMatchObject({
      number: 1, orderStatus: 'CONFIRMED', invoiceStatus: 'DUE', currency: 'USD',
      seller: { name: 'Acme Supply', address: '12 Harbour Road', taxId: 'GB1' },
      customer: { name: 'Northwind Traders' },
      subtotalCents: 5000, taxRateBps: 1000, taxCents: 500, totalCents: 5500, paidCents: 0, refundedCents: 0, balanceDueCents: 5500,
    });
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]).toMatchObject({ quantity: 2, unitPriceCents: 2500, lineTotalCents: 5000 });
    expect(new Date(inv.dueAt).getTime() - new Date(inv.issuedAt).getTime()).toBe(30 * DAY);
    // Internal fields never reach a document that is sent to customers.
    expect(inv).not.toHaveProperty('notes');
    expect(inv).not.toHaveProperty('history');
  });

  it('defaults to 14-day payment terms', async () => {
    const { agent, order } = await confirmedOrder();
    const before = (await agent.get(`/api/orders/${order}/invoice`)).body;
    expect(new Date(before.dueAt).getTime() - new Date(before.issuedAt).getTime()).toBe(14 * DAY);
  });

  it('refuses drafts with 409 INVOICE_NOT_AVAILABLE', async () => {
    const { agent } = await signUp();
    const order = await makeOrder(agent, await makeCustomer(agent), [{ productId: await makeProduct(agent), quantity: 1 }]);
    const res = await agent.get(`/api/orders/${order}/invoice`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_NOT_AVAILABLE');
  });

  it('tracks payments and refunds through to PAID', async () => {
    const { agent, order } = await confirmedOrder({ price: 1000, qty: 1 }); // total 1100
    await pay(agent, order, 600).expect(201);
    let inv = (await agent.get(`/api/orders/${order}/invoice`)).body;
    expect(inv).toMatchObject({ invoiceStatus: 'DUE', paidCents: 600, balanceDueCents: 500 });

    await pay(agent, order, 500, { reference: 'TX-2' }).expect(201);
    await pay(agent, order, 100, { kind: 'REFUND' }).expect(201);
    inv = (await agent.get(`/api/orders/${order}/invoice`)).body;
    expect(inv).toMatchObject({ paidCents: 1100, refundedCents: 100, balanceDueCents: 100, invoiceStatus: 'DUE' });
    expect(inv.payments.map((p: { kind: string }) => p.kind).sort()).toEqual(['PAYMENT', 'PAYMENT', 'REFUND']);
    expect(inv.payments[0]).not.toHaveProperty('note');

    await pay(agent, order, 100).expect(201);
    expect((await agent.get(`/api/orders/${order}/invoice`)).body).toMatchObject({ invoiceStatus: 'PAID', balanceDueCents: 0 });
  });

  it('marks an unpaid invoice OVERDUE once its due date has passed', async () => {
    const { agent, order, orgId } = await confirmedOrder();
    await prisma.organization.update({ where: { id: orgId }, data: { paymentTermsDays: 7 } });
    await prisma.order.update({ where: { id: order }, data: { confirmedAt: new Date(Date.now() - 10 * DAY) } });
    expect((await agent.get(`/api/orders/${order}/invoice`)).body.invoiceStatus).toBe('OVERDUE');
  });

  it('voids the invoice of a cancelled order', async () => {
    const { agent, order } = await confirmedOrder();
    await transition(agent, order, 'CANCELLED', 'Customer withdrew').expect(200);
    const inv = (await agent.get(`/api/orders/${order}/invoice`)).body;
    expect(inv).toMatchObject({ invoiceStatus: 'VOID', balanceDueCents: 0 });
  });

  it('is readable by staff and invisible to other organizations', async () => {
    const { agent, order } = await confirmedOrder();
    const staff = await addMember(agent, 'STAFF');
    expect((await staff.agent.get(`/api/orders/${order}/invoice`)).status).toBe(200);
    const other = await signUp('Rival Goods');
    expect((await other.agent.get(`/api/orders/${order}/invoice`)).status).toBe(404);
    expect((await other.agent.get('/api/orders/not-a-uuid/invoice')).status).toBe(404);
  });
});
