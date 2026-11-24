import { expect, test } from '@playwright/test';
import { createCustomer, createDraftOrder, createProduct, registerWorkspace } from './helpers';

test('owner sets invoice details and prints an invoice for a confirmed order', async ({ page }) => {
  await registerWorkspace(page);

  await page.goto('/app/settings');
  const invoices = page.getByRole('region', { name: 'Invoices' });
  await invoices.getByLabel('Business address').fill('4 Mill Lane\nBristol BS1 4AA');
  await invoices.getByLabel('Tax ID').fill('GB998877665');
  await invoices.getByLabel('Payment terms (days)').fill('400');
  await invoices.getByRole('button', { name: 'Save invoice details' }).click();
  await expect(invoices.getByText('At most 365 days')).toBeVisible();
  await invoices.getByLabel('Payment terms (days)').fill('30');
  await invoices.getByLabel('Footer note').fill('Pay by bank transfer to 12-34-56 87654321');
  await invoices.getByRole('button', { name: 'Save invoice details' }).click();
  await expect(page.getByText('Invoice details saved')).toBeVisible();

  await createProduct(page, { name: 'Oak Stool', sku: 'STL-OAK', price: '60.00', stock: 5 });
  await createCustomer(page, 'Harbour Deli');
  await createDraftOrder(page, 'Harbour Deli', 'Oak Stool', 2);

  // Drafts have no invoice yet.
  await expect(page.getByRole('link', { name: 'Invoice' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Order confirmed. Stock reserved.')).toBeVisible();

  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByRole('dialog').getByLabel('Amount (USD)').fill('20');
  await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('region', { name: 'Payments' })).toContainText('Partially paid');

  await page.getByRole('link', { name: 'Invoice' }).click();
  const invoice = page.getByRole('article', { name: /Invoice 1/ });
  await expect(invoice).toContainText('4 Mill Lane');
  await expect(invoice).toContainText('GB998877665');
  await expect(invoice).toContainText('Harbour Deli');
  await expect(invoice).toContainText('Net 30');
  await expect(invoice).toContainText('Pay by bank transfer');
  await expect(invoice.getByTestId('invoice-status')).toHaveText('Due');
  await expect(invoice.getByTestId('balance-due')).toHaveText('$100.00');
  await expect(page.getByRole('button', { name: 'Print or save PDF' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to order' }).click();
  await expect(page.getByRole('heading', { name: /Order #1/ })).toBeVisible();
});
