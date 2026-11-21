process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://pulse:pulse@localhost:5432/pulse_test';
process.env.WEB_ORIGIN = 'http://localhost:5173';
