import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, app, prisma, request, resetDb, signUp } from './helpers';

beforeEach(resetDb);

describe('authentication', () => {
  it('registers an owner with a new organization and an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Ada', email: 'ADA@Example.com', password: 'abcdefghij1', organizationName: 'Ada Co' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.user.email).toBe('ada@example.com');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('stores only a hash of the session token and an argon2 password hash', async () => {
    const { userId } = await signUp();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const session = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@b.co', password: 'short', organizationName: 'Org' });
    expect(weak.status).toBe(400);
    const { email } = await signUp();
    const dup = await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'abcdefghij1', organizationName: 'Org' });
    expect(dup.status).toBe(409);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const { email } = await signUp();
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'nope-nope-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('requires a session for protected routes and revokes it on logout', async () => {
    expect((await request(app).get('/api/customers')).status).toBe(401);
    const { agent } = await signUp();
    expect((await agent.get('/api/customers')).status).toBe(200);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/customers')).status).toBe(401);
  });

  it('rejects state-changing requests from foreign origins', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/api/customers').set('Origin', 'https://evil.example').send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });
});

describe('membership and roles', () => {
  it('applies role changes immediately, without re-login', async () => {
    const owner = await signUp();
    const manager = await addMember(owner.agent, 'MANAGER');
    expect((await manager.agent.get('/api/analytics/summary').query({ from: '2026-01-01', to: '2026-02-01' })).status).toBe(200);
    await owner.agent.patch(`/api/members/${manager.membershipId}`).send({ role: 'STAFF' }).expect(200);
    expect((await manager.agent.get('/api/analytics/summary').query({ from: '2026-01-01', to: '2026-02-01' })).status).toBe(403);
  });

  it('locks out removed members immediately', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    await owner.agent.delete(`/api/members/${staff.membershipId}`).expect(204);
    expect((await staff.agent.get('/api/customers')).status).toBe(403);
  });

  it('prevents admins from granting or managing owner/admin roles', async () => {
    const owner = await signUp();
    const admin = await addMember(owner.agent, 'ADMIN');
    const res = await admin.agent.post('/api/members').send({ email: 'new@example.com', name: 'New', role: 'OWNER', initialPassword: 'pass-word-123' });
    expect(res.status).toBe(403);
    const members = await owner.agent.get('/api/members');
    const ownerMembership = members.body.data.find((m: { role: string }) => m.role === 'OWNER');
    expect((await admin.agent.delete(`/api/members/${ownerMembership.id}`)).status).toBe(403);
  });

  it('stops staff from managing members', async () => {
    const owner = await signUp();
    const staff = await addMember(owner.agent, 'STAFF');
    expect((await staff.agent.post('/api/members').send({ email: 'x@example.com', name: 'X', role: 'STAFF', initialPassword: 'pass-word-123' })).status).toBe(403);
  });
});
