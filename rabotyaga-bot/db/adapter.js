'use strict';
// adapter.js — SEC-8: все методы принимают tenantId первым аргументом.
// SQL: WHERE tenant_id=$1 / ON CONFLICT (tenant_id, …).
// Новые методы: listActiveTenants, getTenant, createTenant,
//               getTenantIntegrations, setTenantIntegration.
const pool = require('./pool');

class DataAdapter {
  // ── KV store ──────────────────────────────────────────────────────────────

  async kvGet(tenantId, key) {
    const res = await pool.query(
      'SELECT value FROM kv_store WHERE tenant_id = $1 AND key = $2',
      [tenantId, key]
    );
    return res.rows[0]?.value ?? null;
  }

  async kvSet(tenantId, key, value) {
    await pool.query(
      `INSERT INTO kv_store (tenant_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [tenantId, key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
  }

  // Все kv-ключи тенанта разом — для PG-first загрузки при старте.
  async kvGetAll(tenantId) {
    const res = await pool.query(
      'SELECT key, value FROM kv_store WHERE tenant_id = $1',
      [tenantId]
    );
    const out = {};
    res.rows.forEach(row => { out[row.key] = row.value; });
    return out;
  }

  // Удаление ключа — иначе удалённое в памяти «воскресает» после рестарта.
  async kvDelete(tenantId, key) {
    await pool.query(
      'DELETE FROM kv_store WHERE tenant_id = $1 AND key = $2',
      [tenantId, key]
    );
  }

  // ── Employee bindings ─────────────────────────────────────────────────────

  async getBindings(tenantId) {
    const res = await pool.query(
      'SELECT name, telegram_id FROM employee_bindings WHERE tenant_id = $1 AND active = true',
      [tenantId]
    );
    const bindings = {};
    res.rows.forEach(row => {
      // telegram_id из PG приходит строкой (BIGINT). Нормализуем к числу,
      // чтобы тип совпадал с data.json и не плодил баги сравнения на фронте.
      bindings[row.name] = Number(row.telegram_id);
    });
    return bindings;
  }

  async bindEmployee(tenantId, name, telegramId) {
    // active = true в т.ч. реактивирует ранее отвязанного сотрудника.
    await pool.query(
      `INSERT INTO employee_bindings (tenant_id, name, telegram_id, active) VALUES ($1, $2, $3, true)
       ON CONFLICT (tenant_id, name) DO UPDATE SET telegram_id = $3, active = true, updated_at = NOW()`,
      [tenantId, name, telegramId]
    );
  }

  // Мягкое удаление — getBindings фильтрует active=true.
  // Сохраняет telegram_id в истории пушей.
  async unbindEmployee(tenantId, name) {
    await pool.query(
      'UPDATE employee_bindings SET active = false, updated_at = NOW() WHERE tenant_id = $1 AND name = $2',
      [tenantId, name]
    );
  }

  async getEmployeeByTelegramId(tenantId, telegramId) {
    const res = await pool.query(
      'SELECT name FROM employee_bindings WHERE tenant_id = $1 AND telegram_id = $2 AND active = true',
      [tenantId, telegramId]
    );
    return res.rows[0]?.name ?? null;
  }

  // ── Push logging ──────────────────────────────────────────────────────────

  async logPush(tenantId, employeeName, telegramId, text, status = 'sent', errorMsg = null) {
    await pool.query(
      `INSERT INTO push_log (tenant_id, employee_name, recipient_telegram_id, text, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [tenantId, employeeName, telegramId, text, status, errorMsg]
    );
  }

  async getPushLog(tenantId, date = null) {
    let query = 'SELECT * FROM push_log WHERE tenant_id = $1';
    const params = [tenantId];
    if (date) {
      query += ' AND DATE(created_at) = $2';
      params.push(date);
    }
    query += ' ORDER BY created_at DESC LIMIT 1000';
    const res = await pool.query(query, params);
    return res.rows;
  }

  // ── Push schedule ─────────────────────────────────────────────────────────

  async setPushSchedule(tenantId, scheduleDate, items) {
    await pool.query(
      'DELETE FROM push_schedule WHERE tenant_id = $1 AND schedule_date = $2',
      [tenantId, scheduleDate]
    );
    for (const item of items) {
      await pool.query(
        `INSERT INTO push_schedule (tenant_id, schedule_date, scheduled_time, employee_name, message_template, message_text, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [tenantId, scheduleDate, item.time || null, item.recipient || null, item.template || null, item.text || null]
      );
    }
  }

  async getPushSchedule(tenantId, scheduleDate) {
    const res = await pool.query(
      'SELECT * FROM push_schedule WHERE tenant_id = $1 AND schedule_date = $2 ORDER BY scheduled_time',
      [tenantId, scheduleDate]
    );
    return res.rows.map(row => ({
      time:     row.scheduled_time,
      recipient: row.employee_name,
      template: row.message_template,
      text:     row.message_text,
      status:   row.status,
    }));
  }

  // ── Тенанты ───────────────────────────────────────────────────────────────

  // Список всех активных тенантов — для загрузки на старте и итерации в синках.
  async listActiveTenants() {
    const res = await pool.query(
      "SELECT tenant_id, name, status FROM tenants WHERE status = 'active' ORDER BY tenant_id"
    );
    return res.rows;
  }

  async getTenant(tenantId) {
    const res = await pool.query(
      'SELECT tenant_id, name, status, created_at FROM tenants WHERE tenant_id = $1',
      [tenantId]
    );
    return res.rows[0] ?? null;
  }

  // Создать тенанта (идемпотентно — безопасен при повторном вызове).
  async createTenant(tenantId, name) {
    await pool.query(
      `INSERT INTO tenants (tenant_id, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (tenant_id) DO UPDATE SET name = EXCLUDED.name, status = 'active'`,
      [tenantId, name]
    );
  }

  // ── Интеграции тенанта ────────────────────────────────────────────────────

  async getTenantIntegrations(tenantId) {
    const res = await pool.query(
      'SELECT kind, enabled, config FROM tenant_integrations WHERE tenant_id = $1',
      [tenantId]
    );
    return res.rows;
  }

  async setTenantIntegration(tenantId, kind, enabled, config = null) {
    await pool.query(
      `INSERT INTO tenant_integrations (tenant_id, kind, enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, kind) DO UPDATE SET enabled = $3, config = $4`,
      [tenantId, kind, enabled, config != null ? JSON.stringify(config) : null]
    );
  }

  // ── Роли / права / пользователи (P0 «Привилегии/ACL», Ф1) ─────────────────

  async getRoles(tenantId) {
    const res = await pool.query(
      'SELECT id, name, parent_role_id, is_system FROM roles WHERE tenant_id = $1',
      [tenantId]
    );
    return res.rows;
  }

  // Собственные (не унаследованные) гранты всех ролей тенанта.
  async getRolePermissions(tenantId) {
    const res = await pool.query(
      `SELECT rp.role_id, rp.permission_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
        WHERE r.tenant_id = $1`,
      [tenantId]
    );
    return res.rows;
  }

  async getUsers(tenantId) {
    const res = await pool.query(
      'SELECT account, telegram_id, role_id, active FROM users WHERE tenant_id = $1',
      [tenantId]
    );
    return res.rows;
  }

  // Идемпотентный upsert пользователя. role_id ставится ТОЛЬКО при первой вставке —
  // ручное переназначение роли не затирается при рестарте (обновляем лишь telegram_id/active).
  async upsertUser(tenantId, account, telegramId, roleId) {
    await pool.query(
      `INSERT INTO users (tenant_id, account, telegram_id, role_id, active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (tenant_id, account) DO UPDATE
         SET telegram_id = COALESCE(EXCLUDED.telegram_id, users.telegram_id),
             active = true`,
      [tenantId, account, telegramId, roleId]
    );
  }

  // ── Задачи (мёртвые таблицы — не мигрируем, не трогаем структуру) ────────

  async getTasks() {
    const res = await pool.query('SELECT * FROM tasks WHERE archived = false ORDER BY created_at');
    return res.rows.map(row => this._rowToTask(row));
  }

  async getTask(id) {
    const res = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return res.rows[0] ? this._rowToTask(res.rows[0]) : null;
  }

  async saveTask(task) {
    const { id, title, description, repeat, kind, date, from_date, until_date, day_of_week, priority, archived } = task;
    if (id) {
      await pool.query(
        `UPDATE tasks SET title=$1, description=$2, repeat=$3, kind=$4, date=$5,
         from_date=$6, until_date=$7, day_of_week=$8, priority=$9, archived=$10,
         updated_at=NOW() WHERE id=$11`,
        [title, description, repeat, kind, date, from_date, until_date, day_of_week, priority, archived, id]
      );
    } else {
      const res = await pool.query(
        `INSERT INTO tasks (title, description, repeat, kind, date, from_date, until_date, day_of_week, priority, archived)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [title, description, repeat, kind, date, from_date, until_date, day_of_week, priority, archived]
      );
      task.id = res.rows[0].id;
    }
  }

  async deleteTask(id) {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  }

  async getTaskCompletion(taskId, completionDate) {
    const res = await pool.query(
      'SELECT * FROM task_completion WHERE task_id = $1 AND completion_date = $2',
      [taskId, completionDate]
    );
    return res.rows[0] ? { done: res.rows[0].done, notes: res.rows[0].notes } : null;
  }

  async setTaskCompletion(taskId, completionDate, done, completedBy = null) {
    await pool.query(
      `INSERT INTO task_completion (task_id, completion_date, done, completed_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (task_id, completion_date) DO UPDATE SET done = $3, completed_by = $4, updated_at = NOW()`,
      [taskId, completionDate, done, completedBy]
    );
  }

  _rowToTask(row) {
    return {
      id:         row.id,
      title:      row.title,
      description: row.description,
      repeat:     row.repeat,
      kind:       row.kind,
      date:       row.date,
      from:       row.from_date,
      until:      row.until_date,
      dayOfWeek:  row.day_of_week,
      priority:   row.priority,
      archived:   row.archived,
    };
  }
}

module.exports = new DataAdapter();
