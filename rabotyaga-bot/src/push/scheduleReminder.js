// scheduleReminder.js — напоминание управляющему создать вкладку расписания на след. месяц.
//
// Контекст: управляющий ведёт расписание вручную в Google Sheets (см.
// docs/investigations/schedule-sync-401-2026-07-01.md) — вкладки на новый месяц сами
// не появляются, автосинк по несуществующей вкладке молча остаётся без данных.
//
// Триггер: начиная с 5 дней до конца текущего месяца — ЕЖЕДНЕВНО (нагом), пока вкладка
// следующего месяца не появится в таблице (или пока текущий месяц не закончится).
// Канал: прямой пуш в Telegram управляющему (не через push:v1 — это не адресуется
// по ростеру сотрудников, это системная задача одного конкретного человека).
'use strict';

const { fetchSheetRows } = require('../sync/sheetsFetch');
const { parseScheduleRows, RU_MONTHS_NAME } = require('../sync/scheduleParse');

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '1HhVU_AkD4lzHKq4nJtUjlzrutnAiNSFNh-BLBN5bQzI';
const REMINDER_DAYS_BEFORE = 5;
const STATUS_KEY = 'schedule_reminder:v1';

// chatId получателя: явный SCHEDULE_REMINDER_CHAT_ID, иначе первый id из PUSH_ALLOWLIST
// (в проде это личный chatId управляющего — уже используется как «мой» тестовый адрес).
function reminderChatId() {
  if (process.env.SCHEDULE_REMINDER_CHAT_ID) return process.env.SCHEDULE_REMINDER_CHAT_ID.trim();
  const allow = (process.env.PUSH_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
  return allow[0] || null;
}

function daysInMonth(year, month1based) {
  return new Date(year, month1based, 0).getDate();
}

/**
 * Проверяет, нужно ли сегодня напомнить о создании вкладки следующего месяца, и шлёт пуш.
 * Безопасно вызывать чаще одного раза в день — внутренний дедуп по дате в schedule_reminder:v1.
 */
async function checkScheduleReminder(bot, data, saveData) {
  const chatId = reminderChatId();
  if (!chatId) return; // некому слать — тихо выходим (не сконфигурировано)

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const totalDays = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const daysLeft = totalDays - now.getDate();
  if (daysLeft > REMINDER_DAYS_BEFORE || daysLeft < 0) return; // ещё не время в этом месяце

  let status;
  try { status = JSON.parse(data.kv[STATUS_KEY] || '{}'); } catch { status = {}; }
  if (status.lastSentDate === today) return; // уже слали сегодня

  // Следующий месяц — та вкладка, которую нужно успеть создать.
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = `${RU_MONTHS_NAME[nextDate.getMonth() + 1]} ${nextDate.getFullYear()}`;

  let tabExists;
  try {
    const { rows } = await fetchSheetRows(SHEET_ID, nextMonthName);
    const { error } = parseScheduleRows(rows, { sheetName: nextMonthName, year: nextDate.getFullYear() });
    tabExists = !error;
  } catch (e) {
    console.warn('[scheduleReminder] не удалось проверить вкладку следующего месяца:', e.message);
    return; // сеть/API недоступны сейчас — не делаем вывод на неопределённости, попробуем на следующем тике
  }

  if (tabExists) {
    // Вкладка уже создана — сбрасываем дедуп, чтобы в следующем месяце сработало заново.
    if (status.lastSentDate) {
      data.kv[STATUS_KEY] = JSON.stringify({ lastSentDate: null });
      if (typeof saveData === 'function') saveData();
    }
    return;
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
  const whenText = daysLeft === 0 ? 'сегодня заканчивается' : `через ${daysLeft} дн. закончится`;
  const text = `⚠️ ${whenText.charAt(0).toUpperCase() + whenText.slice(1)} текущий месяц, а вкладка «${nextMonthName}» в таблице расписания ещё не создана.\n\n`
    + `Создай её (скопируй прошлый месяц и очисти смены) — иначе автосинк расписания не подхватит новый месяц.\n\n${sheetUrl}`;

  try {
    await bot.telegram.sendMessage(String(chatId), text);
    console.log(`[scheduleReminder] отправлено: вкладка "${nextMonthName}" не создана (осталось ${daysLeft} дн.)`);
  } catch (e) {
    console.error('[scheduleReminder] ошибка отправки:', e.message);
    return; // не помечаем как отправленное — попробуем ещё раз на следующем тике
  }

  data.kv[STATUS_KEY] = JSON.stringify({ lastSentDate: today, nextMonthName });
  if (typeof saveData === 'function') saveData();
}

module.exports = { checkScheduleReminder, reminderChatId, daysInMonth };
