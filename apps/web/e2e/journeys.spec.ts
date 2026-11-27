import { expect, test } from '@playwright/test';
import { createCustomer, createDraftOrder, createProduct, registerWorkspace } from './helpers';

test('landing page explains the product and leads to sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('operating rhythm');
  await page.getByRole('link', { name: 'Create workspace' }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test('validates sign-up input before sending it', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
});

test('owner sells a product end to end: stock, order, payment, dashboard', async ({ page }) => {
  await registerWorkspace(page);
  await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible();

  await createProduct(page, { name: 'Walnut Tray', sku: 'TRY-WAL', price: '45.00', stock: 10 });
  await createCustomer(page, 'Marlow Café');
  await createDraftOrder(page, 'Marlow Café', 'Walnut Tray', 3);

  // Totals are calculated server-side from the catalog price.
  await expect(page.getByRole('region', { name: 'Items' })).toContainText('$135.00');

  await page.getByRole('button', { name: 'Confirm order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Order confirmed. Stock reserved.')).toBeVisible();

  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount (USD)').fill('50');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('region', { name: 'Payments' })).toContainText('Partially paid');

  // Overpaying is rejected before it reaches the books.
  await page.getByRole('button', { name: 'Record payment' }).click();
  await dialog.getByLabel('Amount (USD)').fill('500');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog.getByText(/outstanding balance is \$85\.00/i)).toBeVisible();
  await dialog.getByLabel('Amount (USD)').fill('85');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('region', { name: 'Payments' })).toContainText('Paid');

  await page.getByRole('button', { name: 'Mark fulfilled' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark fulfilled' }).click();
  await expect(page.getByText('Order fulfilled')).toBeVisible();

  // Stock moved from reserved to shipped.
  await page.getByRole('link', { name: 'Walnut Tray' }).click();
  await expect(page.getByRole('region', { name: 'Stock levels' })).toContainText('7');
  await expect(page.getByRole('region', { name: 'Movement history' })).toContainText('Fulfill');

  await page.goto('/app');
  await expect(page.getByRole('region', { name: 'Revenue, last 30 days' })).toContainText('$135.00');
});

test('refuses to confirm an order when stock has run out', async ({ page }) => {
  await registerWorkspace(page);
  await createProduct(page, { name: 'Last Lamp', sku: 'LMP-1', price: '80', stock: 1 });
  await createCustomer(page, 'Quinn Studio');
  await createDraftOrder(page, 'Quinn Studio', 'Last Lamp', 1);
  const first = page.url();
  await createDraftOrder(page, 'Quinn Studio', 'Last Lamp', 1);
  const second = page.url();

  await page.goto(first);
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Order confirmed. Stock reserved.')).toBeVisible();

  await page.goto(second);
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Not enough stock to confirm')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Order #/ })).toContainText('Draft');
});

test('command palette searches records and navigates', async ({ page }) => {
  await registerWorkspace(page);
  await createCustomer(page, 'Palette Partners');
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search customers, orders/).fill('Palette');
  await page.getByRole('option', { name: /Palette Partners/ }).click();
  await expect(page.getByRole('heading', { name: 'Palette Partners' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.getByRole('option', { name: /Inventory/ }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
});

test('staff see only what their role allows', async ({ page, browser }) => {
  await registerWorkspace(page);
  await page.goto('/app/team');
  await page.getByRole('button', { name: 'Add teammate' }).click();
  const staffEmail = `staff-${Date.now()}@e2e.test`;
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Sasha Staff');
  await dialog.getByLabel('Email', { exact: true }).fill(staffEmail);
  await dialog.getByLabel(/Starting password/).fill('staff-pass-123');
  await dialog.getByRole('button', { name: 'Add teammate' }).click();
  await expect(page.getByText(staffEmail)).toBeVisible();

  const staff = await browser.newPage();
  await staff.goto('/login');
  await staff.getByLabel('Email').fill(staffEmail);
  await staff.getByLabel('Password').fill('staff-pass-123');
  await staff.getByRole('button', { name: 'Sign in' }).click();
  await expect(staff).toHaveURL(/\/app$/);
  await expect(staff.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics' })).toHaveCount(0);
  await expect(staff.getByRole('region', { name: 'Revenue, last 30 days' })).toHaveCount(0);
  await staff.goto('/app/analytics');
  await expect(staff.getByText('You don’t have access to this page')).toBeVisible();
  await staff.goto('/app/orders');
  await expect(staff.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await expect(staff.getByRole('link', { name: 'Export CSV' })).toHaveCount(0);
  await staff.close();
});
