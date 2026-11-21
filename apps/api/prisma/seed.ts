/**
 * Development/demo seed: one organization with six months of internally consistent history.
 * Writes directly (with explicit timestamps) rather than through the services so history can be
 * backdated, but replays the same rules: stock never goes negative, reservations precede
 * fulfilment, payments never exceed totals, and every change has a movement and audit entry.
 */
import { PrismaClient, type Customer, type MovementType, type Product, type OrderStatus, type PaymentMethod, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { calculateOrderTotals } from '@pulse/shared';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const NOW = Date.now();

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const at = (daysAgo: number, jitterHours = 8) => new Date(NOW - daysAgo * DAY + int(-jitterHours, jitterHours) * 3_600_000);

const FIRST = ['Maya', 'Leo', 'Aisha', 'Noah', 'Priya', 'Mateo', 'Hana', 'Oliver', 'Zara', 'Ethan', 'Lena', 'Kofi', 'Sofia', 'Ravi', 'Ingrid', 'Tomás', 'Yuki', 'Amara', 'Felix', 'Nadia'];
const LAST = ['Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Tanaka', 'Silva', 'Kowalski', 'Reyes', 'Brennan', 'Achebe', 'Novak', 'Iyer', 'Fischer', 'Duarte', 'Park'];
const COMPANIES = ['Copper Kettle Café', 'Northline Studios', 'Brightwater Dental', 'Fern & Field Florist', 'Union Street Bakery', 'Atlas Physio', 'Saltbox Hotel', 'Kiln Ceramics', 'Meridian Yoga', 'Harbor Books', 'Larch Architecture', 'Ember Coffee Roasters', 'Tidewater Marina', 'Quill Stationers', 'Juniper Spa'];
const TAGS = ['wholesale', 'retail', 'vip', 'net-30', 'new', 'hospitality'];
const PRODUCTS: [string, string, number, number][] = [
  ['Stoneware Mug 12oz', 'MUG-12', 1800, 650], ['Stoneware Mug 16oz', 'MUG-16', 2200, 780], ['Pour-over Kettle', 'KET-PO', 6400, 3100],
  ['Ceramic Dripper', 'DRP-01', 2800, 1100], ['Linen Napkins (4)', 'NAP-LN4', 3200, 1300], ['Olive Wood Board', 'BRD-OW', 5400, 2400],
  ['Glass Carafe 1L', 'CRF-1L', 3600, 1500], ['Espresso Cups (2)', 'ESP-2', 2400, 900], ['Cast Iron Skillet', 'SKL-10', 7800, 3900],
  ['Beeswax Candle', 'CND-BW', 1600, 500], ['Cotton Apron', 'APR-CT', 3800, 1600], ['Tea Canister', 'TEA-CN', 2100, 800],
  ['Serving Bowl Large', 'BWL-LG', 4800, 2000], ['Salt Cellar', 'SLT-CL', 1900, 700], ['Bread Knife', 'KNF-BR', 5600, 2600],
  ['Wool Throw', 'THR-WL', 12800, 6200], ['Market Tote', 'TOT-MK', 2600, 900], ['Brass Measuring Spoons', 'SPN-BR', 3400, 1400],
  ['Dinner Plate', 'PLT-DN', 2600, 1000], ['Side Plate', 'PLT-SD', 1900, 700], ['Coffee Beans 1kg', 'BNS-1K', 3900, 2100],
  ['Hand-thrown Vase', 'VSE-HT', 8800, 3600],
];

type Stock = { onHand: number; reserved: number };

async function main() {
  const email = 'owner@pulse.demo';
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log('Demo data already present; nothing to do.');
    return;
  }

  const passwordHash = await argon2.hash('pulse-demo-2026', { type: argon2.argon2id });
  const [owner, manager, staff, staff2] = await Promise.all(
    [
      ['Avery Collins', email],
      ['Jordan Blake', 'manager@pulse.demo'],
      ['Sam Rivera', 'staff@pulse.demo'],
      ['Riley Chen', 'riley@pulse.demo'],
    ].map(([name, e]) => prisma.user.create({ data: { name: name!, email: e!, passwordHash } })),
  );
  if (!owner || !manager || !staff || !staff2) throw new Error('user creation failed');

  const org = await prisma.organization.create({
    data: { name: 'Harbor & Pine Supply Co.', slug: 'harbor-pine', defaultLowStockThreshold: 8, defaultTaxRateBps: 825, createdAt: at(190, 0) },
  });
  const orgId = org.id;
  await prisma.membership.createMany({
    data: [
      { organizationId: orgId, userId: owner.id, role: 'OWNER' },
      { organizationId: orgId, userId: manager.id, role: 'MANAGER' },
      { organizationId: orgId, userId: staff.id, role: 'STAFF' },
      { organizationId: orgId, userId: staff2.id, role: 'STAFF' },
    ],
  });
  const people = [owner, manager, staff, staff2];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const log = (createdAt: Date, actorId: string, action: string, entityType: string, entityId: string, summary: string, metadata: Prisma.InputJsonObject = {}) =>
    audits.push({ organizationId: orgId, actorId, action, entityType, entityId, summary, metadata, createdAt });

  // Customers
  const customers: Customer[] = [];
  for (let i = 0; i < 42; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const company = rand() < 0.6 ? pick(COMPANIES) : null;
    const createdAt = at(int(120, 185));
    const c = await prisma.customer.create({
      data: {
        organizationId: orgId,
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${i}@example.com`,
        phone: `+1 555 01${String(i).padStart(2, '0')}`,
        company,
        tags: [...new Set([pick(TAGS), ...(rand() < 0.4 ? [pick(TAGS)] : [])])],
        createdAt,
        archivedAt: i >= 40 ? at(10) : null,
      },
    });
    customers.push(c);
    log(createdAt, pick(people).id, 'customer.created', 'Customer', c.id, `Added customer ${c.name}`);
  }
  const activeCustomers = customers.filter((c) => !c.archivedAt);

  // Products and opening stock
  const stock = new Map<string, Stock>();
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  const move = (productId: string, type: MovementType, dOn: number, dRes: number, createdAt: Date, actorId: string, reason: string, orderId?: string) => {
    const s = stock.get(productId)!;
    s.onHand += dOn;
    s.reserved += dRes;
    if (s.onHand < 0 || s.reserved < 0 || s.reserved > s.onHand) throw new Error(`seed invariant broken for ${productId}`);
    movements.push({ organizationId: orgId, productId, type, onHandDelta: dOn, reservedDelta: dRes, onHandAfter: s.onHand, reservedAfter: s.reserved, reason, createdAt, actorId, orderId: orderId ?? null });
  };
  const products: Product[] = [];
  for (const [name, sku, priceCents, costCents] of PRODUCTS) {
    const createdAt = at(185, 2);
    const p = await prisma.product.create({ data: { organizationId: orgId, name, sku, priceCents, costCents, lowStockThreshold: int(5, 12), createdAt } });
    products.push(p);
    stock.set(p.id, { onHand: 0, reserved: 0 });
    move(p.id, 'INITIAL', int(30, 90), 0, createdAt, owner.id, 'Opening stock');
    log(createdAt, owner.id, 'product.created', 'Product', p.id, `Added product ${p.name} (${p.sku})`);
  }

  // Orders over ~180 days, growing over time.
  let number = 0;
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const methods: PaymentMethod[] = ['CARD', 'CARD', 'CARD', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CASH', 'CHECK'];
  for (let day = 178; day >= 0; day--) {
    const perDay = rand() < 0.35 + (180 - day) / 400 ? int(1, 3) : 0;
    for (let k = 0; k < perDay; k++) {
      const customer = pick(activeCustomers);
      const actor = pick(people);
      const chosen = [...new Set(Array.from({ length: int(1, 4) }, () => pick(products)))];
      const lines = chosen.map((p) => ({ productId: p.id, productName: p.name, sku: p.sku, unitPriceCents: p.priceCents, quantity: int(1, 6), lineTotalCents: 0 }));
      lines.forEach((l) => (l.lineTotalCents = l.unitPriceCents * l.quantity));
      const totals = calculateOrderTotals({ items: lines, discountCents: rand() < 0.15 ? 500 : 0, taxRateBps: org.defaultTaxRateBps });

      const createdAt = at(day + 0.2, 3);
      // Older orders have mostly run their course; recent ones are still in flight.
      const r = rand();
      let status: OrderStatus;
      if (day > 14) status = r < 0.08 ? 'CANCELLED' : r < 0.88 ? 'COMPLETED' : 'FULFILLED';
      else if (day > 3) status = r < 0.06 ? 'CANCELLED' : r < 0.45 ? 'COMPLETED' : r < 0.8 ? 'FULFILLED' : 'CONFIRMED';
      else status = r < 0.25 ? 'DRAFT' : r < 0.7 ? 'CONFIRMED' : 'FULFILLED';

      number += 1;
      const orderId = crypto.randomUUID();
      const confirmedAt = status === 'DRAFT' ? null : new Date(createdAt.getTime() + int(1, 20) * 3_600_000);
      const cancelledBeforeConfirm = status === 'CANCELLED' && rand() < 0.4;
      const fulfilledAt = ['FULFILLED', 'COMPLETED'].includes(status) && confirmedAt ? new Date(confirmedAt.getTime() + int(4, 60) * 3_600_000) : null;
      const completedAt = status === 'COMPLETED' && fulfilledAt ? new Date(fulfilledAt.getTime() + int(24, 120) * 3_600_000) : null;
      const cancelledAt = status === 'CANCELLED' ? new Date((confirmedAt ?? createdAt).getTime() + int(2, 48) * 3_600_000) : null;
      const clamp = (d: Date | null) => (d && d.getTime() > NOW ? new Date(NOW - 60_000) : d);

      // Make sure there is stock to sell; a manager restocks when needed.
      if (confirmedAt && !cancelledBeforeConfirm) {
        for (const l of lines) {
          const s = stock.get(l.productId)!;
          if (s.onHand - s.reserved < l.quantity) move(l.productId, 'RESTOCK', int(40, 80), 0, new Date(confirmedAt.getTime() - 3_600_000), manager.id, 'Supplier delivery');
        }
      }

      const paidTarget =
        status === 'COMPLETED' ? (rand() < 0.9 ? totals.totalCents : Math.round(totals.totalCents * 0.5)) :
        status === 'FULFILLED' ? (rand() < 0.5 ? totals.totalCents : rand() < 0.5 ? Math.round(totals.totalCents * 0.4) : 0) :
        status === 'CONFIRMED' ? (rand() < 0.3 ? Math.round(totals.totalCents * 0.3) : 0) :
        status === 'CANCELLED' && !cancelledBeforeConfirm && rand() < 0.3 ? Math.round(totals.totalCents * 0.25) : 0;

      await prisma.order.create({
        data: {
          id: orderId,
          organizationId: orgId,
          number,
          customerId: customer.id,
          createdById: actor.id,
          status,
          ...totals,
          taxRateBps: org.defaultTaxRateBps,
          createdAt,
          updatedAt: clamp(completedAt ?? cancelledAt ?? fulfilledAt ?? confirmedAt ?? createdAt)!,
          confirmedAt: cancelledBeforeConfirm ? null : clamp(confirmedAt),
          fulfilledAt: clamp(fulfilledAt),
          completedAt: clamp(completedAt),
          cancelledAt: clamp(cancelledAt),
          cancelReason: status === 'CANCELLED' ? pick(['Customer changed their mind', 'Duplicate order', 'Payment not received', 'Item no longer needed']) : null,
          items: { create: lines },
        },
      });
      log(createdAt, actor.id, 'order.created', 'Order', orderId, `Created draft order #${number} for ${customer.name}`, { totalCents: totals.totalCents });

      if (confirmedAt && !cancelledBeforeConfirm) {
        for (const l of lines) move(l.productId, 'RESERVE', 0, l.quantity, clamp(confirmedAt)!, actor.id, `Reserved for order #${number}`, orderId);
        log(clamp(confirmedAt)!, actor.id, 'order.confirmed', 'Order', orderId, `Order #${number} confirmed`, { from: 'DRAFT', to: 'CONFIRMED' });
      }
      if (fulfilledAt) {
        for (const l of lines) move(l.productId, 'FULFILL', -l.quantity, -l.quantity, clamp(fulfilledAt)!, staff.id, `Shipped on order #${number}`, orderId);
        log(clamp(fulfilledAt)!, staff.id, 'order.fulfilled', 'Order', orderId, `Order #${number} fulfilled`, { from: 'CONFIRMED', to: 'FULFILLED' });
      }
      if (completedAt) log(clamp(completedAt)!, manager.id, 'order.completed', 'Order', orderId, `Order #${number} completed`, { from: 'FULFILLED', to: 'COMPLETED' });

      let paid = 0;
      if (paidTarget > 0 && confirmedAt) {
        const parts = paidTarget === totals.totalCents && rand() < 0.3 ? [Math.round(paidTarget * 0.4), paidTarget - Math.round(paidTarget * 0.4)] : [paidTarget];
        for (const [i, amount] of parts.entries()) {
          const receivedAt = clamp(new Date((fulfilledAt ?? confirmedAt).getTime() + int(1, 24 * (i + 1) * 5) * 3_600_000))!;
          const payment = { organizationId: orgId, orderId, recordedById: manager.id, kind: 'PAYMENT' as const, method: pick(methods), amountCents: amount, idempotencyKey: `seed-${orderId}-${i}`, receivedAt, createdAt: receivedAt };
          payments.push(payment);
          paid += amount;
          log(receivedAt, manager.id, 'payment.recorded', 'Order', orderId, `Recorded payment of $${(amount / 100).toFixed(2)} on order #${number}`, { amountCents: amount, method: payment.method });
        }
      }
      let refunded = 0;
      if (status === 'CANCELLED' && paid > 0 && cancelledAt) {
        refunded = paid;
        const receivedAt = clamp(new Date(cancelledAt.getTime() + 3_600_000))!;
        payments.push({ organizationId: orgId, orderId, recordedById: owner.id, kind: 'REFUND', method: 'CARD', amountCents: paid, idempotencyKey: `seed-${orderId}-refund`, receivedAt, createdAt: receivedAt });
        log(receivedAt, owner.id, 'payment.refunded', 'Order', orderId, `Recorded refund of $${(paid / 100).toFixed(2)} on order #${number}`, { amountCents: paid });
      } else if (completedAt && paid === totals.totalCents && rand() < 0.04) {
        refunded = Math.round(paid * 0.2);
        const receivedAt = clamp(new Date(completedAt.getTime() + 2 * DAY))!;
        payments.push({ organizationId: orgId, orderId, recordedById: owner.id, kind: 'REFUND', method: 'CARD', amountCents: refunded, idempotencyKey: `seed-${orderId}-refund`, receivedAt, createdAt: receivedAt, note: 'Partial refund: damaged item' });
        log(receivedAt, owner.id, 'payment.refunded', 'Order', orderId, `Recorded refund of $${(refunded / 100).toFixed(2)} on order #${number}`, { amountCents: refunded });
      }
      if (status === 'CANCELLED' && confirmedAt && !cancelledBeforeConfirm) {
        for (const l of lines) move(l.productId, 'RELEASE', 0, -l.quantity, clamp(cancelledAt)!, manager.id, `Released from cancelled order #${number}`, orderId);
      }
      if (status === 'CANCELLED') log(clamp(cancelledAt)!, manager.id, 'order.cancelled', 'Order', orderId, `Order #${number} cancelled`, { to: 'CANCELLED' });
      if (paid || refunded) await prisma.order.update({ where: { id: orderId }, data: { paidCents: paid, refundedCents: refunded } });
    }
  }

  // Drive a few products below threshold so low-stock flows have something real to show.
  for (const p of products.slice(0, 4)) {
    const s = stock.get(p.id)!;
    const target = int(0, Math.max(0, p.lowStockThreshold - 2));
    const delta = target + s.reserved - s.onHand;
    if (delta < 0) move(p.id, 'ADJUSTMENT', delta, 0, at(1), manager.id, 'Cycle count correction');
  }

  await prisma.inventoryMovement.createMany({ data: movements });
  await prisma.payment.createMany({ data: payments });
  for (const p of products) {
    const s = stock.get(p.id)!;
    await prisma.product.update({ where: { id: p.id }, data: { onHand: s.onHand, reserved: s.reserved } });
  }
  await prisma.organization.update({ where: { id: orgId }, data: { orderSequence: number } });

  // Tasks
  const TASKS: [string, 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT', number | null][] = [
    ['Follow up on overdue invoices', 'HIGH', -2], ['Reorder pour-over kettles', 'URGENT', 1], ['Photograph new ceramics line', 'MEDIUM', 6],
    ['Quarterly stock count', 'HIGH', 9], ['Update wholesale price sheet', 'MEDIUM', 14], ['Call Saltbox Hotel about bulk order', 'HIGH', -1],
    ['Fix shelf labels in aisle 3', 'LOW', null], ['Prepare holiday gift bundles', 'MEDIUM', 20], ['Review supplier contract', 'LOW', 30],
    ['Train Riley on fulfilment flow', 'MEDIUM', 3], ['Return damaged plates to supplier', 'HIGH', -4], ['Plan spring pop-up market', 'LOW', 45],
  ];
  const statuses = ['TODO', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
  for (const [i, [title, priority, due]] of TASKS.entries()) {
    const status = i < 3 ? 'TODO' : pick(statuses);
    const assignee = pick(people);
    const createdAt = at(int(5, 25));
    const t = await prisma.task.create({
      data: {
        organizationId: orgId, title, priority, status, createdById: manager.id, assigneeId: rand() < 0.85 ? assignee.id : null,
        dueAt: due === null ? null : new Date(NOW + due * DAY), position: (i + 1) * 1024, createdAt,
        completedAt: status === 'DONE' ? at(1) : null,
        customerId: title.includes('Saltbox') ? (customers.find((c) => c.company === 'Saltbox Hotel')?.id ?? null) : null,
      },
    });
    log(createdAt, manager.id, 'task.created', 'Task', t.id, `Created task "${t.title}"`);
  }

  await prisma.auditLog.createMany({ data: audits });

  // A few unread notifications for the owner.
  const low = await prisma.$queryRaw<{ id: string; name: string; available: number }[]>`
    SELECT "id","name",("onHand"-"reserved")::int AS available FROM "Product" WHERE "organizationId" = ${orgId}::uuid AND ("onHand"-"reserved") <= "lowStockThreshold" LIMIT 3`;
  await prisma.notification.createMany({
    data: low.map((p) => ({ organizationId: orgId, userId: owner.id, type: 'LOW_STOCK' as const, title: `${p.name} is running low`, body: `${p.available} available.`, link: `/app/inventory/${p.id}`, createdAt: at(1) })),
  });

  console.log(`Seeded ${customers.length} customers, ${products.length} products, ${number} orders, ${payments.length} payments, ${movements.length} movements, ${audits.length} audit entries.`);
  console.log('Sign in with owner@pulse.demo / pulse-demo-2026 (also manager@ and staff@pulse.demo).');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
