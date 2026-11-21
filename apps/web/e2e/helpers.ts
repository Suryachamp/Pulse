import { expect, type Page } from '@playwright/test';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function registerWorkspace(page: Page, org = 'E2E Goods') {
  const email = `owner-${uid()}@e2e.test`;
  const password = 'e2e-password-123';
  await page.goto('/register');
  await page.getByLabel('Business name').fill(`${org} ${uid()}`);
  await page.getByLabel('Your name').fill('Erin Owner');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);
  return { email, password };
}

export async function createProduct(page: Page, { name, sku, price, stock }: { name: string; sku: string; price: string; stock: number }) {
  await page.goto('/app/inventory');
  await page.getByRole('button', { name: 'New product' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await sheet.getByLabel('SKU').fill(sku);
  await sheet.getByLabel('Price (USD)').fill(price);
  await sheet.getByLabel('Opening stock').fill(String(stock));
  await sheet.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function createCustomer(page: Page, name: string) {
  await page.goto('/app/customers');
  await page.getByRole('button', { name: 'New customer' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await sheet.getByLabel('Email', { exact: true }).fill(`${uid()}@customer.test`);
  await sheet.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function createDraftOrder(page: Page, customer: string, product: string, qty: number) {
  await page.goto('/app/orders/new');
  await page.locator('#o-customer').click();
  await page.getByPlaceholder('Search customers…').fill(customer);
  await page.getByRole('option', { name: new RegExp(customer) }).click();
  await page.getByRole('button', { name: 'Add product' }).click();
  await page.getByPlaceholder('Search by name or SKU…').fill(product);
  await page.getByRole('option', { name: new RegExp(product) }).click();
  await page.getByLabel(`Quantity of ${product}`).fill(String(qty));
  await page.getByRole('button', { name: 'Create draft order' }).click();
  await expect(page.getByRole('heading', { name: /Order #\d+/ })).toBeVisible();
}
