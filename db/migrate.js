const { pool } = require('../db');

async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        equipment_name VARCHAR NOT NULL,
        site_location VARCHAR NOT NULL,
        maintenance_interval_days INTEGER NOT NULL,
        estimated_duration_hours NUMERIC NOT NULL,
        last_completed_date DATE,
        next_due_date DATE,
        skill_type_required VARCHAR DEFAULT 'general'
      );

      CREATE TABLE IF NOT EXISTS technicians (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        site VARCHAR NOT NULL,
        skill_type VARCHAR NOT NULL,
        open_task_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id SERIAL PRIMARY KEY,
        status VARCHAR DEFAULT 'open',
        asset_id INTEGER REFERENCES assets(id),
        technician_id INTEGER REFERENCES technicians(id),
        planner_task_id VARCHAR,
        due_date DATE,
        notes TEXT,
        raised_by VARCHAR,
        approved_by VARCHAR,
        created_at TIMESTAMP DEFAULT now(),
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS escalation_log (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER REFERENCES work_orders(id),
        escalated_to VARCHAR,
        escalated_at TIMESTAMP DEFAULT now(),
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER REFERENCES work_orders(id),
        notification_type VARCHAR,
        sent_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS email_summaries (
        id SERIAL PRIMARY KEY,
        email_message_id VARCHAR UNIQUE,
        sender VARCHAR,
        subject VARCHAR,
        summary_text TEXT,
        category VARCHAR,
        date_received TIMESTAMP,
        processed_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS email_action_items (
        id SERIAL PRIMARY KEY,
        email_summary_id INTEGER REFERENCES email_summaries(id),
        title VARCHAR,
        assigned_to VARCHAR,
        due_date DATE,
        estimated_hours NUMERIC,
        planner_task_id VARCHAR,
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        role VARCHAR DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    console.log('Migration complete: all tables created or already exist.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
