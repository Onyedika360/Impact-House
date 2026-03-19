require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running Clerk migration...');
    await client.query(`
      -- Change sent_by from integer FK to text (Clerk user ID)
      ALTER TABLE messages DROP COLUMN IF EXISTS sent_by;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_clerk_id TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_name TEXT;
    `);
    console.log('✅ Clerk migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
