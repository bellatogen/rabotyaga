export const todayStr = () => new Date().toISOString().slice(0, 10);

export const isDone = (v) => v === true || (v && typeof v === 'object' && !!v.done);

export const isToday = (task, ds = todayStr()) => {
  if (task.kind === 'irregular') return false;
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') {
    const d = new Date(ds).getDay();
    return d !== 0 && d !== 6;
  }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
};

export const getTodayTasks = (tasks, ds = todayStr()) => {
  return tasks.filter(t => !t.archived && isToday(t, ds));
};

export const getTaskDoneStatus = (taskId, history, ds = todayStr()) => {
  return isDone(history[`${taskId}::${ds}`]);
};

export const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const getDayOfWeekRu = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Вск', 'Пнд', 'Втр', 'Срд', 'Чтв', 'Птн', 'Сбт'];
  return days[d.getDay()];
};
