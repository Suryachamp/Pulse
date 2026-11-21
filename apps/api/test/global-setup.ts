import { execSync } from 'node:child_process';

/** Applies pending migrations to the dedicated test database. Data is truncated per test. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://pulse:pulse@localhost:5432/pulse_test';
  if (!/test/.test(new URL(url).pathname)) throw new Error('Refusing to run tests against a database whose name does not contain "test"');
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
