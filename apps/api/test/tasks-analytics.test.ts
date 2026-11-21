import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, makeOrder, makeProduct, pay, resetDb, signUp, transition } from './helpers';

beforeEach(resetDb);

describe('tasks', () => {
  it('lets staff assign only themselves, and managers assign anyone', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    const manager = await addMember(owner.agent, 'MANAGER');
    expect((await staff.agent.post('/api/tasks').send({ title: 'Call supplier', assigneeId: manager.userId })).status).toBe(403);
    await staff.agent.post('/api/tasks').send({ title: 'Call supplier', assigneeId: staff.userId }).expect(201);
    await manager.agent.post('/api/tasks').send({ title: 'Count stock', assigneeId: staff.userId }).expect(201);
    const n = await staff.agent.get('/api/notifications');
    expect(n.body.data.some((x: { type: string }) => x.type === 'TASK_ASSIGNED')).toBe(true);
  });

  it('rejects assigning to someone outside the organization', async () => {
    const owner = await signUp();
    const outsider = await signUp('Other');
    expect((await owner.agent.post('/api/tasks').send({ title: 'X', assigneeId: outsider.userId })).status).toBe(400);
  });

  it('flags overdue tasks and stops staff editing tasks that are not theirs', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    const task = (await owner.agent.post('/api/tasks').send({ title: 'Late', dueAt: new Date(Date.now() - 86_400_000).toISOString() })).body;
    expect(task.isOverdue).toBe(true);
    const overdue = await owner.agent.get('/api/tasks').query({ overdue: true });
    expect(overdue.body.data).toHaveLength(1);
    expect((await staff.agent.patch(`/api/tasks/${task.id}`).send({ status: 'DONE' })).status).toBe(403);
    const done = await owner.agent.patch(`/api/tasks/${task.id}`).send({ status: 'DONE' });
    expect(done.body).toMatchObject({ isOverdue: false });
    expect(done.body.completedAt).not.toBeNull();
  });
});

describe('analytics', () => {
  it('computes revenue, refunds and outstanding from real transactions', async () => {
    const { agent } = await signUp();
    const c = await makeCustomer(agent);
    const p = await makeProduct(agent, { priceCents: 1000, stock: 100 });
    const a = await makeOrder(agent, c, [{ productId: p, quantity: 3 }]);
    const b = await makeOrder(agent, c, [{ productId: p, quantity: 2 }]);
    const cancelled = await makeOrder(agent, c, [{ productId: p, quantity: 9 }]);
    await makeOrder(agent, c, [{ productId: p, quantity: 50 }]); // draft: never counted
    for (const o of [a, b, cancelled]) await transition(agent, o, 'CONFIRMED').expect(200);
    await transition(agent, cancelled, 'CANCELLED').expect(200);
    await pay(agent, a, 3000).expect(201);
    await pay(agent, b, 500).expect(201);
    await pay(agent, a, 1000, { kind: 'REFUND' }).expect(201);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const res = await agent.get('/api/analytics/summary').query({ from, to });
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ orderCount: 2, bookedSalesCents: 5000, collectedCents: 3500, refundedCents: 1000, netRevenueCents: 2500, cancelledCount: 1 });
    // a: 3000 - (3000-1000) = 1000 owed; b: 2000 - 500 = 1500 owed
    expect(res.body.outstandingCents).toBe(2500);

    const series = await agent.get('/api/analytics/timeseries').query({ from, to });
    const totals = series.body.points.reduce((s: { booked: number; collected: number }, pt: { booked: number; collected: number }) => ({ booked: s.booked + pt.booked, collected: s.collected + pt.collected }), { booked: 0, collected: 0 });
    expect(totals).toEqual({ booked: 5000, collected: 3500 });
  });

  it('hides revenue from staff on the dashboard', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    expect((await owner.agent.get('/api/dashboard')).body.money).not.toBeNull();
    const d = await staff.agent.get('/api/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.money).toBeNull();
    expect((await staff.agent.get('/api/analytics/summary').query({ from: '2026-01-01', to: '2026-02-01' })).status).toBe(403);
  });

  it('validates date ranges', async () => {
    const { agent } = await signUp();
    expect((await agent.get('/api/analytics/summary').query({ from: '2026-05-01', to: '2026-01-01' })).status).toBe(400);
  });
});
