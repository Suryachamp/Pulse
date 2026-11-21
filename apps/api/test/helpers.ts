import request from 'supertest';
import type { Role } from '@pulse/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/database/prisma';

export const app = createApp();
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function resetDb() {
  if (!/test/.test(new URL(process.env.DATABASE_URL ?? '').pathname)) throw new Error('resetDb only runs against a test database');
  // TRUNCATE bypasses the row-level append-only triggers; only tests do this.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","Notification","Payment","InventoryMovement","OrderItem","Task","Order","Product","Customer","Session","Membership","Organization","User" CASCADE',
  );
}

export type Agent = ReturnType<typeof request.agent>;

export async function signUp(orgName = 'Acme Supply') {
  const agent = request.agent(app);
  const email = `owner-${uid()}@example.com`;
  const res = await agent.post('/api/auth/register').send({ name: 'Olivia Owner', email, password: 'correct-horse-9', organizationName: orgName });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, orgId: res.body.organization.id as string, userId: res.body.user.id as string };
}

/** Adds a member with the given role to the owner's org and returns a signed-in agent for them. */
export async function addMember(owner: Agent, role: Role) {
  const email = `${role.toLowerCase()}-${uid()}@example.com`;
  const res = await owner.post('/api/members').send({ email, name: `${role} Person`, role, initialPassword: 'member-pass-123' });
  if (res.status !== 201) throw new Error(`addMember failed: ${res.status} ${JSON.stringify(res.body)}`);
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: 'member-pass-123' });
  if (login.status !== 200) throw new Error('member login failed');
  return { agent, userId: res.body.user.id as string, membershipId: res.body.id as string };
}

export async function makeCustomer(agent: Agent, name = 'Northwind Traders') {
  const res = await agent.post('/api/customers').send({ name, email: `${uid()}@northwind.test` });
  if (res.status !== 201) throw new Error(`customer failed: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

export async function makeProduct(agent: Agent, opts: { priceCents?: number; stock?: number; threshold?: number; sku?: string } = {}) {
  const res = await agent.post('/api/products').send({
    sku: opts.sku ?? `SKU-${uid()}`,
    name: `Widget ${uid()}`,
    priceCents: opts.priceCents ?? 1000,
    initialStock: opts.stock ?? 10,
    lowStockThreshold: opts.threshold ?? 2,
  });
  if (res.status !== 201) throw new Error(`product failed: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

export async function makeOrder(agent: Agent, customerId: string, items: { productId: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  const res = await agent.post('/api/orders').send({ customerId, items, ...extra });
  if (res.status !== 201) throw new Error(`order failed: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

export const transition = (agent: Agent, orderId: string, status: string, reason?: string) =>
  agent.post(`/api/orders/${orderId}/transitions`).send({ status, reason });

export const pay = (agent: Agent, orderId: string, amountCents: number, extra: Record<string, unknown> = {}) =>
  agent.post(`/api/orders/${orderId}/payments`).send({ method: 'CARD', amountCents, idempotencyKey: `key-${uid()}`, ...extra });

export { prisma, request };
