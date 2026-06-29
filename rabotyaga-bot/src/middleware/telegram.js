// Проверка Telegram WebApp initData (SEC-7): подпись HMAC-SHA256 + свежесть auth_date.
// Алгоритм Telegram: secret = HMAC_SHA256(key="WebAppData", msg=botToken);
//                    hash   = HMAC_SHA256(key=secret, msg=data_check_string) → hex.
// data_check_string — все поля кроме hash, отсортированы по ключу, "key=value" через \n.
'use strict';
const crypto = require('crypto');

const MAX_AGE_SEC = 24 * 60 * 60; // initData старше 24ч считаем просроченным (анти-replay)

/**
 * Проверяет подпись Telegram WebApp initData и свежесть auth_date.
 * @param {string} initData — строка из window.Telegram.WebApp.initData
 * @param {string} botToken — токен бота (process.env.TELEGRAM_TOKEN)
 * @returns {{ok:boolean, user?:object|null, authDate?:number, reason?:string}}
 */
function verifyInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'Пустой initData' };
  if (!botToken) return { ok: false, reason: 'Не задан botToken' };

  let params;
  try { params = new URLSearchParams(initData); }
  catch { return { ok: false, reason: 'Не удалось разобрать initData' }; }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'Нет подписи (hash)' };

  // data_check_string: все поля кроме hash, сортировка по ключу, key=value через \n.
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // timing-safe сравнение хешей. Буферы разной длины → точно не равны.
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Подпись Telegram недействительна' };
  }

  // Свежесть: auth_date не старше 24ч.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, reason: 'Нет auth_date' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > MAX_AGE_SEC) {
    return { ok: false, reason: 'initData просрочен (auth_date старше 24ч)' };
  }

  // user — для извлечения telegram id. Необязателен для самой проверки подписи.
  let user = null;
  const userRaw = params.get('user');
  if (userRaw) { try { user = JSON.parse(userRaw); } catch { /* оставляем null */ } }

  return { ok: true, user, authDate };
}

module.exports = { verifyInitData, MAX_AGE_SEC };
