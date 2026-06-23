CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL UNIQUE,
  google_sheet_url TEXT,
  last_sync TIMESTAMP,
  sync_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO data_sources (source_type) VALUES ('revenue_plan'), ('shift_schedule')
ON CONFLICT (source_type) DO NOTHING;
