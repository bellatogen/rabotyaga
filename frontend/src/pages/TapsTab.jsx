// Вкладка «Краны» — кокпит маржинальности по розливу (21 кран).
// Карточки (не таблица), сортировка 🔴→🟡→🟢, детали с симулятором новой цены.
// ВСЕ вычисления — через utils/tapCompute.js (computeTap), формулы не дублируем.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, RefreshCw, Link2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { computeTap } from '../utils/tapCompute.js';
import {
  getTaps, updateTap, updateTapConfig, refreshTapSales,
} from '../services/api.js';

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bd)',
  background: 'var(--bg)', color: 'var(--pp)', fontFamily: 'inherit', fontSize: 15, boxSizing: 'border-box',
};
const lbl = { fontSize: 12, color: 'var(--mt)', marginBottom: 4, display: 'block' };

const fmtRub = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽');
const fmtPct = (n) => (n == null ? '—' : n.toFixed(1) + '%');

// Проверить наличие маппинга IIKO: string | string[] | null — defensive.
const hasIikoNames = (v) => {
  if (!v) return false;
  if (Array.isArray(v)) return v.some((s) => s && String(s).trim());
  return typeof v === 'string' && v.trim().length > 0;
};
// Нормализовать iikoProductId (string|string[]|null) в текст textarea (по имени на строку).
const iikoToText = (v) => {
  if (!v) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join('\n');
  return String(v);
};
// Текст textarea → массив строк (null если пусто).
const textToIiko = (s) => {
  const arr = String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return arr.length > 0 ? arr : null;
};

// Ранг бейджа для сортировки «что требует действия — наверху».
const badgeRank = { '🔴': 0, '🟡': 1, '🟢': 2 };

// Привести черновик (строковые поля инпутов) к типам бэка/computeTap.
function toRaw(d) {
  return {
    ...d,
    price: Number(d.price) || 0,
    cost: Number(d.cost) || 0,
    salesPerMonth: (d.salesPerMonth === '' || d.salesPerMonth == null) ? null : (Number(d.salesPerMonth) || 0),
    newPrice: (d.newPrice === '' || d.newPrice == null) ? null : Number(d.newPrice),
    // iikoProductId хранится как массив строк (текст textarea разбивается по \n).
    iikoProductId: textToIiko(d.iikoProductId),
    discountApplies: !!d.discountApplies,
    isAnchor: !!d.isAnchor,
    isStrategicHold: !!d.isStrategicHold,
  };
}

// Цвет рамки/акцента по бейджу.
const badgeColor = (b) => (b === '🟢' ? 'var(--hp)' : b === '🟡' ? 'var(--am)' : 'var(--rs)');

export function TapsTab() {
  const [taps, setTaps] = useState([]);       // сырые краны (поля модели)
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState('badge');  // 'badge' | 'margin' | 'ownership'
  const [openId, setOpenId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { taps, config } = await getTaps();
      setTaps(taps || []);
      setConfig(config || null);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Вычисленные краны (единый источник — computeTap) + сортировка.
  const computed = useMemo(() => {
    if (!config) return [];
    const list = taps.map((t) => computeTap(t, config));
    const byPos = (a, b) => (a.position || 0) - (b.position || 0);
    if (sort === 'margin') {
      list.sort((a, b) => (b.marginPerMonth || 0) - (a.marginPerMonth || 0) || byPos(a, b));
    } else if (sort === 'ownership') {
      list.sort((a, b) => String(a.ownership).localeCompare(String(b.ownership)) || byPos(a, b));
    } else {
      list.sort((a, b) => (badgeRank[a.badge] - badgeRank[b.badge]) || byPos(a, b));
    }
    return list;
  }, [taps, config, sort]);

  // Шапка: суммарная маржа/мес + счётчики бейджей.
  const totals = useMemo(() => {
    let margin = 0, g = 0, y = 0, r = 0;
    for (const t of computed) {
      if (t.marginPerMonth != null) margin += t.marginPerMonth;
      if (t.badge === '🟢') g++; else if (t.badge === '🟡') y++; else r++;
    }
    return { margin, g, y, r };
  }, [computed]);

  const onRefresh = async () => {
    setRefreshing(true); setMsg(null); setError(null);
    try {
      const res = await refreshTapSales();
      setMsg(res.updated ? `Обновлено кранов: ${res.updated}` : (res.message || 'Нет изменений'));
      await load();
    } catch (e) {
      setError(e.message || 'IIKO недоступен');
    } finally {
      setRefreshing(false);
    }
  };

  // Сохранить патч крана; обновить локальный список из ответа бэка.
  const saveTap = async (id, patch) => {
    setError(null);
    try {
      const { tap } = await updateTap(id, patch);
      setTaps((prev) => prev.map((t) => (t.id === id ? tap : t)));
      setMsg('Сохранено');
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    }
  };

  const saveConfig = async (patch) => {
    setError(null);
    try {
      const { config } = await updateTapConfig(patch);
      setConfig(config);
      setMsg('Настройки сохранены');
    } catch (e) {
      setError(e.message || 'Ошибка настроек');
    }
  };

  if (loading) return <div style={{ padding: 16, color: 'var(--mt)' }}>Загрузка кранов…</div>;

  return (
    <div style={{ padding: '12px 14px 80px', maxWidth: 640, margin: '0 auto' }}>
      {/* ── Шапка ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--mt)' }}>Маржа в месяц (всего)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--pp)' }}>{fmtRub(totals.margin)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Кнопка авто-refresh из IIKO убрана: DishAmountInt не равен порциям с ПК
              (см. историю). Продажи заносятся из ABC-выгрузки мозга или вручную. */}
          <button onClick={() => setSettingsOpen((v) => !v)} title="Настройки порогов" style={btn}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Счётчики бейджей */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 14 }}>
        <span>🔴 {totals.r}</span><span>🟡 {totals.y}</span><span>🟢 {totals.g}</span>
      </div>

      {/* Сортировка */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['badge', 'По приоритету'], ['margin', 'По марже/мес'], ['ownership', 'Свои/чужие']].map(([k, t]) => (
          <button key={k} onClick={() => setSort(k)}
            style={{ ...chip, ...(sort === k ? chipOn : {}) }}>{t}</button>
        ))}
      </div>

      {error && <div style={banner('var(--rs)')}>{error}</div>}
      {msg && <div style={banner('var(--hp)')} onClick={() => setMsg(null)}>{msg}</div>}

      {/* ── Настройки ── */}
      {settingsOpen && config && (
        <ConfigPanel config={config} onSave={saveConfig} />
      )}

      {/* ── Карточки ── */}
      {computed.map((t) => (
        <TapCard key={t.id} t={t} config={config}
          open={openId === t.id}
          onToggle={() => setOpenId((id) => (id === t.id ? null : t.id))}
          onSave={saveTap} />
      ))}
    </div>
  );
}

// ── Карточка крана ──
function TapCard({ t, config, open, onToggle, onSave }) {
  const accent = badgeColor(t.badge);
  return (
    <div style={{ background: 'var(--sf)', border: `1px solid ${open ? accent : 'var(--bd)'}`, borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
      {/* Заголовок-кнопка */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer' }}>
        <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{t.badge}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--mt)' }}>№{t.position}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--pp)' }}>{t.name}</span>
            <span style={pill(t.ownership === 'own' ? 'var(--cu)' : 'var(--mt)')}>{t.ownership === 'own' ? 'свой' : 'чужой'}</span>
            {hasIikoNames(t.iikoProductId) && <span style={pill('var(--cu)')}><Link2 size={11} /> IIKO</span>}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <Stat label="% факт" value={fmtPct(t.marginFactPct)} color={accent} />
            <Stat label="Прод/мес" value={t.salesPerMonth == null ? '—' : t.salesPerMonth} />
            <Stat label="Маржа/мес" value={fmtRub(t.marginPerMonth)} />
          </div>
        </div>
        {open ? <ChevronUp size={18} color="var(--mt)" /> : <ChevronDown size={18} color="var(--mt)" />}
      </div>
      {/* Рекомендация */}
      <div style={{ padding: '0 12px 10px 12px', fontSize: 12.5, color: accent }}>{t.recommendation}</div>

      {open && <TapDetail t={t} config={config} onSave={onSave} />}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--mt)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--pp)' }}>{value}</div>
    </div>
  );
}

// ── Детали + симулятор + правка ──
function TapDetail({ t, config, onSave }) {
  // Черновик: числовые поля как строки для свободного ввода.
  const initDraft = () => ({
    name: t.name ?? '',
    ownership: t.ownership ?? 'own',
    price: String(t.price ?? ''),
    cost: String(t.cost ?? ''),
    salesPerMonth: t.salesPerMonth == null ? '' : String(t.salesPerMonth),
    // iikoProductId: string[]|string|null → текст textarea (по имени на строку)
    iikoProductId: iikoToText(t.iikoProductId),
    newPrice: t.newPrice == null ? '' : String(t.newPrice),
    discountApplies: !!t.discountApplies,
    isAnchor: !!t.isAnchor,
    isStrategicHold: !!t.isStrategicHold,
  });
  const [d, setD] = useState(initDraft);
  // Пересинхрон при обновлении крана извне (после сохранения).
  useEffect(() => { setD(initDraft()); /* eslint-disable-next-line */ }, [t]);

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  // Тумблеры (isAnchor/isStrategicHold/discountApplies) сохраняются мгновенно:
  // оптимистично в черновик + PUT одного поля (saveTap пересчитает список/счётчики).
  const toggleSave = (k) => {
    const v = !d[k];
    set(k, v);
    onSave(t.id, { [k]: v });
  };

  // Live-расчёт по черновику — единый источник computeTap.
  const live = useMemo(() => computeTap(toRaw(d), config), [d, config]);
  // hasIiko: есть ли хоть одна непустая строка в textarea
  const hasIiko = textToIiko(d.iikoProductId) !== null;

  const onSubmit = () => {
    const raw = toRaw(d);
    onSave(t.id, {
      name: raw.name,
      ownership: raw.ownership,
      price: raw.price,
      cost: raw.cost,
      salesPerMonth: raw.salesPerMonth,
      iikoProductId: raw.iikoProductId,
      newPrice: raw.newPrice,
      discountApplies: raw.discountApplies,
      isAnchor: raw.isAnchor,
      isStrategicHold: raw.isStrategicHold,
    });
  };

  return (
    <div style={{ borderTop: '1px solid var(--bd)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Сводка факта */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="Цена меню" value={fmtRub(live.price)} />
        <Stat label="Факт цена" value={fmtRub(live.factPrice)} />
        <Stat label="С/С" value={fmtRub(live.cost)} />
        <Stat label="Маржа факт" value={`${fmtRub(live.marginFactRub)} · ${fmtPct(live.marginFactPct)}`} color={badgeColor(live.badge)} />
      </div>

      {/* ── Симулятор ── */}
      <div style={{ background: 'var(--bg)', border: '1px dashed var(--bd)', borderRadius: 10, padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pp)', marginBottom: 8 }}>Симулятор новой цены</div>
        <label style={lbl}>Новая цена, ₽</label>
        <input style={inp} inputMode="decimal" value={d.newPrice}
          onChange={(e) => set('newPrice', e.target.value)} placeholder="например 480" />
        {d.newPrice !== '' && (
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <Stat label="Новая факт цена" value={fmtRub(live.newFactPrice)} />
            <Stat label="Новый % факт" value={fmtPct(live.newMarginFactPct)} color={badgeColor(live.badge)} />
            <Stat label="Δ за год" value={(live.deltaYear >= 0 ? '+' : '') + fmtRub(live.deltaYear)}
              color={live.deltaYear >= 0 ? 'var(--hp)' : 'var(--rs)'} />
          </div>
        )}
      </div>

      {/* ── Переключатели ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Toggle label="Скидка/эквайринг (факт цена ниже)" on={d.discountApplies} onClick={() => toggleSave('discountApplies')} />
        <Toggle label="Якорь (малый шаг, следить)" on={d.isAnchor} onClick={() => toggleSave('isAnchor')} />
        <Toggle label="Стратегический холд (маржа ниже осознанно)" on={d.isStrategicHold} onClick={() => toggleSave('isStrategicHold')} />
      </div>

      {/* ── Правка полей ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>Цена меню, ₽</label>
          <input style={inp} inputMode="decimal" value={d.price} onChange={(e) => set('price', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Себестоимость, ₽</label>
          <input style={inp} inputMode="decimal" value={d.cost} onChange={(e) => set('cost', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Продаж/мес {hasIiko && <span style={{ color: 'var(--cu)' }}>(IIKO/вручную)</span>}</label>
          <input style={inp} inputMode="decimal" value={d.salesPerMonth}
            onChange={(e) => set('salesPerMonth', e.target.value)}
            placeholder="вручную или из IIKO" />
        </div>
        <div>
          <label style={lbl}>Владение</label>
          <select style={inp} value={d.ownership} onChange={(e) => set('ownership', e.target.value)}>
            <option value="own">свой</option>
            <option value="external">чужой</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>IIKO маппинг — точные DishName (по одному на строку)</label>
          <textarea
            style={{ ...inp, minHeight: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
            value={d.iikoProductId}
            onChange={(e) => set('iikoProductId', e.target.value)}
            placeholder={'Дримтим Порт Пилснер 0,5 драфт\nДримтим Порт Пилснер 0,25 драфт\n…'}
          />
          <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 3 }}>Точные DishName из iiko, по одному на строку. Пусто = не привязан.</div>
        </div>
      </div>

      <button onClick={onSubmit} style={{ ...btn, justifyContent: 'center', background: 'var(--cu)', color: 'var(--bg)', border: 'none', padding: '11px 14px', fontWeight: 600 }}>
        <Save size={16} /> Сохранить
      </button>
    </div>
  );
}

// ── Панель настроек порогов ──
function ConfigPanel({ config, onSave }) {
  const [g, setG] = useState(String(config.greenThreshold));
  const [y, setY] = useState(String(config.yellowThreshold));
  const [r, setR] = useState(String(config.discountRate));
  useEffect(() => {
    setG(String(config.greenThreshold)); setY(String(config.yellowThreshold)); setR(String(config.discountRate));
  }, [config]);

  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pp)', marginBottom: 10 }}>Настройки порогов</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>🟢 порог, %</label>
          <input style={inp} inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>🟡 порог, %</label>
          <input style={inp} inputMode="decimal" value={y} onChange={(e) => setY(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Скидка (0..1)</label>
          <input style={inp} inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} />
        </div>
      </div>
      <button onClick={() => onSave({ greenThreshold: Number(g), yellowThreshold: Number(y), discountRate: Number(r) })}
        style={{ ...btn, justifyContent: 'center', marginTop: 10, background: 'var(--cu)', color: 'var(--bg)', border: 'none', padding: '10px 14px', fontWeight: 600 }}>
        <Save size={16} /> Сохранить настройки
      </button>
    </div>
  );
}

// ── Переключатель ──
function Toggle({ label, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px',
      cursor: 'pointer', color: 'var(--pp)', fontSize: 13.5, textAlign: 'left', width: '100%',
    }}>
      <span>{label}</span>
      <span style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
        background: on ? 'var(--cu)' : 'var(--bd)', transition: 'background .2s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left .2s ease',
        }} />
      </span>
    </button>
  );
}

// ── Стили-константы ──
const btn = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--pp)', cursor: 'pointer', fontFamily: 'inherit',
};
const chip = {
  background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16, padding: '6px 12px',
  color: 'var(--mt)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};
const chipOn = { background: 'var(--cu)', color: 'var(--bg)', borderColor: 'var(--cu)' };
const pill = (c) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '2px 7px',
  borderRadius: 10, background: 'var(--bg)', color: c, border: `1px solid ${c}`,
});
const banner = (c) => ({
  background: 'var(--sf)', border: `1px solid ${c}`, color: c, borderRadius: 10,
  padding: '10px 12px', fontSize: 13, marginBottom: 10, cursor: 'pointer',
});

export default TapsTab;
