require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');

    await client.query(`
      -- Admins (app users / staff)
      CREATE TABLE IF NOT EXISTS admins (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        email       VARCHAR(255) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        role        VARCHAR(30) DEFAULT 'admin',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Member groups
      CREATE TABLE IF NOT EXISTS groups (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Church members
      CREATE TABLE IF NOT EXISTS members (
        id           SERIAL PRIMARY KEY,
        first_name   VARCHAR(80)  NOT NULL,
        last_name    VARCHAR(80)  NOT NULL,
        email        VARCHAR(255),
        phone        VARCHAR(30),
        group_id     INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        notify_sms   BOOLEAN DEFAULT TRUE,
        notify_email BOOLEAN DEFAULT TRUE,
        status       VARCHAR(20) DEFAULT 'active',
        notes        TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );

      -- Broadcast messages
      CREATE TABLE IF NOT EXISTS messages (
        id              SERIAL PRIMARY KEY,
        title           VARCHAR(255) NOT NULL,
        body            TEXT NOT NULL,
        subject         VARCHAR(255),
        channel         VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
        status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
        recipient_type  VARCHAR(20) DEFAULT 'all',
        group_id        INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        sent_by         INTEGER REFERENCES admins(id),
        total_sent      INTEGER DEFAULT 0,
        total_delivered INTEGER DEFAULT 0,
        total_opened    INTEGER DEFAULT 0,
        scheduled_at    TIMESTAMPTZ,
        sent_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      -- Per-member delivery records
      CREATE TABLE IF NOT EXISTS message_deliveries (
        id          SERIAL PRIMARY KEY,
        message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        channel     VARCHAR(10) NOT NULL,
        status      VARCHAR(20) DEFAULT 'pending',
        opened_at   TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        error       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (message_id, member_id, channel)
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
      CREATE INDEX IF NOT EXISTS idx_members_group  ON members(group_id);
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_message ON message_deliveries(message_id);
    `);

    // Seed default groups
    await client.query(`
      INSERT INTO groups (name) VALUES
        ('General'), ('Elders'), ('Youth'), ('Choir'), ('Deacons')
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
