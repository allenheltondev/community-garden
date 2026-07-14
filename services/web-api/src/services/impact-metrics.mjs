import pg from 'pg';

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured');
    }
    const sslDisabled = /(?:[?&]|^)sslmode=disable(?:&|$)/i.test(connectionString);
    pool = new pg.Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 5_000,
      ...(sslDisabled ? {} : { ssl: { rejectUnauthorized: true } })
    });
  }
  return pool;
}

/**
 * Public read of admin-managed impact metrics. The table is owned and written
 * by admin-api; the foundation site reads it here from the shared database.
 *
 * Resilient by design: if the table does not exist yet (fresh environment
 * where admin migrations have not run) we return an empty list so the public
 * StatsRow simply shows its live tiles instead of erroring.
 */
export async function listPublicImpactMetrics() {
  try {
    const result = await getPool().query(
      `select id::text as id, label, value, caption, sort_order
         from impact_metrics
        order by sort_order asc, created_at asc`
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        label: row.label,
        value: row.value,
        caption: row.caption ?? null,
        sortOrder: row.sort_order
      }))
    };
  } catch (error) {
    // 42P01 = undefined_table. Treat a not-yet-migrated table as "no metrics".
    if (error?.code === '42P01') {
      return { items: [] };
    }
    throw error;
  }
}
