require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running groups migration...');
    await client.query('BEGIN');

    // Add type column to groups (primary | custom)
    await client.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'primary'`);

    // Create member_tags junction table (many-to-many)
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_tags (
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        group_id  INTEGER REFERENCES groups(id)  ON DELETE CASCADE,
        PRIMARY KEY (member_id, group_id)
      )
    `);

    // Replace old groups with new primary groups
    await client.query(`DELETE FROM groups`);
    await client.query(`
      INSERT INTO groups (name, type) VALUES
        ('General Members', 'primary'),
        ('Workforce', 'primary')
    `);

    // Migrate all existing members → General Members
    await client.query(`
      INSERT INTO member_tags (member_id, group_id)
      SELECT m.id, g.id
      FROM members m, groups g
      WHERE g.name = 'General Members'
      ON CONFLICT DO NOTHING
    `);

    // Clear legacy single group_id on members (no longer used)
    await client.query(`UPDATE members SET group_id = NULL`);

    await client.query('COMMIT');
    console.log('✅ Groups migration complete. All members assigned to General Members.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
