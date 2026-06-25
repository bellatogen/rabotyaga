const pool = require('./pool');

class DataAdapter {
  // KV store: хранилище ключ-значение (tasks:v4, done:hist:v2 и т.д.)
  async kvGet(key) {
    const res = await pool.query(
      'SELECT value FROM kv_store WHERE key = $1',
      [key]
    );
    return res.rows[0]?.value ?? null;
  }

  async kvSet(key, value) {
    await pool.query(
      `INSERT INTO kv_store (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
  }

  // Все kv-ключи разом — для PG-first загрузки при старте сервера.
  async kvGetAll() {
    const res = await pool.query('SELECT key, value FROM kv_store');
    const out = {};
    res.rows.forEach(row => { out[row.key] = row.value; });
    return out;
  }

  // Удаление ключа — иначе удалённое в памяти «воскресает» после рестарта.
  async kvDelete(key) {
    await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
  }

  // Employee bindings: name -> telegramId
  async getBindings() {
    const res = await pool.query(
      'SELECT name, telegram_id FROM employee_bindings WHERE active = true'
    );
    const bindings = {};
    res.rows.forEach(row => {
      // telegram_id из PG приходит строкой (BIGINT). Нормализуем к числу,
      // чтобы тип совпадал с data.json и не плодил баги сравнения на фронте.
      // Telegram ID < 2^53, поэтому Number безопасен.
      bindings[row.name] = Number(row.telegram_id);
    });
    return bindings;
  }

  async bindEmployee(name, telegramId) {
    // active = true в т.ч. реактивирует ранее отвязанного сотрудника.
    await pool.query(
      `INSERT INTO employee_bindings (name, telegram_id, active) VALUES ($1, $2, true)
       ON CONFLICT (name) DO UPDATE SET telegram_id = $2, active = true, updated_at = NOW()`,
      [name, telegramId]
    );
  }

  // Отвязка сотрудника: помечаем active=false (getBindings фильтрует active=true).
  // Мягкое удаление сохраняет telegram_id для истории пушей.
  async unbindEmployee(name) {
    await pool.query(
      'UPDATE employee_bindings SET active = false, updated_at = NOW() WHERE name = $1',
      [name]
    );
  }

  async getEmployeeByTelegramId(telegramId) {
    const res = await pool.query(
      'SELECT name FROM employee_bindings WHERE telegram_id = $1 AND active = true',
      [telegramId]
    );
    return res.rows[0]?.name ?? null;
  }

  // Push logging
  async logPush(employeeName, telegramId, text, status = 'sent', errorMsg = null) {
    await pool.query(
      `INSERT INTO push_log (employee_name, recipient_telegram_id, text, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [employeeName, telegramId, text, status, errorMsg]
    );
  }

  async getPushLog(date = null) {
    let query = 'SELECT * FROM push_log';
    const params = [];
    
    if (date) {
      query += ' WHERE DATE(created_at) = $1';
      params.push(date);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 1000';
    const res = await pool.query(query, params);
    return res.rows;
  }

  // Push schedule
  async setPushSchedule(scheduleDate, items) {
    // Удалим старые записи на эту дату
    await pool.query(
      'DELETE FROM push_schedule WHERE schedule_date = $1',
      [scheduleDate]
    );
    
    // Добавим новые
    for (const item of items) {
      await pool.query(
        `INSERT INTO push_schedule (schedule_date, scheduled_time, employee_name, message_template, message_text, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [scheduleDate, item.time || null, item.recipient || null, item.template || null, item.text || null]
      );
    }
  }

  async getPushSchedule(scheduleDate) {
    const res = await pool.query(
      'SELECT * FROM push_schedule WHERE schedule_date = $1 ORDER BY scheduled_time',
      [scheduleDate]
    );
    return res.rows.map(row => ({
      time: row.scheduled_time,
      recipient: row.employee_name,
      template: row.message_template,
      text: row.message_text,
      status: row.status
    }));
  }

  // Tasks
  async getTasks() {
    const res = await pool.query('SELECT * FROM tasks WHERE archived = false ORDER BY created_at');
    return res.rows.map(row => this._rowToTask(row));
  }

  async getTask(id) {
    const res = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return res.rows[0] ? this._rowToTask(res.rows[0]) : null;
  }

  async saveTask(task) {
    const {
      id, title, description, repeat, kind, date, from_date, until_date,
      day_of_week, priority, archived
    } = task;

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

  // Task completion
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
      id: row.id,
      title: row.title,
      description: row.description,
      repeat: row.repeat,
      kind: row.kind,
      date: row.date,
      from: row.from_date,
      until: row.until_date,
      dayOfWeek: row.day_of_week,
      priority: row.priority,
      archived: row.archived
    };
  }
}

module.exports = new DataAdapter();
