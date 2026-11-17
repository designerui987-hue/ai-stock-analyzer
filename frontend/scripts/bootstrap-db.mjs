import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const legacy = ['20260727095446_init', '20260727102905_init'];
const baseline = '20261104100000_migrate_to_postgresql';
const applicationTables = new Set(['Signal', 'AlertPreference', 'AlertLog', 'BrokerConnection', 'OrderLog', 'OAuthState', 'WatchlistItem']);
const require = createRequire(import.meta.url);
const prisma = new PrismaClient();

function runPrisma(...args) {
  const result = spawnSync(process.execPath, [require.resolve('prisma'), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`prisma ${args.join(' ')} failed`);
}

try {
  const rows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  const tables = new Set(rows.map((row) => row.tablename));
  let applied = new Set();
  if (tables.has('_prisma_migrations')) {
    const history = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"
    `;
    if (history.some((row) => !row.finished_at && !row.rolled_back_at)) {
      throw new Error('An existing migration failed. Inspect the migration history before continuing.');
    }
    applied = new Set(history.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  }
  if (!applied.has(baseline) && [...tables].some((table) => applicationTables.has(table))) {
    throw new Error('Existing application tables have no recorded PostgreSQL baseline. Inspect or back them up before baselining.');
  }
  // The PostgreSQL baseline supersedes these SQLite-only migrations.
  for (const migration of legacy) {
    if (!applied.has(migration)) runPrisma('migrate', 'resolve', '--applied', migration);
  }
  runPrisma('migrate', 'deploy');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
