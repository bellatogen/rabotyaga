// Аналитический блок под месячным календарём.
// Показывает: план к дате, цель месяца, гости + средний чек (с YoY),
// среднее по дням недели, события в кольцах.

import { useState } from 'react';
import { EVENT_TYPES, classifyEvent } from '../../constants/events.js';
import { MONTHS_RU } from '../../constants/locale.js';
import { revColor, kRub } from '../../utils/revenueUtils.js';

const MAX_MONTHLY = 30_000_000;
const DOW_LABELS  = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ── Утилиты ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || !isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('ru-RU');
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ── Светофорный бэдж ────────────────────────────────────────────────────────
function PctBadge({ pct, size = 13 }) {
  if (pct == null) return null;
  const c = revColor(pct);
  return (
    <span style={{
      fontSize: size, fontWeight: 700, color: c,
      background: c + '22', padding: '2px 8px', borderRadius: 8, flexShrink: 0,
    }}>
      {pct}%
    </span>
  );
}

// ── Тонкий прогресс-бар ──────────────────────────────────────────────────────
function PBar({ pct }) {
  const c = revColor(pct ?? 0);
  return (
    <div style={{ height: 4, background: 'var(--bd)', borderRadius: 3, overflow: 'hidden', margin: '5px 0 0' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, pct ?? 0)}%`,
        background: c, borderRadius: 3, transition: 'width .5s ease',
      }} />
    </div>
  );
}

// ── Карточка плана ──────────────────────────────────────────────────────────
function PlanCard({ label, fact, plan, pct, sub, action }) {
  return (
    <div style={{
      background: 'var(--sf)', borderRadius: 11, padding: '11px 14px',
      border: '1px solid var(--bd)', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          {label}
        </span>
        {action}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: 'var(--pp)', lineHeight: 1.1 }}>
          {fmt(fact)} ₽
        </span>
        <PctBadge pct={pct} />
      </div>
      {pct != null && <PBar pct={pct} />}
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 5, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Метрическая карточка (гости / средний чек) ───────────────────────────────
function MetricCard({ icon, label, value, unit = '', lyValue, pctOfPlan, note }) {
  const delta = lyValue > 0 && value > 0 ? Math.round((value / lyValue - 1) * 100) : null;
  const c = delta != null ? (delta > 0 ? '#8bc47a' : delta < 0 ? '#e85535' : 'var(--mt)') : null;
  return (
    <div style={{
      flex: 1, background: 'var(--sf)', borderRadius: 11,
      padding: '11px 14px', border: '1px solid var(--bd)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 3 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
        {value != null ? `${fmt(value)}${unit}` : '—'}
      </div>
      {/* % от плана — если передан */}
      {pctOfPlan != null && (
        <div style={{ marginTop: 3 }}>
          <PctBadge pct={pctOfPlan} size={11} />
        </div>
      )}
      {/* YoY — полупрозрачно */}
      {lyValue > 0 && (
        <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 5, opacity: .6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{new Date().getFullYear() - 1}: {fmt(lyValue)}{unit}</span>
          {delta != null && (
            <span style={{ color: c, fontWeight: 700, opacity: 1 }}>
              {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}%
            </span>
          )}
        </div>
      )}
      {note && <div style={{ fontSize: 10, color: 'var(--mt)', opacity: .45, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// ── Спарклайн ───────────────────────────────────────────────────────────────
function Sparkline({ days, revenue, events }) {
  const fN    = d => Number(revenue[d]?.fact) || 0;
  const pN    = d => Number(revenue[d]?.plan) || 0;
  const facts = days.map(d => fN(d));
  const maxF  = Math.max(1, ...facts);
  if (!facts.some(f => f > 0)) return null;

  const activeTypes = EVENT_TYPES.filter(et =>
    days.some(d => classifyEvent(events[d])?.id === et.id)
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 46, paddingBottom: 6 }}>
        {days.map((date, i) => {
          const fact = facts[i];
          const plan = pN(date);
          const pct  = plan > 0 && fact > 0 ? (fact / plan) * 100 : null;
          const barH = fact > 0 ? Math.max(2, (fact / maxF) * 38) : 1;
          const color = pct != null ? revColor(pct) : fact > 0 ? 'var(--cu)' : 'var(--bd)';
          const ev = classifyEvent(events[date]);
          return (
            <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
              <div style={{ width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0', opacity: fact > 0 ? .85 : .2 }} />
              <div style={{ width: 3, height: 3, borderRadius: '50%', flexShrink: 0, background: ev ? ev.color : 'transparent' }} />
            </div>
          );
        })}
      </div>
      {activeTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--mt)', flexWrap: 'wrap' }}>
          {activeTypes.map(et => (
            <span key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: et.color, display: 'inline-block' }} />
              {et.shortName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Средняя выручка по дням недели ──────────────────────────────────────────
function WeekdayChart({ days, revenue }) {
  const fN    = d => Number(revenue[d]?.fact) || 0;
  const byDow = Array(7).fill(null).map(() => ({ total: 0, count: 0 }));
  days.filter(d => fN(d) > 0).forEach(d => {
    const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7; // 0=Пн
    byDow[dow].total += fN(d);
    byDow[dow].count++;
  });
  const avgs   = byDow.map(x => x.count > 0 ? Math.round(x.total / x.count) : 0);
  const maxAvg = Math.max(1, ...avgs);
  // Лучший день (только среди тех где есть данные)
  const bestDow = avgs.reduce((bi, a, i) => a > (avgs[bi] || 0) ? i : bi, 0);

  if (!avgs.some(a => a > 0)) return null;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 7 }}>
        Avg по дням недели
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 52 }}>
        {avgs.map((avg, i) => {
          const h       = avg > 0 ? Math.max(4, (avg / maxAvg) * 44) : 2;
          const isBest  = i === bestDow && avg > 0;
          const isWknd  = i >= 4; // Пт-Вс
          const color   = isBest ? '#8bc47a' : isWknd ? '#5b8b9b' : 'var(--cu)';
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: '100%', height: h,
                background: avg > 0 ? color : 'var(--bd)',
                borderRadius: '3px 3px 0 0',
                opacity: avg > 0 ? .85 : .2,
                boxShadow: isBest ? `0 0 7px ${color}70` : 'none',
              }} />
              <span style={{ fontSize: 9, color: isBest ? '#8bc47a' : 'var(--mt)', fontWeight: isBest ? 700 : 400 }}>
                {DOW_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
        {avgs.map((avg, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--mt)', opacity: avg > 0 ? .7 : 0 }}>
            {avg > 0 ? kRub(avg) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Кольца событий ─────────────────────────────────────────────────────────
function EventRings({ rows }) {
  if (!rows.length) return null;
  const R = 15, C = 19, sw = 3;
  const circ = 2 * Math.PI * R;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 7 }}>
        События
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {rows.map((row, i) => {
          const dash = total > 0 ? (row.count / total) * circ : 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 38 }}>
              <svg width={C * 2} height={C * 2} viewBox={`0 0 ${C * 2} ${C * 2}`}>
                <circle cx={C} cy={C} r={R} fill="none" stroke="var(--bd)" strokeWidth={sw} />
                {dash > 0.1 && (
                  <circle cx={C} cy={C} r={R} fill="none"
                    stroke={row.color} strokeWidth={sw}
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${C} ${C})`}
                  />
                )}
                <text x={C} y={C + 3.5} textAnchor="middle" fontSize={9}
                  fill="var(--pp)" fontWeight={700} fontFamily="var(--font-mono, monospace)">
                  {row.count}
                </text>
              </svg>
              <span style={{ fontSize: 9, color: row.color, textAlign: 'center', lineHeight: 1.2 }}>
                {row.emoji}
              </span>
              {row.avgFact != null && (
                <span style={{ fontSize: 9, color: 'var(--mt)', opacity: .65, textAlign: 'center' }}>
                  {kRub(row.avgFact)}
                </span>
              )}
            </div>
          );
        })}
      </div>
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

  const fN  = d => Number(revenue[d]?.fact)     || 0;
  const pN  = d => Number(revenue[d]?.plan)     || 0;
  const gN  = d => Number(revenue[d]?.guests)   || 0;
  const lyN = d => Number(revenue[d]?.lastYear) || 0;

  // ── Факт месяца ──
  const daysWithFact = days.filter(d => fN(d) > 0);
  const totalFact    = daysWithFact.reduce((s, d) => s + fN(d), 0);

  // ── Прогресс месяца (сколько дней прошло) ──
  const todayYM  = ds ? ds.slice(0, 7) : null;
  const today    = ds || '';
  const isCurMonth = todayYM === ym;
  const elapsed  = isCurMonth
    ? Math.min(daysInMonth, Number(ds.slice(8, 10)))
    : todayYM && ym < todayYM ? daysInMonth : 0;
  const monthOver = elapsed >= daysInMonth;

  // ── Блок 1: план к сегодняшней дате (только текущий месяц) ──
  // = сумма дневных планов за прошедшие дни
  const elapsedDays = isCurMonth ? days.filter(d => d <= today) : days;
  const planToDate  = elapsedDays.reduce((s, d) => s + pN(d), 0);
  const pctToDate   = planToDate > 0 ? Math.round((totalFact / planToDate) * 100) : null;

  // ── Блок 2: цель месяца ──
  // приоритет: менеджерская цель → сумма дневных планов
  const totalPlanFromDays = days.reduce((s, d) => s + pN(d), 0);
  const mGoalExplicit = Number(monthPlan?.[ym]) || 0;
  const mGoal  = mGoalExplicit || totalPlanFromDays;
  const goalPct = mGoal > 0 ? Math.round((totalFact / mGoal) * 100) : null;

  // ── YoY выручка ──
  // Сравниваем только по дням где есть ОБА года
  const lyDays = days.filter(d => lyN(d) > 0 && fN(d) > 0);
  const totalLY    = lyDays.reduce((s, d) => s + lyN(d), 0);
  const totalFLY   = lyDays.reduce((s, d) => s + fN(d), 0); // факт этого года за те же дни
  const lyRevDelta = totalLY > 0 ? Math.round((totalFLY / totalLY - 1) * 100) : null;
  const lyRevAbs   = lyDays.length > 0 ? Math.round(totalLY / lyDays.length * daysWithFact.length) : 0;
  // ^ приближённый итог прошлого года за то же кол-во дней — для MetricCard

  // ── Гости и средний чек ──
  const totalGuests = days.reduce((s, d) => s + gN(d), 0);
  const guestDays   = days.filter(d => fN(d) > 0 && gN(d) > 0);
  const gFact       = guestDays.reduce((s, d) => s + fN(d), 0);
  const gGuests     = guestDays.reduce((s, d) => s + gN(d), 0);
  const avgCheck    = gGuests > 0 ? Math.round(gFact / gGuests) : null;
  const avgGuestsPerDay = guestDays.length > 0 ? Math.round(totalGuests / guestDays.length) : null;
  // % гостей "от плана" — avg check × guests vs fact (как косвенный индикатор)
  // Нет прямого плана для гостей — показываем avg/день и YoY

  // ── Санитарный контроль ──
  const dataCorrupt = !isFinite(totalFact) || totalFact > MAX_MONTHLY || mGoal > MAX_MONTHLY;

  // ── Редактор цели ──
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const saveGoal = () => {
    const v = goalDraft === '' ? 0 : Number(goalDraft);
    if (!isFinite(v) || v < 0 || v > MAX_MONTHLY) { setEditGoal(false); return; }
    onSetMonthPlan && onSetMonthPlan(ym, v);
    setEditGoal(false);
  };

  // ── Аналитика по типам событий ──
  const eventRows = EVENT_TYPES.map(type => {
    const typeDays  = days.filter(d => classifyEvent(events[d])?.id === type.id);
    const twf       = typeDays.filter(d => fN(d) > 0);
    const typeTotal = twf.reduce((s, d) => s + fN(d), 0);
    return {
      emoji: type.emoji, name: type.name, shortName: type.shortName,
      color: type.color,
      count: typeDays.length, daysWithFact: twf.length,
      avgFact: twf.length > 0 ? Math.round(typeTotal / twf.length) : null,
    };
  }).filter(t => t.count > 0);

  const regularDays = days.filter(d => !classifyEvent(events[d]));
  const regWF       = regularDays.filter(d => fN(d) > 0);
  const regTotal    = regWF.reduce((s, d) => s + fN(d), 0);
  const regAvg      = regWF.length > 0 ? Math.round(regTotal / regWF.length) : null;
  const allEventRows = [
    ...eventRows,
    ...(regAvg != null ? [{
      emoji: '📅', name: 'Обычные', shortName: 'Обычные',
      color: 'var(--mt)', count: regularDays.length,
      daysWithFact: regWF.length, avgFact: regAvg,
    }] : []),
  ];

  // ── Нет данных ──
  if (daysWithFact.length === 0) {
    return (
      <div className="sec" style={{ paddingTop: 14 }}>
        <div className="sec-lbl">📊 Аналитика · {MONTHS_RU[m - 1]}</div>
        <div style={{ fontSize: 12, color: 'var(--mt)', textAlign: 'center', padding: '14px 0', opacity: .6 }}>
          Данных выручки за {MONTHS_RU[m - 1].toLowerCase()} пока нет
        </div>
      </div>
    );
  }

  // ── Редактор цели (кнопка/форма) ──
  const goalAction = isManager && onSetMonthPlan
    ? editGoal
      ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" value={goalDraft} autoFocus
            onChange={e => setGoalDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditGoal(false); }}
            style={{ width: 100, background: 'var(--bg)', border: '1px solid var(--bd)',
              borderRadius: 6, padding: '3px 7px', color: 'var(--pp)', fontSize: 12, fontFamily: 'inherit' }}
          />
          <button onClick={saveGoal} style={{ background: 'var(--cu)', border: 'none', borderRadius: 6,
            color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '3px 9px', fontFamily: 'inherit' }}>OK</button>
          <button onClick={() => setEditGoal(false)} style={{ background: 'transparent', border: '1px solid var(--bd)',
            borderRadius: 6, color: 'var(--mt)', cursor: 'pointer', fontSize: 12, padding: '3px 7px', fontFamily: 'inherit' }}>✕</button>
        </div>
      )
      : (
        <button onClick={() => { setGoalDraft(mGoalExplicit > 0 ? String(mGoalExplicit) : ''); setEditGoal(true); }}
          style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6,
            color: 'var(--mt)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}>
          {mGoalExplicit > 0 ? 'Изменить' : 'Задать'}
        </button>
      )
    : null;

  return (
    <div className="sec" style={{ paddingTop: 14 }}>

      {/* Санитарный алерт */}
      {dataCorrupt && (
        <div style={{
          background: 'rgba(220,53,53,.12)', border: '1px solid rgba(220,53,53,.35)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13,
          color: '#e05555', lineHeight: 1.5,
        }}>
          <strong>⚠️ Данные выручки некорректны</strong> — числа нереальные.<br/>
          <span style={{ fontSize: 12, opacity: .85 }}>
            Откройте Календарь → найдите день с неверным числом → «Сохранить выручку».
          </span>
        </div>
      )}

      {/* Заголовок */}
      <div className="sec-head" style={{ marginBottom: 8 }}>
        <span className="sec-lbl">📊 {MONTHS_RU[m - 1]}</span>
        <span style={{ fontSize: 11, color: 'var(--mt)' }}>{daysWithFact.length}/{daysInMonth} дн.</span>
      </div>

      {/* Спарклайн */}
      <Sparkline days={days} revenue={revenue} events={events} />

      {/* ── Факт к сегодняшней дате (только текущий месяц) ── */}
      {isCurMonth && planToDate > 0 && (
        <PlanCard
          label={`Факт к ${elapsed}-му · план к дате`}
          fact={totalFact}
          plan={planToDate}
          pct={pctToDate}
          sub={
            <>
              план: <b style={{ color: 'var(--pp)', opacity: .75 }}>{fmt(planToDate)} ₽</b>
              {pctToDate != null && pctToDate < 100 && (
                <span style={{ color: 'var(--mt)', marginLeft: 6 }}>
                  отстаём на {fmt(Math.max(0, planToDate - totalFact))} ₽
                </span>
              )}
              {pctToDate != null && pctToDate >= 100 && (
                <span style={{ color: '#8bc47a', marginLeft: 6 }}>
                  опережаем на {fmt(totalFact - planToDate)} ₽
                </span>
              )}
              {lyRevDelta != null && (
                <span style={{ marginLeft: 8, opacity: .55, fontSize: 10 }}>
                  vs {y - 1}: <span style={{ color: lyRevDelta > 0 ? '#8bc47a' : '#e85535', fontWeight: 600 }}>
                    {lyRevDelta > 0 ? '+' : ''}{lyRevDelta}%
                  </span>
                </span>
              )}
            </>
          }
        />
      )}

      {/* ── Цель месяца ── */}
      <PlanCard
        label={monthOver ? 'Итог месяца' : 'Цель месяца'}
        fact={totalFact}
        plan={mGoal}
        pct={goalPct}
        action={goalAction}
        sub={
          mGoal > 0
            ? (!monthOver
                ? <>
                    план: <b style={{ color: 'var(--pp)', opacity: .75 }}>{fmt(mGoal)} ₽</b>
                    <span style={{ color: 'var(--mt)', marginLeft: 6 }}>
                      · прошло {elapsed} из {daysInMonth} {plural(daysInMonth, 'дня', 'дней', 'дней')}
                    </span>
                    {totalFact < mGoal && (
                      <span style={{ color: 'var(--mt)', marginLeft: 6 }}>
                        · осталось {fmt(mGoal - totalFact)} ₽
                      </span>
                    )}
                  </>
                : totalFact >= mGoal
                  ? <span style={{ color: '#8bc47a' }}>✅ +{fmt(totalFact - mGoal)} ₽ сверх цели</span>
                  : <span style={{ color: '#e85535' }}>не дошли {fmt(mGoal - totalFact)} ₽</span>)
            : <span style={{ opacity: .5 }}>дневные планы не заданы</span>
        }
      />

      {/* ── Гости + Средний чек ── */}
      {totalGuests > 0 ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <MetricCard
            icon="👥" label="Гостей"
            value={totalGuests}
            note={avgGuestsPerDay != null ? `≈ ${fmt(avgGuestsPerDay)} / день (${guestDays.length} дн.)` : null}
          />
          {avgCheck != null && (
            <MetricCard
              icon="🧾" label="Средний чек"
              value={avgCheck} unit=" ₽"
              note={`за ${guestDays.length} ${plural(guestDays.length, 'день', 'дня', 'дней')}`}
            />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--mt)', opacity: .5, fontStyle: 'italic', marginBottom: 10 }}>
          Данные гостей появятся после синхронизации с iiko
        </div>
      )}

      {/* ── По дням недели + кольца событий ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 4 }}>
        <WeekdayChart days={days} revenue={revenue} />
        {allEventRows.length > 0 && <EventRings rows={allEventRows} />}
      </div>

    </div>
  );
}
