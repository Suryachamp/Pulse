import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createCustomer, createDraftOrder, createProduct, registerWorkspace } from './helpers';

test('owner downloads orders and customers as CSV', async ({ page }) => {
  await registerWorkspace(page);
  await createProduct(page, { name: 'Linen Apron', sku: 'APR-LN', price: '28.00', stock: 10 });
  await createCustomer(page, 'Saltmarsh Bakery, Ltd');
  await createDraftOrder(page, 'Saltmarsh Bakery, Ltd', 'Linen Apron', 3);

  await page.goto('/app/orders');
  const [orders] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
  expect(orders.suggestedFilename()).toMatch(/^pulse-orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const ordersCsv = await readFile((await orders.path())!, 'utf8');
  expect(ordersCsv).toContain('number,status,payment_status');
  expect(ordersCsv).toContain('"Saltmarsh Bakery, Ltd"');
  expect(ordersCsv).toContain('84.00');

  await page.goto('/app/customers');
  const [customers] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
  const customersCsv = await readFile((await customers.path())!, 'utf8');
  expect(customersCsv.split('\r\n')[1]).toMatch(/^"Saltmarsh Bakery, Ltd",/);
});
