import { beforeEach, describe, expect, it } from 'vitest';
import { makeCustomer, makeOrder, makeProduct, pay, prisma, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

describe('concurrency', () => {
  it('does not oversell when many orders confirm at the same time', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 5 });
    const orders = [];
    for (let i = 0; i < 12; i++) orders.push(await makeOrder(agent, c, [{ productId: p, quantity: 1 }]));

    const results = await Promise.all(orders.map((o) => transition(agent, o, 'CONFIRMED')));
    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 422).length;
    expect(ok).toBe(5);
    expect(rejected).toBe(7);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: p } });
    expect(product).toMatchObject({ onHand: 5, reserved: 5 });
    expect(await prisma.inventoryMovement.count({ where: { productId: p, type: 'RESERVE' } })).toBe(5);
  });

  it('does not deadlock when orders lock the same products in different orders', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const a = await makeProduct(agent, { stock: 100 });
    const b = await makeProduct(agent, { stock: 100 });
    const orders = [];
    for (let i = 0; i < 10; i++) {
      orders.push(await makeOrder(agent, c, i % 2 ? [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }] : [{ productId: b, quantity: 1 }, { productId: a, quantity: 1 }]));
    }
    const results = await Promise.all(orders.map((o) => transition(agent, o, 'CONFIRMED')));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const [pa, pb] = await Promise.all([prisma.product.findUniqueOrThrow({ where: { id: a } }), prisma.product.findUniqueOrThrow({ where: { id: b } })]);
    expect(pa.reserved).toBe(10);
    expect(pb.reserved).toBe(10);
  });

  it('confirms an order only once under double submission', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { stock: 10 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 2 }]);
    const results = await Promise.all([1, 2, 3].map(() => transition(agent, order, 'CONFIRMED')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p } })).reserved).toBe(2);
  });

  it('cannot overpay an order with simultaneous payments', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { priceCents: 1000 });
    const order = await makeOrder(agent, c, [{ productId: p, quantity: 1 }]);
    await transition(agent, order, 'CONFIRMED').expect(200);
    const results = await Promise.all([1, 2, 3, 4].map(() => pay(agent, order, 400)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order } });
    expect(o.paidCents).toBe(800);
  });
});
