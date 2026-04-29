require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running templates migration...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id                  SERIAL PRIMARY KEY,
        name                TEXT NOT NULL,
        channel             VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email','both')),
        subject             TEXT,
        body                TEXT NOT NULL,
        created_by_clerk_id TEXT,
        created_by_name     TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_templates_channel ON message_templates(channel);
    `);
    console.log('✅ Templates migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
