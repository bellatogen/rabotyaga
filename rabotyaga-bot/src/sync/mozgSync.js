// mozgSync.js — синхронизация сводных метрик из mozg.rest
//
// Аутентификация через сессионные куки (PHPSESSID + login + pass).
// Запрос отчёта rep_dashboard двухшаговый: сначала action=load (получаем
// requestId и params), затем финальный POST с reqid — возвращает HTML с
// JSON-данными внутри.
//
// Сохраняет в data.kv:
//   mozg:dashboard:v1  — { 'YYYY-MM': { fact, guests, cheque, forecast, plan, orders, period, syncedAt } }
//   sync:mozg:status   — последний статус синка
//
// SEC-8: makeMozgSyncClient({login,password}) — фабрика с per-инстанс cookie jar.
// _jar/_sessionExp замкнуты в инстансе — два клиента не делят сессию.

const https = require('https');

const MOZG_HOST = 'mozg.rest';

// ── Stateless утилиты ────────────────────────────────────────────────────────

function parseCookies(headers) {
  const raw = headers['set-cookie'] || [];
  const out = {};
  for (const line of (Array.isArray(raw) ? raw : [raw])) {
    const eqIdx   = line.indexOf('=');
    const semiIdx = line.indexOf(';');
    if (eqIdx < 0) continue;
    const name  = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1, semiIdx < 0 ? undefined : semiIdx).trim();
    out[name] = value;
  }
  return out;
}

function jarToStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Парсинг rep_dashboard ────────────────────────────────────────────────────
// Данные встроены в HTML как JSON-фрагменты (встроенные литералы в
// JS-коде рендера графиков). Используем точные паттерны из реального ответа.

function parseDashboard(html) {
  // Факт: total.fact.summary
  const factRev = html.match(/"hllg_guest_type":"guest","realsum":(\d+)/);
  // Гости и чеки
  const factGst = html.match(/"guests":(\d+),"order_count":\d+,"cheque"/);
  const factOrd = html.match(/"order_count":(\d+),"cheque":([\d.]+)/);
  const factChq = factOrd ? factOrd[2] : null;
  // Прогноз
  const fcMatch   = html.match(/"forecast":\{"realsum":([\d.]+),"guests":(\d+)/);
  // План
  const planMatch = html.match(/"plan":\{"hllgs":\{"1":\{"forecast":\{"realsum":(\d+)/);
  if (!factRev) return null;
  return {
    fact:     Number(factRev[1]),
    guests:   factGst   ? Number(factGst[1])             : null,
    cheque:   factChq   ? Math.round(Number(factChq))    : null,
    orders:   factOrd   ? Number(factOrd[1])             : null,
    forecast: fcMatch   ? Math.round(Number(fcMatch[1])) : null,
    plan:     planMatch ? Number(planMatch[1])            : null,
  };
}

// ── SEC-8: фабрика клиента ───────────────────────────────────────────────────

/**
 * Создаёт mozg-клиент с замкнутым cookie-jar.
 * @param {{login?:string, password?:string}} opts
 * @returns {{ syncMozgDashboard(data,saveData):Promise, resetSession():void, isConfigured():boolean }}
 */
function makeMozgSyncClient({ login = '', password = '' } = {}) {
  const _login    = login    || '';
  const _password = password || '';

  // Замкнутое состояние сессии — инстансы не делят его между собой.
  let _jar        = {};
  let _sessionExp = 0;

  function isConfigured() {
    return !!(_login && _password);
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────

  function _mozgReq(method, path, bodyStr = '') {
    return new Promise((resolve, reject) => {
      const bodyBuf = bodyStr ? Buffer.from(bodyStr, 'utf8') : null;
      const opts = {
        hostname: MOZG_HOST,
        port: 443,
        path,
        method,
        headers: {
          'User-Agent': 'rabotyaga-bot/1.0',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://${MOZG_HOST}/auth`,
          ...(bodyBuf ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': bodyBuf.length,
          } : {}),
          ...(Object.keys(_jar).length ? { Cookie: jarToStr(_jar) } : {}),
        },
      };

      const req = https.request(opts, res => {
        Object.assign(_jar, parseCookies(res.headers));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });

      req.on('error', reject);
      req.setTimeout(30_000, () => { req.destroy(); reject(new Error('[mozgSync] HTTP timeout')); });
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  // ── Авторизация ────────────────────────────────────────────────────────────

  async function _ensureSession() {
    if (Date.now() < _sessionExp && Object.keys(_jar).length >= 2) return;
    if (!_login || !_password) {
      throw new Error('[mozgSync] MOZG_LOGIN / MOZG_PASSWORD не заданы');
    }
    _jar = {};
    // Шаг 1: инициализируем сессию (получаем PHPSESSID)
    await _mozgReq('GET', '/auth');
    // Шаг 2: авторизуемся
    const body = new URLSearchParams({ login: _login, pass: _password, responseType: 'json', log: '1' }).toString();
    const res  = await _mozgReq('POST', '/?form=logreg', body);
    if (res.status !== 200) throw new Error(`[mozgSync] auth HTTP ${res.status}`);
    let result;
    try { result = JSON.parse(res.body); }
    catch { throw new Error(`[mozgSync] auth: не JSON — ${res.body.slice(0, 80)}`); }
    if (!result.success) throw new Error(`[mozgSync] auth fail: ${result.message?.text || JSON.stringify(result.message)}`);
    if (result['2StepAuth']) throw new Error('[mozgSync] требуется 2FA — не поддерживается');
    // Сессия действует ~1 час
    _sessionExp = Date.now() + 55 * 60 * 1000;
    console.log('[mozgSync] ✅ авторизован');
  }

  // ── Двухшаговый запрос отчёта ──────────────────────────────────────────────

  async function _fetchReport(formName, params) {
    await _ensureSession();
    // Шаг 1: action=load
    const step1Body = new URLSearchParams({ ...params, action: 'load' }).toString();
    const step1     = await _mozgReq('POST', `/?form=${formName}`, step1Body);
    if (step1.status !== 200) throw new Error(`[mozgSync] ${formName} step1 HTTP ${step1.status}`);
    const tailMatch = step1.body.trimEnd().match(/"params"\s*:\s*"([^"]+)"\s*\}$/);
    const reqParams = tailMatch ? tailMatch[1] : new URLSearchParams(params).toString();
    // Шаг 2: финальный запрос
    const step2 = await _mozgReq('POST', `/?form=${formName}`, `${reqParams}&reqid=rpt${Date.now()}`);
    if (step2.status !== 200) throw new Error(`[mozgSync] ${formName} step2 HTTP ${step2.status}`);
    return step2.body;
  }

  // ── Основная функция синхронизации ─────────────────────────────────────────

  async function syncMozgDashboard(data, saveData) {
    const now        = new Date();
    const year       = now.getFullYear();
    const mon        = String(now.getMonth() + 1).padStart(2, '0');
    const ym         = `${year}-${mon}`;
    const daysInMon  = new Date(year, now.getMonth() + 1, 0).getDate();
    const dateFrom   = `${ym}-01`;
    const dateTo     = now.toISOString().slice(0, 10);
    const fincTo     = `${ym}-${String(daysInMon).padStart(2, '0')}`;

    const html = await _fetchReport('rep_dashboard', {
      date_from: dateFrom, date_to: dateTo, finc_from: dateFrom, finc_to: fincTo,
    });
    const parsed = parseDashboard(html);
    if (!parsed) throw new Error('[mozgSync] не удалось распарсить rep_dashboard — структура изменилась?');

    let stored;
    try { stored = JSON.parse(data.kv['mozg:dashboard:v1'] || '{}'); }
    catch { stored = {}; }
    stored[ym] = { ...parsed, period: { from: dateFrom, to: dateTo }, syncedAt: new Date().toISOString() };
    data.kv['mozg:dashboard:v1'] = JSON.stringify(stored);

    const status = {
      lastRun: new Date().toISOString(), ym,
      fact: parsed.fact, guests: parsed.guests, cheque: parsed.cheque,
      forecast: parsed.forecast, plan: parsed.plan, error: null,
    };
    data.kv['sync:mozg:status'] = JSON.stringify(status);
    saveData();

    const fmtN = n => n != null ? Number(n).toLocaleString('ru-RU') : '?';
    console.log(
      `[mozgSync] ✅ ${ym}: факт ${fmtN(parsed.fact)}₽` +
      `, гости ${fmtN(parsed.guests)}, чек ${fmtN(parsed.cheque)}₽, план ${fmtN(parsed.plan)}₽`
    );
    return status;
  }

  // Сброс сессии (для тестов / принудительного переlogina)
  function resetSession() { _jar = {}; _sessionExp = 0; }

  return { isConfigured, syncMozgDashboard, resetSession };
}

// ── Дефолтный клиент (back-compat) ───────────────────────────────────────────

const _defaultMozgClient = makeMozgSyncClient({
  login:    process.env.MOZG_LOGIN    || '',
  password: process.env.MOZG_PASSWORD || '',
});

module.exports = {
  makeMozgSyncClient,
  syncMozgDashboard: (...args) => _defaultMozgClient.syncMozgDashboard(...args),
  resetSession:      ()       => _defaultMozgClient.resetSession(),
};
