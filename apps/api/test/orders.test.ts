import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

async function stock(productId: string) {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return { onHand: p.onHand, reserved: p.reserved };
}

describe('order totals', () => {
  it('ignores client-sent prices and totals and computes them on the server', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { priceCents: 2500 });
    const res = await agent.post('/api/orders').send({ customerId: c, items: [{ productId: p, quantity: 3, unitPriceCents: 1 }], totalCents: 1, discountCents: 500, taxRateBps: 1000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subtotalCents: 7500, discountCents: 500, taxCents: 700, totalCents: 7700, status: 'DRAFT' });
  });

  it('keeps the price an item was sold at after the catalog price changes', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { priceCents: 1000 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 2 }]);
    await agent.patch(`/api/products/${p}`).send({ priceCents: 9999 }).expect(200);
    const res = await agent.get(`/api/orders/${order}`);
    expect(res.body.items[0].unitPriceCents).toBe(1000);
    expect(res.body.totalCents).toBe(2000);
  });

  it('numbers orders sequentially per organization', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent);
    const ids = [await makeOrder(agent, c, [{ productId: p, quantity: 1 }]), await makeOrder(agent, c, [{ productId: p, quantity: 1 }])];
    const numbers = await Promise.all(ids.map(async (id) => (await agent.get(`/api/orders/${id}`)).body.number));
    expect(numbers).toEqual([1, 2]);
  });
});

describe('order lifecycle and stock', () => {
  it('reserves on confirm, deducts on fulfil and records movements', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 10 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 4 }]);

    expect(await stock(p)).toEqual({ onHand: 10, reserved: 0 });
    await transition(agent, order, 'CONFIRMED').expect(200);
    expect(await stock(p)).toEqual({ onHand: 10, reserved: 4 });
    await transition(agent, order, 'FULFILLED').expect(200);
    expect(await stock(p)).toEqual({ onHand: 6, reserved: 0 });
    await transition(agent, order, 'COMPLETED').expect(200);

    const movements = await prisma.inventoryMovement.findMany({ where: { productId: p }, orderBy: { createdAt: 'asc' } });
    expect(movements.map((m) => m.type)).toEqual(['INITIAL', 'RESERVE', 'FULFILL']);
    expect(movements.at(-1)).toMatchObject({ onHandAfter: 6, reservedAfter: 0 });
  });

  it('releases reserved stock when a confirmed order is cancelled', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 5 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 5 }]);
    await transition(agent, order, 'CONFIRMED').expect(200);
    await transition(agent, order, 'CANCELLED', 'Customer changed mind').expect(200);
    expect(await stock(p)).toEqual({ onHand: 5, reserved: 0 });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order } });
    expect(o.cancelReason).toBe('Customer changed mind');
  });

  it('rejects invalid transitions', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent);
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 1 }]);
    const skip = await transition(agent, order, 'FULFILLED');
    expect(skip.status).toBe(409);
    expect(skip.body.error.details.code).toBe('INVALID_TRANSITION');
    expect((await transition(agent, order, 'COMPLETED')).status).toBe(409);
    await transition(agent, order, 'CONFIRMED').expect(200);
    await transition(agent, order, 'FULFILLED').expect(200);
    expect((await transition(agent, order, 'CANCELLED')).status).toBe(409);
    expect((await transition(agent, order, 'CONFIRMED')).status).toBe(409);
  });

  it('refuses to confirm when there is not enough available stock', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 3 });
    const other = await makeProduct(agent, { stock: 50 });
    const order = await makeOrder(agent, c, [{ productId: other, quantity: 2 }, { productId: p, quantity: 4 }]);
    const res = await transition(agent, order, 'CONFIRMED');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    // The whole transaction rolled back, including the reservation on the other product.
    expect(await stock(other)).toEqual({ onHand: 50, reserved: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order } })).status).toBe('DRAFT');
  });

  it('only allows editing drafts', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent);
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 1 }]);
    await agent.put(`/api/orders/${order}`).send({ customerId: c, items: [{ productId: p, quantity: 3 }] }).expect(200);
    await transition(agent, order, 'CONFIRMED').expect(200);
    expect((await agent.put(`/api/orders/${order}`).send({ customerId: c, items: [{ productId: p, quantity: 1 }] })).status).toBe(409);
  });

  it('lets staff progress orders but not cancel them', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    const c = await makeCustomer(owner.agent);
    const p = await makeProduct(owner.agent);
    const order = await makeOrder(staff.agent, c, [{ productId: p, quantity: 1 }]);
    await transition(staff.agent, order, 'CONFIRMED').expect(200);
    expect((await transition(staff.agent, order, 'CANCELLED')).status).toBe(403);
  });
});

describe('inventory rules', () => {
  it('never lets stock go negative or below what is reserved', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 5 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 3 }]);
    await transition(agent, order, 'CONFIRMED').expect(200);
    const res = await agent.post(`/api/products/${p}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -3, reason: 'Damaged' });
    expect(res.status).toBe(422);
    await agent.post(`/api/products/${p}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -2, reason: 'Damaged' }).expect(201);
    expect(await stock(p)).toEqual({ onHand: 3, reserved: 3 });
  });

  it('enforces non-negative stock in the database itself', async () => {
    const { agent } = await signUp();
    const p = await makeProduct(agent, { stock: 1 });
    await expect(prisma.product.update({ where: { id: p }, data: { onHand: -1 } })).rejects.toThrow();
    await expect(prisma.product.update({ where: { id: p }, data: { reserved: 5 } })).rejects.toThrow();
  });

  it('notifies managers once when a product crosses its low-stock threshold', async () => {
    const owner = await signUp();
    const p = await makeProduct(owner.agent, { stock: 10, threshold: 3 });
    await owner.agent.post(`/api/products/${p}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -6, reason: 'Count' }).expect(201);
    await owner.agent.post(`/api/products/${p}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -1, reason: 'Count' }).expect(201);
    await owner.agent.post(`/api/products/${p}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -1, reason: 'Count' }).expect(201);
    const n = await owner.agent.get('/api/notifications');
    expect(n.body.data.filter((x: { type: string }) => x.type === 'LOW_STOCK')).toHaveLength(1);
    const low = await owner.agent.get('/api/products').query({ stock: 'low' });
    expect(low.body.data.map((r: { id: string }) => r.id)).toContain(p);
  });

  it('archives instead of deleting products that have been ordered', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent);
    await makeOrder(agent, c, [{ productId: p, quantity: 1 }]);
    expect((await agent.delete(`/api/products/${p}`)).status).toBe(409);
    await agent.post(`/api/products/${p}/archive`).expect(200);
    expect((await agent.post('/api/orders').send({ customerId: c, items: [{ productId: p, quantity: 1 }] })).status).toBe(400);
  });
});
