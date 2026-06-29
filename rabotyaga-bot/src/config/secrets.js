'use strict';
// secrets.js — SEC-8: резолвер секретов по тенанту.
// Схема имён env: <TENANT_ID_UPPER>_<NAME>
// Пример: PIVNAYA_KARTA_IIKO_PASSWORD для tid='pivnaya_karta', name='IIKO_PASSWORD'.
// Для дефолтного тенанта 'pivnaya_karta' — fallback на глобальное имя (без префикса),
// чтобы прод не сломался пока не переименованы старые переменные.
// Невалидный tid ([^a-z0-9_]) → throw, не тихий пропуск.

const VALID_TID    = /^[a-z0-9_]+$/;
const DEFAULT_TENANT = 'pivnaya_karta';

/**
 * Получить секрет для тенанта.
 * @param {string} tenantId — идентификатор тенанта ([a-z0-9_])
 * @param {string} name     — имя env-переменной (напр. IIKO_PASSWORD, TELEGRAM_TOKEN)
 * @returns {string} значение или '' если не задано
 */
function getTenantSecret(tenantId, name) {
  if (typeof tenantId !== 'string' || !VALID_TID.test(tenantId)) {
    throw new Error(`[secrets] невалидный tenantId: "${tenantId}" — допустимо только [a-z0-9_]`);
  }
  // Сначала ищем с префиксом тенанта: PIVNAYA_KARTA_IIKO_PASSWORD
  const prefixed = `${tenantId.toUpperCase()}_${name}`;
  if (process.env[prefixed] !== undefined) return process.env[prefixed];
  // Fallback только для дефолтного тенанта (прод-compat со старыми именами без префикса)
  if (tenantId === DEFAULT_TENANT) {
    return process.env[name] || '';
  }
  return '';
}

module.exports = { getTenantSecret, DEFAULT_TENANT };
