// Аналитический блок под месячным календарём.
// Показывает: выручку (факт/план/%), спарклайн, гостей, средний чек,
// сравнение событийных и обычных дней.
//
// Расширяемость: EVENT_TYPES — единый реестр; добавление нового типа события
// автоматически создаёт строку в таблице сравнения и маркер на спарклайне.

import { useState } from 'react';
import { EVENT_TYPES, classifyEvent } from '../../constants/events.js';
import { MONTHS_RU } from '../../constants/locale.js';

const MAX_MONTHLY = 30_000_000; // 30 млн ₽/мес — разумный потолок для санитарного контроля

// ── Хелперы ────────────────────────────────────────────────────────────────

function revColor(pct) {
  if (pct >= 110) return '#5b8b9b';
  if (pct >= 100) return '#8bc47a';
  if (pct >= 90)  return '#e8a030';
  return '#e85535';
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU');
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ── Спарклайн (CSS-бары) ────────────────────────────────────────────────────
// Каждый день — вертикальный бар. Событийный день — цветная точка снизу.
// Цвет бара: план/факт-светофор если есть план, иначе --cu.
function Sparkline({ days, revenue, events }) {
  // Number() — защита от строковых значений, попавших из ручного ввода
  const facts   = days.map(d => Number(revenue[d]?.fact)  || 0);
  const maxFact = Math.max(1, ...facts);
  const hasFact = facts.some(f => f > 0);
  if (!hasFact) return null;

  // Типы событий, которые есть в этом месяце — для легенды
  const activeTypes = EVENT_TYPES.filter(et =>
    days.some(d => classifyEvent(events[d])?.id === et.id)
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 52, paddingBottom: 8, position: 'relative' }}>
        {days.map((date, i) => {
          const fact = facts[i];
          const plan = revenue[date]?.plan;
          const pct  = plan > 0 && fact > 0 ? (fact / plan) * 100 : null;
          const barH = fact > 0 ? Math.max(2, (fact / maxFact) * 44) : 1;
          const color = fact > 0
            ? (pct != null ? revColor(pct) : 'var(--cu)')
            : 'var(--bd)';
          const ev = classifyEvent(events[date]);

          return (
            <div key={date} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end', gap: 2,
            }}>
              <div style={{
                width: '100%', height: barH,
                background: color,
                borderRadius: '2px 2px 0 0',
                opacity: fact > 0 ? 0.85 : 0.25,
              }} />
              {/* Маркер события */}
              <div style={{
                width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                background: ev ? ev.color : 'transparent',
              }} />
            </div>
          );
        })}
      </div>
      {/* Легенда типов событий */}
      {activeTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--mt)', flexWrap: 'wrap' }}>
          {activeTypes.map(et => (
            <span key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: et.color, display: 'inline-block', flexShrink: 0 }} />
              {et.shortName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Сравнение дней по типам событий ────────────────────────────────────────
function EventComparison({ rows, maxAvg }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="sec-lbl" style={{ marginBottom: 8 }}>Сравнение дней</div>
      {rows.map((row, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 3, fontSize: 12,
          }}>
            <span style={{ fontWeight: 600, color: row.color }}>
              {row.emoji} {row.name}
              <span style={{ fontWeight: 400, color: 'var(--mt)', marginLeft: 4 }}>
                × {row.count} {plural(row.count, 'день', 'дня', 'дней')}
              </span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--mt)' }}>
              {row.avgFact != null
                ? <>avg <b style={{ color: 'var(--pp)' }}>{fmt(row.avgFact)} ₽</b></>
                : 'нет данных'}
            </span>
          </div>
          {row.avgFact != null && (
            <div style={{ height: 5, background: 'var(--sf)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.round((row.avgFact / maxAvg) * 100)}%`,
                background: row.barColor,
                borderRadius: 3,
                transition: 'width .4s ease',
              }} />
            </div>
          )}
          {row.daysWithFact < row.count && row.daysWithFact > 0 && (
            <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2, opacity: .7 }}>
              данные за {row.daysWithFact} из {row.count} {plural(row.count, 'дня', 'дней', 'дней')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Главный компонент ────────────────────────────────────────────────────────
export function MonthAnalytics({ revenue, events, ym, ds, isManager, monthPlan = {}, onSetMonthPlan }) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    `${ym}-${String(i + 1).padStart(2, '0')}`
  );

  // Number() обязателен: plan/fact/guests могут быть строками из ручного ввода
  const fN = d => Number(revenue[d]?.fact)   || 0;
  const pN = d => Number(revenue[d]?.plan)   || 0;
  const gN = d => Number(revenue[d]?.guests) || 0;

  // ── Факт месяца — вся реальная выручка (заголовок) ──
  const daysWithFact = days.filter(d => fN(d) > 0);
  const totalFact = daysWithFact.reduce((s, d) => s + fN(d), 0);

  // ── Месячный план — единая цель, задаётся менеджером один раз ──
  const mPlan = Number(monthPlan?.[ym]) || 0;

  // ── Сравнение «яблоки-к-яблокам»: дни где есть И план И факт (один набор) ──
  const matchedDays = days.filter(d => fN(d) > 0 && pN(d) > 0);
  const matchedFact = matchedDays.reduce((s, d) => s + fN(d), 0);
  const matchedPlan = matchedDays.reduce((s, d) => s + pN(d), 0);

  // ── % выполнения: приоритет у месячной цели, иначе — по дням с планом ──
  let factPct = null, planMode = null, planValue = 0;
  if (mPlan > 0 && totalFact > 0) {
    factPct = Math.round((totalFact / mPlan) * 100);
    planMode = 'month'; planValue = mPlan;
  } else if (matchedPlan > 0) {
    factPct = Math.round((matchedFact / matchedPlan) * 100);
    planMode = 'matched'; planValue = matchedPlan;
  }

  // ── Прогресс месяца — для честного % в середине месяца ──
  const todayYM = ds ? ds.slice(0, 7) : null;
  let elapsed = daysInMonth; // прошлый месяц — целиком
  if (todayYM === ym) elapsed = Math.min(daysInMonth, Number(ds.slice(8, 10)));
  else if (todayYM && ym > todayYM) elapsed = 0; // будущий месяц
  const monthOver = elapsed >= daysInMonth;

  // ── Средний чек — только дни где есть И факт И гости (тот же набор) ──
  // Иначе дни с фактом но без гостей завышают числитель → завышенный чек.
  const guestDays   = days.filter(d => fN(d) > 0 && gN(d) > 0);
  const totalGuests = days.reduce((s, d) => s + gN(d), 0);
  const gFact       = guestDays.reduce((s, d) => s + fN(d), 0);
  const gGuests     = guestDays.reduce((s, d) => s + gN(d), 0);
  const avgCheck    = gGuests > 0 ? Math.round(gFact / gGuests) : null;

  // ── Санитарный контроль ──
  const dataCorrupt = !isFinite(totalFact) || totalFact > MAX_MONTHLY || mPlan > MAX_MONTHLY;

  // ── Редактор месячной цели (только менеджер) ──
  const [editPlan, setEditPlan]   = useState(false);
  const [planDraft, setPlanDraft] = useState('');
  const saveMonthPlan = () => {
    const v = planDraft === '' ? 0 : Number(planDraft);
    if (!isFinite(v) || v < 0 || v > MAX_MONTHLY) { setEditPlan(false); return; }
    onSetMonthPlan && onSetMonthPlan(ym, v);
    setEditPlan(false);
  };

  // ── Статистика по типам событий ──
  const eventRows = EVENT_TYPES.map(type => {
    const typeDays         = days.filter(d => classifyEvent(events[d])?.id === type.id);
    const typeDaysWithFact = typeDays.filter(d => (revenue[d]?.fact || 0) > 0);
    const typeTotal        = typeDaysWithFact.reduce((s, d) => s + (Number(revenue[d].fact) || 0), 0);
    return {
      emoji:       type.emoji,
      name:        type.name,
      color:       type.color,
      barColor:    type.color,
      count:       typeDays.length,
      daysWithFact: typeDaysWithFact.length,
      avgFact:     typeDaysWithFact.length > 0 ? Math.round(typeTotal / typeDaysWithFact.length) : null,
    };
  }).filter(t => t.count > 0);

  // ── Обычные дни (без классифицированного события) ──
  const regularDays         = days.filter(d => !classifyEvent(events[d]));
  const regularDaysWithFact = regularDays.filter(d => (revenue[d]?.fact || 0) > 0);
  const regularTotal        = regularDaysWithFact.reduce((s, d) => s + (Number(revenue[d].fact) || 0), 0);
  const regularAvg          = regularDaysWithFact.length > 0
    ? Math.round(regularTotal / regularDaysWithFact.length) : null;

  // Собираем строки сравнения (события + обычные)
  const compRows = [
    ...eventRows,
    regularAvg != null && {
      emoji:       '📅',
      name:        'Обычные',
      color:       'var(--mt)',
      barColor:    'var(--cu)',
      count:       regularDays.length,
      daysWithFact: regularDaysWithFact.length,
      avgFact:     regularAvg,
    },
  ].filter(Boolean);
  const maxAvg = Math.max(1, ...compRows.map(r => r.avgFact || 0));

  // ── Нет данных ──
  if (daysWithFact.length === 0) {
    return (
      <div className="sec" style={{ paddingTop: 14 }}>
        <div className="sec-lbl" style={{ marginBottom: 6 }}>📊 Аналитика · {MONTHS_RU[m - 1]}</div>
        <div style={{ fontSize: 12, color: 'var(--mt)', textAlign: 'center', padding: '14px 0', opacity: .7 }}>
          Данных выручки за {MONTHS_RU[m - 1].toLowerCase()} пока нет
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ paddingTop: 14 }}>
      {/* Санитарный алерт: данные испорчены */}
      {dataCorrupt && (
        <div style={{
          background: 'rgba(220,53,53,.12)', border: '1px solid rgba(220,53,53,.35)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13,
          color: '#e05555', lineHeight: 1.5,
        }}>
          <strong>⚠️ Данные выручки некорректны</strong> — числа выглядят нереальными.<br/>
          <span style={{ fontSize: 12, opacity: .85 }}>
            Что сделать: откройте Календарь, найдите день с неверным числом, нажмите «Сохранить выручку» — исправьте план или факт.
            Если проблема осталась — напишите @admin.
          </span>
        </div>
      )}
      {/* Заголовок */}
      <div className="sec-head" style={{ marginBottom: 10 }}>
        <span className="sec-lbl">📊 Аналитика · {MONTHS_RU[m - 1]}</span>
        <span style={{ fontSize: 11, color: 'var(--mt)' }}>
          {daysWithFact.length}/{daysInMonth} дн. с данными
        </span>
      </div>

      {/* Выручка-факт + % выполнения */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: 'var(--pp)' }}>
            {fmt(totalFact)} ₽
          </span>
          {factPct != null && (
            <span style={{
              fontSize: 16, fontWeight: 700,
              color: revColor(factPct),
              background: revColor(factPct) + '22',
              padding: '1px 7px', borderRadius: 8,
            }}>
              {factPct}%
            </span>
          )}
        </div>

        {/* Подпись режима расчёта % */}
        {factPct != null && (
          <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3 }}>
            {planMode === 'month' ? (
              <>
                от цели {fmt(planValue)} ₽
                {monthOver
                  ? (totalFact >= planValue
                      ? <span style={{ color: '#8bc47a' }}> · +{fmt(totalFact - planValue)} ₽ сверх цели</span>
                      : <span> · {fmt(planValue - totalFact)} ₽ до цели</span>)
                  : (elapsed > 0
                      ? <span style={{ opacity: .8 }}> · прошло {elapsed} из {daysInMonth} {plural(daysInMonth, 'дня', 'дней', 'дней')}</span>
                      : null)}
              </>
            ) : (
              <>по {matchedDays.length} {plural(matchedDays.length, 'дню', 'дням', 'дням')} с планом · {fmt(matchedPlan)} ₽</>
            )}
          </div>
        )}

        {/* Месячная цель — редактор для менеджера / read-only для остальных */}
        {(mPlan > 0 || isManager) && (
          <div style={{ marginTop: 6 }}>
            {!editPlan ? (
              <div style={{ fontSize: 12, color: 'var(--mt)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎯 Цель месяца: {mPlan > 0
                  ? <b style={{ color: 'var(--pp)' }}>{fmt(mPlan)} ₽</b>
                  : <span style={{ opacity: .7 }}>не задана</span>}</span>
                {isManager && onSetMonthPlan && (
                  <button onClick={() => { setPlanDraft(mPlan > 0 ? String(mPlan) : ''); setEditPlan(true); }}
                    style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6,
                      color: 'var(--mt)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}>
                    {mPlan > 0 ? 'Изменить' : 'Задать'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={planDraft} autoFocus
                  onChange={e => setPlanDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveMonthPlan(); if (e.key === 'Escape') setEditPlan(false); }}
                  placeholder="план на месяц, ₽"
                  style={{ flex: 1, maxWidth: 180, background: 'var(--bg)', border: '1px solid var(--bd)',
                    borderRadius: 7, padding: '6px 10px', color: 'var(--pp)', fontSize: 13, fontFamily: 'inherit' }} />
                <button onClick={saveMonthPlan}
                  style={{ background: 'var(--cu)', border: 'none', borderRadius: 7, color: 'var(--bg)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', fontFamily: 'inherit' }}>OK</button>
                <button onClick={() => setEditPlan(false)}
                  style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 7,
                    color: 'var(--mt)', cursor: 'pointer', fontSize: 12, padding: '6px 10px', fontFamily: 'inherit' }}>✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Спарклайн */}
      <Sparkline days={days} revenue={revenue} events={events} />

      {/* Гости и средний чек */}
      {totalGuests > 0 ? (
        <div style={{ display: 'flex', gap: 20, marginTop: 4, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 2 }}>👥 Гостей</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(totalGuests)}</div>
          </div>
          {avgCheck != null && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 2 }}>🧾 Средний чек</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(avgCheck)} ₽</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--mt)', opacity: .6, fontStyle: 'italic', marginBottom: 6 }}>
          Данные гостей появятся после синхронизации с iiko
        </div>
      )}

      {/* Сравнение событийных и обычных дней */}
      <EventComparison rows={compRows} maxAvg={maxAvg} />
    </div>
  );
}
