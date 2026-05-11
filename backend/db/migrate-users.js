require('dotenv').config();
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running users & invitations migration...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        clerk_id     TEXT UNIQUE NOT NULL,
        email        TEXT UNIQUE NOT NULL,
        name         TEXT,
        role         VARCHAR(10) NOT NULL DEFAULT 'editor'
                     CHECK (role IN ('admin', 'editor')),
        status       VARCHAR(10) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended')),
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

      CREATE TABLE IF NOT EXISTS invitations (
        id           SERIAL PRIMARY KEY,
        email        TEXT NOT NULL,
        role         VARCHAR(10) NOT NULL DEFAULT 'editor'
                     CHECK (role IN ('admin', 'editor')),
        token        TEXT UNIQUE NOT NULL,
        invited_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at   TIMESTAMPTZ NOT NULL,
        accepted_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
    `);
    console.log('✅ Tables created.');

    // Seed the first admin from ALLOWED_CLERK_IDS env var
    const allowedIds = process.env.ALLOWED_CLERK_IDS
      ? process.env.ALLOWED_CLERK_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    if (!allowedIds.length) {
      console.warn('⚠️  ALLOWED_CLERK_IDS is not set. No admin bootstrapped.');
      console.warn('    Set ALLOWED_CLERK_IDS=<your-clerk-user-id> and re-run, or add a user manually.');
    } else {
      for (const clerkId of allowedIds) {
        const existing = await client.query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
        if (!existing.rows.length) {
          await client.query(
            `INSERT INTO users (clerk_id, email, name, role) VALUES ($1, $2, $3, 'admin')`,
            [clerkId, `admin-${clerkId.slice(-6)}@impacthouse.local`, 'Bootstrapped Admin']
          );
          console.log(`✅ Seeded admin for Clerk ID: ${clerkId}`);
          console.log('   Update their email/name via the admin panel or directly in the DB.');
        } else {
          console.log(`   Skipped (already exists): ${clerkId}`);
        }
      }
    }

    console.log('\n✅ Users migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
