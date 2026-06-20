import { useState, useEffect } from 'react';
import { kvGet, kvSet } from '../services/api.js';
import { isToday, getTodayTasks, todayStr, isDone } from '../utils/taskUtils.js';
import { TaskCard } from './TaskCard.jsx';

export function TasksTab() {
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const tasksData = await kvGet('tasks:v4');
      const historyData = await kvGet('done:hist:v2');
      setTasks(tasksData || []);
      setHistory(historyData || {});
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = async (taskId, done) => {
    const ds = todayStr();
    const key = `${taskId}::${ds}`;
    const newHistory = { ...history, [key]: done };
    setHistory(newHistory);
    try {
      await kvSet('done:hist:v2', newHistory);
    } catch (err) {
      console.error('Failed to save task state:', err);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Загрузка...</div>;

  const todayTasks = getTodayTasks(tasks);

  return (
    <div style={{ padding: '12px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>📋 Дела на сегодня</h2>
      {todayTasks.length === 0 ? (
        <div style={{ color: 'var(--mt)', fontSize: '14px', textAlign: 'center', paddingTop: '40px' }}>
          Задач нет
        </div>
      ) : (
        todayTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            history={history}
            onToggle={handleToggleTask}
          />
        ))
      )}
    </div>
  );
}
