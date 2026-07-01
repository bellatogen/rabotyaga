'use strict';
// engine.js — чистая логика наследования прав по дереву ролей (P0 «Привилегии/ACL», Ф1).
// Без побочных эффектов и без зависимости от БД — тестируется напрямую.
//
// Наследование ADDITIVE-ONLY: эффективные права роли = объединение СОБСТВЕННЫХ грантов
// самой роли и всех её предков вверх по дереву. Ребёнок не может отобрать право родителя.
//
//   effective(role) = ⋃ own(r) для r ∈ [role → parent → … → корень]

// Собрать индекс ролей из строк БД.
// roleRows: [{ id, name, parent_role_id, is_system }]
// permRows: [{ role_id, permission_key }]  (только собственные гранты)
// → Map<roleId, { id, name, parentId, own:Set<string> }>
function buildRoleTable(roleRows, permRows) {
  const table = new Map();
  for (const r of roleRows) {
    table.set(r.id, {
      id: r.id,
      name: r.name,
      parentId: r.parent_role_id || null,
      own: new Set(),
    });
  }
  for (const p of permRows) {
    const node = table.get(p.role_id);
    if (node) node.own.add(p.permission_key);
  }
  return table;
}

// Эффективные права одной роли (обход предков с защитой от циклов).
function computeEffective(table, roleId) {
  const out = new Set();
  const seen = new Set();
  let cur = roleId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = table.get(cur);
    if (!node) break;
    for (const k of node.own) out.add(k);
    cur = node.parentId;
  }
  return out;
}

// Построить полный индекс эффективных прав: Map<roleId, Set<permission>>.
function buildEffectiveIndex(roleRows, permRows) {
  const table = buildRoleTable(roleRows, permRows);
  const index = new Map();
  for (const roleId of table.keys()) {
    index.set(roleId, computeEffective(table, roleId));
  }
  return index;
}

// Обнаружение цикла при попытке назначить parentId роли (для API Ф4; в Ф1 — для тестов).
// Возвращает true, если candidateParentId является потомком roleId (создал бы цикл).
function wouldCreateCycle(roleRows, roleId, candidateParentId) {
  if (!candidateParentId) return false;
  if (candidateParentId === roleId) return true;
  const byId = new Map(roleRows.map(r => [r.id, r.parent_role_id || null]));
  const seen = new Set();
  let cur = candidateParentId;
  while (cur && !seen.has(cur)) {
    if (cur === roleId) return true;
    seen.add(cur);
    cur = byId.get(cur) || null;
  }
  return false;
}

module.exports = {
  buildRoleTable,
  computeEffective,
  buildEffectiveIndex,
  wouldCreateCycle,
};
