#!/usr/bin/env node
// secrets.test.js — тесты резолвера секретов (src/config/secrets.js). SEC-8.
// Запуск: node tests/secrets.test.js
'use strict';
const assert = require('assert');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

// Вспомогательная: временно ставит env-переменные, вызывает fn, чистит
function withEnv(vars, fn) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  try { return fn(); }
  finally { for (const k of Object.keys(vars)) delete process.env[k]; }
}

// Перезагружаем модуль при каждом тесте, чтобы env-изменения подхватились
function loadSecrets() {
  delete require.cache[require.resolve('../src/config/secrets')];
  return require('../src/config/secrets');
}

(async () => {
  process.stdout.write('\n── src/config/secrets.js ──\n');

  await test('возвращает "" если переменная не задана', async () => {
    const { getTenantSecret } = loadSecrets();
    assert.strictEqual(getTenantSecret('pivnaya_karta', 'NONEXISTENT_VAR_XYZ_SEC8'), '');
  });

  await test('дефолтный тенант: fallback на глобальное имя', async () => {
    withEnv({ IIKO_PASSWORD_TEST_SEC8: 'secret123' }, () => {
      // Используем уникальное имя чтобы не пересечься с реальным окружением
    });
    // Проверяем через реальный fallback-путь
    withEnv({ SEC8_TEST_GLOBAL: 'globalval' }, () => {
      const { getTenantSecret } = loadSecrets();
      assert.strictEqual(getTenantSecret('pivnaya_karta', 'SEC8_TEST_GLOBAL'), 'globalval');
    });
  });

  await test('возвращает значение с префиксом тенанта (приоритет над глобальным)', async () => {
    withEnv({ PIVNAYA_KARTA_SEC8_VAR: 'prefixed', SEC8_VAR: 'global' }, () => {
      const { getTenantSecret } = loadSecrets();
      assert.strictEqual(getTenantSecret('pivnaya_karta', 'SEC8_VAR'), 'prefixed');
    });
  });

  await test('другой тенант: нет fallback на глобальное имя', async () => {
    withEnv({ SEC8_OTHER_VAR: 'global' }, () => {
      const { getTenantSecret } = loadSecrets();
      assert.strictEqual(getTenantSecret('bar_dva', 'SEC8_OTHER_VAR'), '');
    });
  });

  await test('другой тенант: возвращает свою префиксную переменную', async () => {
    withEnv({ BAR_DVA_SEC8_VAR: 'bar2secret' }, () => {
      const { getTenantSecret } = loadSecrets();
      assert.strictEqual(getTenantSecret('bar_dva', 'SEC8_VAR'), 'bar2secret');
    });
  });

  await test('невалидный tenantId с дефисом → throw', async () => {
    const { getTenantSecret } = loadSecrets();
    assert.throws(() => getTenantSecret('bar-dva', 'IIKO_PASSWORD'), /невалидный tenantId/);
  });

  await test('невалидный tenantId с пробелом → throw', async () => {
    const { getTenantSecret } = loadSecrets();
    assert.throws(() => getTenantSecret('bar dva', 'IIKO_PASSWORD'), /невалидный tenantId/);
  });

  await test('невалидный tenantId пустая строка → throw', async () => {
    const { getTenantSecret } = loadSecrets();
    assert.throws(() => getTenantSecret('', 'IIKO_PASSWORD'), /невалидный tenantId/);
  });

  await test('невалидный tenantId верхний регистр → throw', async () => {
    const { getTenantSecret } = loadSecrets();
    assert.throws(() => getTenantSecret('Pivnaya_Karta', 'IIKO_PASSWORD'), /невалидный tenantId/);
  });

  await test('два тенанта не делят переменные (изоляция)', async () => {
    withEnv({ TENANT_A_SEC8_KEY: 'val_a', TENANT_B_SEC8_KEY: 'val_b' }, () => {
      const { getTenantSecret } = loadSecrets();
      assert.strictEqual(getTenantSecret('tenant_a', 'SEC8_KEY'), 'val_a');
      assert.strictEqual(getTenantSecret('tenant_b', 'SEC8_KEY'), 'val_b');
    });
  });

  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
