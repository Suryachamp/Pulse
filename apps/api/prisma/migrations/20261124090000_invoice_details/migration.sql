-- Business details printed on invoices, and the payment terms that set each invoice's due date.
ALTER TABLE "Organization"
  ADD COLUMN "invoiceAddress" TEXT,
  ADD COLUMN "invoiceEmail" TEXT,
  ADD COLUMN "invoicePhone" TEXT,
  ADD COLUMN "invoiceTaxId" TEXT,
  ADD COLUMN "invoiceFooter" TEXT,
  ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_payment_terms_range" CHECK ("paymentTermsDays" >= 0 AND "paymentTermsDays" <= 365);
