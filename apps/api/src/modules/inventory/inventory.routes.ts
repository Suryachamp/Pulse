import { Router } from 'express';
import { productInputSchema, productListQuery, productUpdateSchema, stockAdjustmentSchema } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, idParam, parse } from '../../utils/http';
import * as svc from './products.service';

export const productsRouter = Router();

productsRouter.get('/', requirePermission('products:read'), handler(async (req, res) => {
  res.json(await svc.listProducts(ctxOf(req), parse(productListQuery, req.query)));
}));
productsRouter.get('/:id', requirePermission('products:read'), handler(async (req, res) => {
  res.json(await svc.getProduct(ctxOf(req), idParam(req, 'id', 'Product')));
}));
productsRouter.post('/', requirePermission('products:write'), handler(async (req, res) => {
  res.status(201).json(await svc.createProduct(ctxOf(req), parse(productInputSchema, req.body)));
}));
productsRouter.patch('/:id', requirePermission('products:write'), handler(async (req, res) => {
  res.json(await svc.updateProduct(ctxOf(req), idParam(req, 'id', 'Product'), parse(productUpdateSchema, req.body)));
}));
productsRouter.post('/:id/adjustments', requirePermission('inventory:adjust'), handler(async (req, res) => {
  res.status(201).json(await svc.adjustStock(ctxOf(req), idParam(req, 'id', 'Product'), parse(stockAdjustmentSchema, req.body)));
}));
productsRouter.post('/:id/archive', requirePermission('products:write'), handler(async (req, res) => {
  res.json(await svc.setArchived(ctxOf(req), idParam(req, 'id', 'Product'), true));
}));
productsRouter.post('/:id/restore', requirePermission('products:write'), handler(async (req, res) => {
  res.json(await svc.setArchived(ctxOf(req), idParam(req, 'id', 'Product'), false));
}));
productsRouter.delete('/:id', requirePermission('products:write'), handler(async (req, res) => {
  await svc.deleteProduct(ctxOf(req), idParam(req, 'id', 'Product'));
  res.status(204).end();
}));
