-- Create tables for Работяга

CREATE TABLE IF NOT EXISTS kv_store (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  repeat VARCHAR(50) NOT NULL DEFAULT 'daily',
  kind VARCHAR(50),
  date DATE,
  from_date DATE,
  until_date DATE,
  day_of_week INT,
  priority BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_completion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL,
  completed_by VARCHAR(255),
  done BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, completion_date)
);

CREATE TABLE IF NOT EXISTS employee_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  telegram_id BIGINT UNIQUE,
  telegram_username VARCHAR(255),
  role VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employee_bindings(id) ON DELETE SET NULL,
  employee_name VARCHAR(255),
  recipient_telegram_id BIGINT,
  text TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date DATE NOT NULL,
  scheduled_time TIME,
  employee_id UUID REFERENCES employee_bindings(id) ON DELETE SET NULL,
  employee_name VARCHAR(255),
  message_template VARCHAR(255),
  message_text TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(schedule_date, scheduled_time, employee_id)
);

CREATE TABLE IF NOT EXISTS revenue_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date DATE NOT NULL UNIQUE,
  revenue_amount DECIMAL(10, 2),
  notes TEXT,
  approved BOOLEAN DEFAULT false,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shift_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL,
  employee_id UUID NOT NULL REFERENCES employee_bindings(id) ON DELETE CASCADE,
  shift_type VARCHAR(50),
  start_time TIME,
  end_time TIME,
  sick_leave BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shift_date, employee_id)
);

-- Create indexes for performance
CREATE INDEX idx_task_completion_date ON task_completion(completion_date);
CREATE INDEX idx_task_completion_task ON task_completion(task_id);
CREATE INDEX idx_push_log_date ON push_log(created_at);
CREATE INDEX idx_push_log_employee ON push_log(employee_id);
CREATE INDEX idx_push_schedule_date ON push_schedule(schedule_date);
CREATE INDEX idx_shift_schedule_date ON shift_schedule(shift_date);
CREATE INDEX idx_shift_schedule_employee ON shift_schedule(employee_id);
CREATE INDEX idx_revenue_plan_date ON revenue_plan(plan_date);
