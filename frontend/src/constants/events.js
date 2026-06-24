// Реестр типов коммерческих событий — расширяемый справочник.
// Добавить новое событие: один объект в EVENT_TYPES. Всё остальное (аналитика,
// цвета в календаре, сравнение дней) подхватывается автоматически.
//
// matchTerms — подстроки для классификации строк из events:v1 / EMBEDDED_EVENTS
// (сравнение без учёта регистра и частичное совпадение).

export const EVENT_TYPES = [
  {
    id:        'istoriya',
    name:      'История в бутылке',
    shortName: 'История',
    emoji:     '🍷',
    color:     '#c49a3c',                    // янтарный
    bg:        'rgba(196,154,60,.13)',
    matchTerms: ['истории в бутылке', 'история в бутылке'],
  },
  {
    id:        'stereo',
    name:      'Стерео 55',
    shortName: 'Стерео 55',
    emoji:     '🎵',
    color:     '#8b5cf6',                    // фиолетовый
    bg:        'rgba(139,92,246,.13)',
    matchTerms: ['стерео 55', 'стерео55'],
  },
  {
    id:        'pubquiz',
    name:      'Паб-квиз',
    shortName: 'Квиз',
    emoji:     '🧠',
    color:     '#3b9ea3',                    // бирюзовый
    bg:        'rgba(59,158,163,.13)',
    matchTerms: ['паб-квиз', 'паб квиз', 'квиз'],
  },
  {
    id:        'darts',
    name:      'Турнир по дартсу',
    shortName: 'Дартс',
    emoji:     '🎯',
    color:     '#c0603a',                    // терракот
    bg:        'rgba(192,96,58,.13)',
    matchTerms: ['дартс', 'турнир по дартсу'],
  },
  {
    id:        'guest',
    name:      'Гест',
    shortName: 'Гест',
    emoji:     '🎤',
    color:     '#9b6dd1',                    // лиловый
    bg:        'rgba(155,109,209,.13)',
    matchTerms: ['гест', 'guest'],
  },
  {
    id:        'collab',
    name:      'Коллаборация',
    shortName: 'Коллаб',
    emoji:     '🤝',
    color:     '#5b8b9b',                    // стальной
    bg:        'rgba(91,139,155,.13)',
    matchTerms: ['коллаб', 'коллаборац'],
  },
  {
    id:        'inventa',
    name:      'Инвентаризация',
    shortName: 'Инвентар.',
    emoji:     '📋',
    color:     '#7a8a5b',                    // оливковый
    bg:        'rgba(122,138,91,.13)',
    matchTerms: ['инвентар'],
  },
  // → сюда добавляются новые типы: закрытые вечера, сезонные акции и т.д.
];

/** Тип события по id (для иконок/цветов в форме и списках) */
export function eventTypeById(id) {
  return EVENT_TYPES.find(t => t.id === id) ?? null;
}

/**
 * Классифицировать строку события → EventType | null.
 * Используется везде: в календаре, аналитике, пушах.
 */
export function classifyEvent(eventStr) {
  if (!eventStr) return null;
  const lower = eventStr.toLowerCase();
  return EVENT_TYPES.find(t => t.matchTerms.some(term => lower.includes(term))) ?? null;
}

// ── Рич-события (events:v2) ──────────────────────────────────────────────
// Справочники для формы редактирования события.

/** Типы повторяемости */
export const RECURRENCE_TYPES = [
  { id: 'once',    label: 'Однократно' },
  { id: 'daily',   label: 'Каждый день' },
  { id: 'weekly',  label: 'Каждую неделю' },
  { id: 'every_n', label: 'Каждые N дней' },
  { id: 'weekday', label: 'По дню недели' },
];

/** Дни недели (0 = вс, как getDay) */
export const WEEKDAYS = [
  { id: 1, label: 'Пн' }, { id: 2, label: 'Вт' }, { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' }, { id: 5, label: 'Пт' }, { id: 6, label: 'Сб' }, { id: 0, label: 'Вс' },
];

/** Площадки для плана постов */
export const EVENT_PLATFORMS = [
  { id: 'vk',        label: 'VK',        emoji: '🟦' },
  { id: 'instagram', label: 'Instagram', emoji: '📷' },
  { id: 'telegram',  label: 'Telegram',  emoji: '✈️' },
  { id: 'другое',    label: 'Другое',    emoji: '📢' },
];

/** Пустой рич-объект события (фабрика для формы создания) */
export function emptyEvent({ id, startDate, createdAt }) {
  return {
    id,
    title: '',
    type: null,
    description: '',
    startDate,
    endDate: null,
    recurrence: { type: 'once', interval: null, weekday: null, endDate: null },
    responsible: [],
    timing: { start: '', end: '' },
    location: { type: 'own', address: null, transferDetails: null },
    budget: { enabled: false, items: [] },
    marketing: { posts: [] },
    analytics: { notes: '', report: '' },
    createdAt,
  };
}

// Парсим YYYY-MM-DD в UTC-миллисекунды (без смещения часового пояса)
function dayUTC(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
const DAY_MS = 86400000;

/**
 * Применяется ли событие к дате dateStr (YYYY-MM-DD) с учётом повторяемости.
 * Типы: once (однодневное или период startDate..endDate), daily, weekly,
 * every_n (каждые interval дней от startDate), weekday (по дню недели weekday).
 */
export function isEventToday(event, dateStr) {
  if (!event || !event.startDate || !dateStr) return false;
  const rec = event.recurrence || { type: 'once' };
  const t = dayUTC(dateStr);
  const s = dayUTC(event.startDate);
  const recEnd = rec.endDate ? dayUTC(rec.endDate) : null;

  if (rec.type === 'once') {
    const e = event.endDate ? dayUTC(event.endDate) : s;
    return t >= s && t <= e;
  }
  if (t < s) return false;
  if (recEnd != null && t > recEnd) return false;
  switch (rec.type) {
    case 'daily':
      return true;
    case 'weekly':
      return Math.round((t - s) / DAY_MS) % 7 === 0;
    case 'every_n': {
      const n = rec.interval && rec.interval > 0 ? Math.floor(rec.interval) : 1;
      return Math.round((t - s) / DAY_MS) % n === 0;
    }
    case 'weekday':
      if (rec.weekday == null) return false;
      return new Date(t).getUTCDay() === rec.weekday;
    default:
      return t === s;
  }
}

/**
 * Разворачивает событие в список дат (YYYY-MM-DD), в которые оно попадает,
 * в окне [fromStr, toStr]. Ограничено cap вхождениями (защита от бесконечных повторов).
 * Используется для подсветки событий в календаре/аналитике (плоская карта events:v1-совместимо).
 */
export function expandEventOccurrences(event, fromStr, toStr, cap = 800) {
  const out = [];
  if (!event || !event.startDate) return out;
  const start = Math.max(dayUTC(fromStr), dayUTC(event.startDate));
  let to = dayUTC(toStr);
  if (event.recurrence && event.recurrence.endDate)
    to = Math.min(to, dayUTC(event.recurrence.endDate));
  for (let t = start; t <= to && out.length < cap; t += DAY_MS) {
    const ds = new Date(t).toISOString().slice(0, 10);
    if (isEventToday(event, ds)) out.push(ds);
  }
  return out;
}

/**
 * Миграция events:v1 (плоская карта {date: label}) → events:v2 (массив рич-объектов).
 * Детерминированные id (без случайности) — миграция идемпотентна при повторных загрузках.
 */
export function migrateEventsV1toV2(v1map) {
  if (!v1map || typeof v1map !== 'object') return [];
  return Object.entries(v1map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, label]) => {
      const title = typeof label === 'string' ? label : String(label ?? '');
      const t = classifyEvent(title);
      return {
        id: `evt_${date}_${t?.id || 'custom'}`,
        title,
        type: t?.id || null,
        description: '',
        startDate: date,
        endDate: null,
        recurrence: { type: 'once', interval: null, weekday: null, endDate: null },
        responsible: [],
        timing: { start: '', end: '' },
        location: { type: 'own', address: null, transferDetails: null },
        budget: { enabled: false, items: [] },
        marketing: { posts: [] },
        analytics: { notes: '', report: '' },
        createdAt: `${date}T12:00:00.000Z`,
      };
    });
}

/**
 * Строит плоскую карту {date: title} из v1-карты + развёрнутых вхождений v2-событий
 * в окне [fromStr, toStr]. v1 имеет приоритет (источник — Google-таблица, не перезаписывается).
 */
export function buildEventsFlatMap(v1map, v2list, fromStr, toStr) {
  const flat = { ...(v1map || {}) };
  for (const ev of (v2list || [])) {
    for (const d of expandEventOccurrences(ev, fromStr, toStr)) {
      if (!flat[d]) flat[d] = ev.title;
    }
  }
  return flat;
}

/** Короткое описание повторяемости для UI */
export function recurrenceLabel(rec) {
  if (!rec || rec.type === 'once') return 'Однократно';
  if (rec.type === 'daily') return 'Каждый день';
  if (rec.type === 'weekly') return 'Каждую неделю';
  if (rec.type === 'every_n') return `Каждые ${rec.interval || 1} дн.`;
  if (rec.type === 'weekday') {
    const w = WEEKDAYS.find(x => x.id === rec.weekday);
    return w ? `Каждый ${w.label.toLowerCase()}` : 'По дню недели';
  }
  return '';
}
