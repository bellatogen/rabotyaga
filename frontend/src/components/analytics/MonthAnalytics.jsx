// Аналитический блок под месячным календарём.
// Показывает: выручку (факт/план/%), спарклайн, гостей, средний чек,
// сравнение событийных и обычных дней.
//
// Светофор всегда работает на основе дневных планов из revenue (таблица).
// monthPlan[ym] — менеджерская «цель месяца», отображается отдельно,
// НЕ подменяет дневные планы и не влияет на светофор.

import { useState } from 'react';
import { EVENT_TYPES, classifyEvent } from '../../constants/events.js';
import { MONTHS_RU } from '../../constants/locale.js';
import { revColor, kRub, calcMonthPct } from '../../utils/revenueUtils.js';

const MAX_MONTHLY = 30_000_000; // 30 млн ₽/мес — санитарный потолок

// ── Хелперы ────────────────────────────────────────────────────────────────

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

// ── Спарклайн ──────────────────────────────────────────────────────────────
// Каждый день — вертикальный бар. Цвет: светофор если есть план, иначе --cu.
// Событийный день — цветная точка снизу.
function Sparkline({ days, revenue, events }) {
  const facts   = days.map(d => Number(revenue[d]?.fact)  || 0);
  const maxFact = Math.max(1, ...facts);
  if (!facts.some(f => f > 0)) return null;

  const activeTypes = EVENT_TYPES.filter(et =>
    days.some(d => classifyEvent(events[d])?.id === et.id)
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 52, paddingBottom: 8 }}>
        {days.map((date, i) => {
          const fact = facts[i];
          const plan = Number(revenue[date]?.plan) || 0;
          const pct  = plan > 0 && fact > 0 ? (fact / plan) * 100 : null;
          const barH = fact > 0 ? Math.max(2, (fact / maxFact) * 44) : 1;
          const color = pct != null ? revColor(pct) : fact > 0 ? 'var(--cu)' : 'var(--bd)';
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
              <div style={{
                width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                background: ev ? ev.color : 'transparent',
              }} />
            </div>
          );
        })}
      </div>
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

  const fN = d => Number(revenue[d]?.fact)   || 0;
  const pN = d => Number(revenue[d]?.plan)   || 0;
  const gN = d => Number(revenue[d]?.guests) || 0;

  // ── Факт месяца ──
  const daysWithFact = days.filter(d => fN(d) > 0);
  const totalFact    = daysWithFact.reduce((s, d) => s + fN(d), 0);

  // ── Светофор — apples-to-apples по дневным планам из таблицы ──
  // calcMonthPct: дни где одновременно есть план И факт → честный %
  const { pct: factPct, matchedPlan, matchedCount } = calcMonthPct(days, revenue);

  // ── Полный план месяца из дневных значений (для справки) ──
  const totalPlanFromDays = days.reduce((s, d) => s + pN(d), 0);

  // ── Менеджерская цель — только индикатор, не влияет на светофор ──
  const mGoal   = Number(monthPlan?.[ym]) || 0;
  const goalPct = mGoal > 0 && totalFact > 0
    ? Math.round((totalFact / mGoal) * 100) : null;

  // ── Прогресс месяца ──
  const todayYM = ds ? ds.slice(0, 7) : null;
  let elapsed = daysInMonth;
  if (todayYM === ym) elapsed = Math.min(daysInMonth, Number(ds.slice(8, 10)));
  else if (todayYM && ym > todayYM) elapsed = 0;
  const monthOver = elapsed >= daysInMonth;

  // ── Средний чек — только дни где есть и факт и гости ──
  const guestDays   = days.filter(d => fN(d) > 0 && gN(d) > 0);
  const totalGuests = days.reduce((s, d) => s + gN(d), 0);
  const gFact       = guestDays.reduce((s, d) => s + fN(d), 0);
  const gGuests     = guestDays.reduce((s, d) => s + gN(d), 0);
  const avgCheck    = gGuests > 0 ? Math.round(gFact / gGuests) : null;

  // ── Санитарный контроль ──
  const dataCorrupt = !isFinite(totalFact) || totalFact > MAX_MONTHLY || mGoal > MAX_MONTHLY;

  // ── Редактор цели (только менеджер) ──
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const saveGoal = () => {
    const v = goalDraft === '' ? 0 : Number(goalDraft);
    if (!isFinite(v) || v < 0 || v > MAX_MONTHLY) { setEditGoal(false); return; }
    onSetMonthPlan && onSetMonthPlan(ym, v);
    setEditGoal(false);
  };

  // ── Статистика по типам событий ──
  const eventRows = EVENT_TYPES.map(type => {
    const typeDays         = days.filter(d => classifyEvent(events[d])?.id === type.id);
    const typeDaysWithFact = typeDays.filter(d => fN(d) > 0);
    const typeTotal        = typeDaysWithFact.reduce((s, d) => s + fN(d), 0);
    return {
      emoji:        type.emoji,
      name:         type.name,
      color:        type.color,
      barColor:     type.color,
      count:        typeDays.length,
      daysWithFact: typeDaysWithFact.length,
      avgFact:      typeDaysWithFact.length > 0 ? Math.round(typeTotal / typeDaysWithFact.length) : null,
    };
  }).filter(t => t.count > 0);

  const regularDays         = days.filter(d => !classifyEvent(events[d]));
  const regularDaysWithFact = regularDays.filter(d => fN(d) > 0);
  const regularTotal        = regularDaysWithFact.reduce((s, d) => s + fN(d), 0);
  const regularAvg          = regularDaysWithFact.length > 0
    ? Math.round(regularTotal / regularDaysWithFact.length) : null;

  const compRows = [
    ...eventRows,
    regularAvg != null && {
      emoji:        '📅',
      name:         'Обычные',
      color:        'var(--mt)',
      barColor:     'var(--cu)',
      count:        regularDays.length,
      daysWithFact: regularDaysWithFact.length,
      avgFact:      regularAvg,
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

      {/* Санитарный алерт */}
      {dataCorrupt && (
        <div style={{
          background: 'rgba(220,53,53,.12)', border: '1px solid rgba(220,53,53,.35)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13,
          color: '#e05555', lineHeight: 1.5,
        }}>
          <strong>⚠️ Данные выручки некорректны</strong> — числа выглядят нереальными.<br/>
          <span style={{ fontSize: 12, opacity: .85 }}>
            Откройте Календарь, найдите день с неверным числом, нажмите «Сохранить выручку».
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

      {/* ── Выручка-факт + светофор ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: 'var(--pp)' }}>
            {fmt(totalFact)} ₽
          </span>
          {factPct != null && (
            <span title="Факт ÷ план только за дни где есть оба значения" style={{
              fontSize: 16, fontWeight: 700,
              color: revColor(factPct),
              background: revColor(factPct) + '22',
              padding: '1px 7px', borderRadius: 8,
            }}>
              {factPct}%
            </span>
          )}
        </div>

        {/* Подпись к % */}
        {factPct != null && (
          <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3 }}>
            по {matchedCount} {plural(matchedCount, 'дню', 'дням', 'дням')} с планом · {fmt(matchedPlan)} ₽
            {!monthOver && elapsed > 0 && (
              <span style={{ opacity: .8 }}> · прошло {elapsed} из {daysInMonth} {plural(daysInMonth, 'дня', 'дней', 'дней')}</span>
            )}
          </div>
        )}

        {/* Суммарный план из таблицы — если задан */}
        {totalPlanFromDays > 0 && (
          <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>
            план месяца (из таблицы): <b style={{ color: 'var(--pp)', opacity: .8 }}>{fmt(totalPlanFromDays)} ₽</b>
            {!monthOver && totalFact > 0 && totalPlanFromDays > totalFact && (
              <span style={{ marginLeft: 6, color: 'var(--mt)' }}>
                · осталось {fmt(totalPlanFromDays - totalFact)} ₽
              </span>
            )}
            {monthOver && totalFact >= totalPlanFromDays && (
              <span style={{ color: '#8bc47a', marginLeft: 6 }}>
                · +{fmt(totalFact - totalPlanFromDays)} ₽ сверх
              </span>
            )}
          </div>
        )}

        {/* ── Цель месяца (менеджер) ── */}
        {(mGoal > 0 || isManager) && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
            {!editGoal ? (
              <div style={{ fontSize: 12, color: 'var(--mt)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  🎯 Цель:
                  {mGoal > 0
                    ? <b style={{ color: 'var(--pp)' }}>{fmt(mGoal)} ₽</b>
                    : <span style={{ opacity: .6 }}>не задана</span>}
                </span>
                {/* % от цели — отдельно от светофора */}
                {goalPct != null && (
                  <span title="Факт ÷ полный месячный план (все дни месяца)" style={{
                    fontSize: 11, fontWeight: 700,
                    color: revColor(goalPct),
                    background: revColor(goalPct) + '22',
                    padding: '1px 6px', borderRadius: 6,
                  }}>
                    {goalPct}% за месяц
                  </span>
                )}
                {isManager && onSetMonthPlan && (
                  <button onClick={() => { setGoalDraft(mGoal > 0 ? String(mGoal) : ''); setEditGoal(true); }}
                    style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6,
                      color: 'var(--mt)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}>
                    {mGoal > 0 ? 'Изменить' : 'Задать'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={goalDraft} autoFocus
                  onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditGoal(false); }}
                  placeholder="цель на месяц, ₽"
                  style={{ flex: 1, maxWidth: 180, background: 'var(--bg)', border: '1px solid var(--bd)',
                    borderRadius: 7, padding: '6px 10px', color: 'var(--pp)', fontSize: 13, fontFamily: 'inherit' }} />
                <button onClick={saveGoal}
                  style={{ background: 'var(--cu)', border: 'none', borderRadius: 7, color: 'var(--bg)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', fontFamily: 'inherit' }}>OK</button>
                <button onClick={() => setEditGoal(false)}
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
