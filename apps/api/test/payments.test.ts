import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, pay, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

async function confirmedOrder(totalCents = 1000) {
  const owner = await signUp();
  const c = await makeCustomer(owner.agent);
  const p = await makeProduct(owner.agent, { priceCents: totalCents });
  const order = await makeOrder(owner.agent, c, [{ productId: p, quantity: 1 }]);
  await transition(owner.agent, order, 'CONFIRMED').expect(200);
  return { owner, order };
}

describe('payments', () => {
  it('refuses payments on drafts', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent);
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 1 }]);
    const res = await pay(agent, order, 100);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_NOT_PAYABLE');
  });

  it('derives payment status and outstanding balance from recorded payments', async () => {
    const { owner, order } = await confirmedOrder(1000);
    await pay(owner.agent, order, 300).expect(201);
    let o = (await owner.agent.get(`/api/orders/${order}`)).body;
    expect(o).toMatchObject({ paymentStatus: 'PARTIALLY_PAID', outstandingCents: 700, paidCents: 300 });
    await pay(owner.agent, order, 700).expect(201);
    o = (await owner.agent.get(`/api/orders/${order}`)).body;
    expect(o).toMatchObject({ paymentStatus: 'PAID', outstandingCents: 0 });
  });

  it('ignores any client attempt to set paid status directly', async () => {
    const { owner, order } = await confirmedOrder(1000);
    const res = await owner.agent.put(`/api/orders/${order}`).send({ paymentStatus: 'PAID', paidCents: 1000 });
    expect(res.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order } })).paidCents).toBe(0);
  });

  it('rejects overpayment', async () => {
    const { owner, order } = await confirmedOrder(1000);
    const res = await pay(owner.agent, order, 1001);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OVERPAYMENT');
  });

  it('treats a retried request with the same idempotency key as the same payment', async () => {
    const { owner, order } = await confirmedOrder(1000);
    const first = await pay(owner.agent, order, 500, { idempotencyKey: 'retry-key-123' });
    const again = await pay(owner.agent, order, 500, { idempotencyKey: 'retry-key-123' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await prisma.payment.count({ where: { orderId: order } })).toBe(1);
    const reused = await pay(owner.agent, order, 200, { idempotencyKey: 'retry-key-123' });
    expect(reused.status).toBe(409);
  });

  it('flags a second payment with the same reference as a duplicate', async () => {
    const { owner, order } = await confirmedOrder(1000);
    await pay(owner.agent, order, 100, { reference: 'CHK-1001' }).expect(201);
    expect((await pay(owner.agent, order, 100, { reference: 'CHK-1001' })).status).toBe(409);
  });

  it('handles refunds and refuses to refund more than was paid', async () => {
    const { owner, order } = await confirmedOrder(1000);
    await pay(owner.agent, order, 1000).expect(201);
    expect((await pay(owner.agent, order, 1001, { kind: 'REFUND' })).status).toBe(422);
    await pay(owner.agent, order, 400, { kind: 'REFUND' }).expect(201);
    let o = (await owner.agent.get(`/api/orders/${order}`)).body;
    expect(o).toMatchObject({ paymentStatus: 'PARTIALLY_REFUNDED', outstandingCents: 400 });
    await pay(owner.agent, order, 600, { kind: 'REFUND' }).expect(201);
    o = (await owner.agent.get(`/api/orders/${order}`)).body;
    expect(o.paymentStatus).toBe('REFUNDED');
  });

  it('allows refunding a deposit after cancellation, but not new payments', async () => {
    const { owner, order } = await confirmedOrder(1000);
    await pay(owner.agent, order, 250).expect(201);
    await transition(owner.agent, order, 'CANCELLED').expect(200);
    expect((await pay(owner.agent, order, 100)).status).toBe(422);
    await pay(owner.agent, order, 250, { kind: 'REFUND' }).expect(201);
    const o = (await owner.agent.get(`/api/orders/${order}`)).body;
    expect(o).toMatchObject({ paymentStatus: 'REFUNDED', outstandingCents: 0 });
  });

  it('enforces payment permissions by role', async () => {
    const { owner, order } = await confirmedOrder(1000);
    const staff = await addMember(owner.agent, 'STAFF');
    const manager = await addMember(owner.agent, 'MANAGER');
    expect((await pay(staff.agent, order, 100)).status).toBe(403);
    await pay(manager.agent, order, 100).expect(201);
    expect((await pay(manager.agent, order, 50, { kind: 'REFUND' })).status).toBe(403);
  });

  it('keeps the order balance equal to the sum of its payment rows', async () => {
    const { owner, order } = await confirmedOrder(5000);
    for (const amt of [1200, 800, 1000]) await pay(owner.agent, order, amt).expect(201);
    await pay(owner.agent, order, 500, { kind: 'REFUND' }).expect(201);
    const sums = await prisma.payment.groupBy({ by: ['kind'], where: { orderId: order }, _sum: { amountCents: true } });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order } });
    expect(o.paidCents).toBe(sums.find((s) => s.kind === 'PAYMENT')?._sum.amountCents);
    expect(o.refundedCents).toBe(sums.find((s) => s.kind === 'REFUND')?._sum.amountCents);
  });
});
