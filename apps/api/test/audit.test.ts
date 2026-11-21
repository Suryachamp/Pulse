import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, makeCustomer, prisma, resetDb, signUp } from './helpers';

beforeEach(resetDb);

describe('audit log', () => {
  it('records actor, action, entity and metadata for business operations', async () => {
    const owner = await signUp();
    const customer = await makeCustomer(owner.agent);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: customer } });
    expect(log).toMatchObject({ action: 'customer.created', entityType: 'Customer', actorId: owner.userId, organizationId: owner.orgId });
  });

  it('cannot be modified or deleted, even directly in the database', async () => {
    const owner = await signUp();
    await makeCustomer(owner.agent);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: owner.orgId } });
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { summary: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });

  it('shows full audit detail only to owners and admins', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    await makeCustomer(owner.agent);
    expect((await staff.agent.get('/api/audit-logs')).status).toBe(403);
    const feed = await staff.agent.get('/api/activity');
    expect(feed.status).toBe(200);
    expect(feed.body.data[0]).not.toHaveProperty('metadata');
    expect(feed.body.data[0]).not.toHaveProperty('ip');
    const full = await owner.agent.get('/api/audit-logs');
    expect(full.body.data[0]).toHaveProperty('metadata');
  });

  it('exposes no write endpoints for audit history', async () => {
    const owner = await signUp();
    expect((await owner.agent.delete('/api/audit-logs')).status).toBe(404);
    expect((await owner.agent.post('/api/audit-logs').send({})).status).toBe(404);
  });
});
