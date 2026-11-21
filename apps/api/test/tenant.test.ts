import { beforeEach, describe, expect, it } from 'vitest';
import { makeCustomer, makeOrder, makeProduct, resetDb, signUp } from './helpers';

beforeEach(resetDb);

describe('tenant isolation', () => {
  it('never exposes another organization’s records', async () => {
    const a = await signUp('Alpha');
    const b = await signUp('Beta');
    const customer = await makeCustomer(a.agent);
    const product = await makeProduct(a.agent);
    const order = await makeOrder(a.agent, customer, [{ productId: product, quantity: 1 }]);

    for (const path of [`/api/customers/${customer}`, `/api/products/${product}`, `/api/orders/${order}`]) {
      expect((await b.agent.get(path)).status).toBe(404);
    }
    expect((await b.agent.patch(`/api/customers/${customer}`).send({ name: 'Hijacked' })).status).toBe(404);
    expect((await b.agent.post(`/api/products/${product}/adjustments`).send({ type: 'ADJUSTMENT', quantity: -5, reason: 'steal' })).status).toBe(404);
    expect((await b.agent.post(`/api/orders/${order}/transitions`).send({ status: 'CANCELLED' })).status).toBe(404);

    const lists = await Promise.all(['/api/customers', '/api/products', '/api/orders', '/api/activity'].map((p) => b.agent.get(p)));
    for (const res of lists) {
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r: { id: string; entityId?: string }) => r.entityId ?? r.id);
      expect(ids).not.toContain(customer);
      expect(ids).not.toContain(order);
    }
  });

  it('rejects orders that reference another organization’s customer or product', async () => {
    const a = await signUp('Alpha');
    const b = await signUp('Beta');
    const foreignCustomer = await makeCustomer(a.agent);
    const foreignProduct = await makeProduct(a.agent);
    const ownCustomer = await makeCustomer(b.agent);
    const ownProduct = await makeProduct(b.agent);

    expect((await b.agent.post('/api/orders').send({ customerId: foreignCustomer, items: [{ productId: ownProduct, quantity: 1 }] })).status).toBe(400);
    expect((await b.agent.post('/api/orders').send({ customerId: ownCustomer, items: [{ productId: foreignProduct, quantity: 1 }] })).status).toBe(400);
  });

  it('cannot switch into an organization the user does not belong to', async () => {
    const a = await signUp('Alpha');
    const b = await signUp('Beta');
    expect((await b.agent.post('/api/auth/switch-organization').send({ organizationId: a.orgId })).status).toBe(404);
  });
});
