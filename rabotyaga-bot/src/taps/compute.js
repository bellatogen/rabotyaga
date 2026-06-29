'use strict';
// КАНОН формул кокпита кранов (маржинальный калькулятор по розливу).
// Единственный источник истины для бэка И фронта.
// На фронте лежит ЗЕРКАЛО: frontend/src/utils/tapCompute.js (ESM).
// При любой правке формул/рекомендаций — синхронизировать оба файла байт-в-байт.
//
// CommonJS-модуль (бэкенд). Чистые функции, без побочных эффектов.

// Безопасное деление: возвращает 0 если знаменатель <= 0.
function pct(numer, denom) {
  return denom > 0 ? (numer / denom) * 100 : 0;
}

// Округление до целого рубля (как в IIKO-расчётах проекта).
const round = (x) => Math.round(x);

// computeTap(tap, config) → { ...исходные поля, вычисления, recommendation, badge }
// config: { greenThreshold, yellowThreshold, discountRate }
function computeTap(tap, config) {
  const cfg = config || {};
  const green = Number.isFinite(cfg.greenThreshold) ? cfg.greenThreshold : 70;
  const yellow = Number.isFinite(cfg.yellowThreshold) ? cfg.yellowThreshold : 60;
  const discountRate = Number.isFinite(cfg.discountRate) ? cfg.discountRate : 0.055;

  const price = Number(tap.price) || 0;
  const cost = Number(tap.cost) || 0;
  const discountApplies = !!tap.discountApplies;
  const salesPerMonth = (tap.salesPerMonth == null) ? null : (Number(tap.salesPerMonth) || 0);

  // Фактическая цена с учётом эквайринг/скидки
  const factPrice = discountApplies ? round(price * (1 - discountRate)) : price;

  // Маржа по меню (без скидки)
  const marginMenuRub = price - cost;
  const marginMenuPct = pct(price - cost, price);

  // Маржа по факту (со скидкой)
  const marginFactRub = factPrice - cost;
  const marginFactPct = pct(factPrice - cost, factPrice);

  // Маржа в месяц (рубли)
  const marginPerMonth = (salesPerMonth == null) ? null : marginFactRub * salesPerMonth;

  // Симулятор новой цены
  const hasNew = tap.newPrice != null && Number.isFinite(Number(tap.newPrice));
  let newFactPrice = null, newMarginFactRub = null, newMarginFactPct = null, deltaYear = 0;
  if (hasNew) {
    const newPrice = Number(tap.newPrice);
    newFactPrice = discountApplies ? round(newPrice * (1 - discountRate)) : newPrice;
    newMarginFactRub = newFactPrice - cost;
    newMarginFactPct = pct(newFactPrice - cost, newFactPrice);
    deltaYear = ((newFactPrice - cost) - marginFactRub) * (salesPerMonth || 0) * 12;
  }

  // Бейдж + рекомендация по marginFactPct
  let badge;
  if (marginFactPct >= green) badge = '🟢';
  else if (marginFactPct >= yellow) badge = '🟡';
  else badge = '🔴';

  let recommendation;
  if (marginFactPct >= green) {
    recommendation = 'Держать, искать объёмную сделку';
  } else if (marginFactPct >= yellow) {
    recommendation = 'Норма — можно тихо поднять';
  } else {
    recommendation = 'Низко — поднять цену / сбить С/С';
    if (tap.ownership === 'own') recommendation += ' (через трансфертную цену)';
    else if (tap.ownership === 'external') recommendation += ' (цена за объём / 10+1 / ретробонус)';
  }

  // Модификаторы
  if (tap.isAnchor) recommendation += ' · якорь: малый шаг, следить 2 нед';
  if (tap.isStrategicHold && marginFactPct < yellow) {
    recommendation = 'Стратегический холд — маржа ниже нормы осознанно';
  }

  return {
    ...tap,
    factPrice,
    marginMenuRub,
    marginMenuPct,
    marginFactRub,
    marginFactPct,
    marginPerMonth,
    newFactPrice,
    newMarginFactRub,
    newMarginFactPct,
    deltaYear,
    recommendation,
    badge,
  };
}

module.exports = { computeTap };
