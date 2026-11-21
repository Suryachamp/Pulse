import { Router } from 'express';
import { taskInputSchema, taskListQuery, taskUpdateSchema } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, idParam, parse } from '../../utils/http';
import * as svc from './tasks.service';

export const tasksRouter = Router();

tasksRouter.get('/', requirePermission('tasks:read'), handler(async (req, res) => {
  res.json(await svc.listTasks(ctxOf(req), parse(taskListQuery, req.query)));
}));
tasksRouter.get('/summary', requirePermission('tasks:read'), handler(async (req, res) => {
  res.json(await svc.taskSummary(ctxOf(req)));
}));
tasksRouter.post('/', requirePermission('tasks:write'), handler(async (req, res) => {
  res.status(201).json(await svc.createTask(ctxOf(req), parse(taskInputSchema, req.body)));
}));
tasksRouter.patch('/:id', requirePermission('tasks:write'), handler(async (req, res) => {
  res.json(await svc.updateTask(ctxOf(req), idParam(req, 'id', 'Task'), parse(taskUpdateSchema, req.body)));
}));
tasksRouter.delete('/:id', requirePermission('tasks:write'), handler(async (req, res) => {
  await svc.deleteTask(ctxOf(req), idParam(req, 'id', 'Task'));
  res.status(204).end();
}));
