require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Migrating invitations table to Clerk-native flow…');

    // Clear old rows (tokens are all invalid now)
    await client.query('TRUNCATE invitations');

    // Drop old columns
    await client.query(`ALTER TABLE invitations DROP COLUMN IF EXISTS token`);
    await client.query(`ALTER TABLE invitations DROP COLUMN IF EXISTS expires_at`);
    await client.query(`ALTER TABLE invitations DROP COLUMN IF EXISTS accepted_at`);

    // Add new columns
    await client.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS clerk_invitation_id TEXT UNIQUE`);
    await client.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`);

    // Drop old token index if it exists
    await client.query(`DROP INDEX IF EXISTS idx_invitations_token`);

    console.log('✅ Invitations migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
