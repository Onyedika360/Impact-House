require('dotenv').config();
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running public-features migration...');

    await client.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS gender          VARCHAR(20),
        ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS unsubscribed_at   TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_members_unsubscribe_token
        ON members(unsubscribe_token);
    `);
    console.log('✅ Columns added.');

    // Backfill tokens for any member that doesn't have one yet
    const { rows } = await client.query(
      `SELECT id FROM members WHERE unsubscribe_token IS NULL`
    );
    console.log(`Backfilling tokens for ${rows.length} members...`);
    for (const { id } of rows) {
      await client.query(
        `UPDATE members SET unsubscribe_token = $1 WHERE id = $2`,
        [randomUUID(), id]
      );
    }
    console.log('✅ Tokens backfilled.');
    console.log('✅ Public-features migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
