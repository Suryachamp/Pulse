import { Router } from 'express';
import { orderInputSchema, orderListQuery, orderTransitionSchema, paymentInputSchema, paymentListQuery } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, idParam, parse } from '../../utils/http';
import * as orders from './orders.service';
import * as payments from '../payments/payments.service';

export const ordersRouter = Router();

ordersRouter.get('/', requirePermission('orders:read'), handler(async (req, res) => {
  res.json(await orders.listOrders(ctxOf(req), parse(orderListQuery, req.query)));
}));
ordersRouter.get('/:id', requirePermission('orders:read'), handler(async (req, res) => {
  res.json(await orders.getOrder(ctxOf(req), idParam(req, 'id', 'Order')));
}));
ordersRouter.post('/', requirePermission('orders:write'), handler(async (req, res) => {
  res.status(201).json(await orders.createOrder(ctxOf(req), parse(orderInputSchema, req.body)));
}));
ordersRouter.put('/:id', requirePermission('orders:write'), handler(async (req, res) => {
  res.json(await orders.updateDraft(ctxOf(req), idParam(req, 'id', 'Order'), parse(orderInputSchema, req.body)));
}));
ordersRouter.post('/:id/transitions', requirePermission('orders:write'), handler(async (req, res) => {
  res.json(await orders.transitionOrder(ctxOf(req), idParam(req, 'id', 'Order'), parse(orderTransitionSchema, req.body)));
}));
ordersRouter.post('/:id/payments', requirePermission('payments:read'), handler(async (req, res) => {
  const { payment, replayed } = await payments.recordPayment(ctxOf(req), idParam(req, 'id', 'Order'), parse(paymentInputSchema, req.body));
  res.status(replayed ? 200 : 201).json(payment);
}));

export const paymentsRouter = Router();
paymentsRouter.get('/', requirePermission('payments:read'), handler(async (req, res) => {
  res.json(await payments.listPayments(ctxOf(req), parse(paymentListQuery, req.query)));
}));
