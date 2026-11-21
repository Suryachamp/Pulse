import { Router } from 'express';
import { addMemberSchema, updateMemberSchema, updateOrgSchema } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, idParam, parse } from '../../utils/http';
import * as svc from './organization.service';

export const organizationRouter = Router();

organizationRouter.patch('/organization', requirePermission('org:manage'), handler(async (req, res) => {
  res.json(await svc.updateOrganization(ctxOf(req), parse(updateOrgSchema, req.body)));
}));

organizationRouter.get('/members', requirePermission('members:read'), handler(async (req, res) => {
  res.json({ data: await svc.listMembers(ctxOf(req)) });
}));

organizationRouter.post('/members', requirePermission('members:manage'), handler(async (req, res) => {
  res.status(201).json(await svc.addMember(ctxOf(req), parse(addMemberSchema, req.body)));
}));

organizationRouter.patch('/members/:id', requirePermission('members:manage'), handler(async (req, res) => {
  const { role } = parse(updateMemberSchema, req.body);
  res.json(await svc.updateMemberRole(ctxOf(req), idParam(req, 'id', 'Member'), role));
}));

organizationRouter.delete('/members/:id', requirePermission('members:manage'), handler(async (req, res) => {
  await svc.removeMember(ctxOf(req), idParam(req, 'id', 'Member'));
  res.status(204).end();
}));
