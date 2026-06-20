// Роли сотрудников и их разрешения

export const ROLES = {
  barman: { label: "Бармен", perms: ["view_own_tasks", "mark_own_tasks", "view_schedule", "view_own_stats"] },
  head_barman: { label: "Шеф-бармен", perms: ["view_own_tasks", "mark_own_tasks", "view_schedule", "view_own_stats", "view_all_tasks", "add_tasks", "view_team_stats"] },
  manager: { label: "Управляющий", perms: ["*"] },
};

export const ALL_PERMS = [
  { id: "view_own_tasks", label: "Видеть свои задачи" },
  { id: "mark_own_tasks", label: "Отмечать задачи" },
  { id: "view_all_tasks", label: "Видеть все задачи" },
  { id: "add_tasks", label: "Создавать задачи" },
  { id: "view_schedule", label: "Расписание и календарь" },
  { id: "view_own_stats", label: "Своя статистика" },
  { id: "view_team_stats", label: "Статистика команды" },
];
