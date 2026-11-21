import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './database/prisma';
import { createApp } from './app';

const server = createApp().listen(env.PORT, () => logger.info(`PULSE API listening on :${env.PORT}`));

// Expired sessions are useless; prune them periodically.
const prune = setInterval(() => {
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((err: unknown) => logger.error({ err }, 'Session prune failed'));
}, 60 * 60 * 1000);

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(prune);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
