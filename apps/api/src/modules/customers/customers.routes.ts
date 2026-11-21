import { Router } from 'express';
import { customerInputSchema, customerListQuery, customerUpdateSchema } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, idParam, parse } from '../../utils/http';
import * as svc from './customers.service';

export const customersRouter = Router();

customersRouter.get('/', requirePermission('customers:read'), handler(async (req, res) => {
  res.json(await svc.listCustomers(ctxOf(req), parse(customerListQuery, req.query)));
}));
customersRouter.get('/tags', requirePermission('customers:read'), handler(async (req, res) => {
  res.json({ data: await svc.listCustomerTags(ctxOf(req)) });
}));
customersRouter.get('/:id', requirePermission('customers:read'), handler(async (req, res) => {
  res.json(await svc.getCustomer(ctxOf(req), idParam(req, 'id', 'Customer')));
}));
customersRouter.post('/', requirePermission('customers:write'), handler(async (req, res) => {
  res.status(201).json(await svc.createCustomer(ctxOf(req), parse(customerInputSchema, req.body)));
}));
customersRouter.patch('/:id', requirePermission('customers:write'), handler(async (req, res) => {
  res.json(await svc.updateCustomer(ctxOf(req), idParam(req, 'id', 'Customer'), parse(customerUpdateSchema, req.body)));
}));
customersRouter.post('/:id/archive', requirePermission('customers:write'), handler(async (req, res) => {
  res.json(await svc.setArchived(ctxOf(req), idParam(req, 'id', 'Customer'), true));
}));
customersRouter.post('/:id/restore', requirePermission('customers:write'), handler(async (req, res) => {
  res.json(await svc.setArchived(ctxOf(req), idParam(req, 'id', 'Customer'), false));
}));
customersRouter.delete('/:id', requirePermission('customers:delete'), handler(async (req, res) => {
  await svc.deleteCustomer(ctxOf(req), idParam(req, 'id', 'Customer'));
  res.status(204).end();
}));
