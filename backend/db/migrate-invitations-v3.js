require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Adding first_name + last_name to invitations…');
    await client.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS first_name TEXT`);
    await client.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS last_name TEXT`);
    console.log('✅ Done.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};
migrate();
