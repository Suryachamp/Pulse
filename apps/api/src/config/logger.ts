import pino from 'pino';
import { env, isProd, isTest } from './env';

export const logger = pino({
  level: isTest ? (process.env.TEST_LOG_LEVEL ?? 'silent') : env.LOG_LEVEL,
  redact: { paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash'], remove: true },
  transport: isProd || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
});
