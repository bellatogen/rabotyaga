import { isToday, isDone, todayStr, getTodayTasks, formatDate } from '../utils/taskUtils';

describe('taskUtils', () => {
  const today = '2026-06-20';
  
  describe('todayStr', () => {
    it('should return today date in YYYY-MM-DD format', () => {
      const result = todayStr();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isDone', () => {
    it('should return true for true value', () => {
      expect(isDone(true)).toBe(true);
    });

    it('should return true for object with done=true', () => {
      expect(isDone({ done: true })).toBe(true);
    });

    it('should return false for false value', () => {
      expect(isDone(false)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isDone(undefined)).toBe(false);
    });
  });

  describe('isToday', () => {
    it('should return false for irregular tasks', () => {
      const task = { id: 1, kind: 'irregular', title: 'Test' };
      expect(isToday(task, today)).toBe(false);
    });

    it('should return true for daily tasks', () => {
      const task = { id: 1, repeat: 'daily', title: 'Test' };
      expect(isToday(task, today)).toBe(true);
    });

    it('should return true for once tasks on matching date', () => {
      const task = { id: 1, repeat: 'once', date: today, title: 'Test' };
      expect(isToday(task, today)).toBe(true);
    });

    it('should return false for once tasks on non-matching date', () => {
      const task = { id: 1, repeat: 'once', date: '2026-06-21', title: 'Test' };
      expect(isToday(task, today)).toBe(false);
    });

    it('should respect from/until bounds', () => {
      const task = { id: 1, repeat: 'daily', from: '2026-06-15', until: '2026-06-19', title: 'Test' };
      expect(isToday(task, today)).toBe(false);
    });

    it('should return true for workday tasks on weekday', () => {
      const task = { id: 1, repeat: 'workday', title: 'Test' };
      const weekday = '2026-06-22'; // Monday
      expect(isToday(task, weekday)).toBe(true);
    });
  });

  describe('getTodayTasks', () => {
    it('should return only today tasks', () => {
      const tasks = [
        { id: 1, repeat: 'daily', archived: false, title: 'Task 1' },
        { id: 2, repeat: 'once', date: '2026-06-19', archived: false, title: 'Task 2' },
        { id: 3, repeat: 'daily', archived: true, title: 'Task 3' }
      ];
      const result = getTodayTasks(tasks, today);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should return empty array when no tasks match', () => {
      const tasks = [
        { id: 1, repeat: 'once', date: '2026-06-21', archived: false, title: 'Task 1' }
      ];
      const result = getTodayTasks(tasks, today);
      expect(result).toHaveLength(0);
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const result = formatDate('2026-06-20');
      // Устойчивый матч (не привязан к формату weekday в разных версиях ICU):
      // достаточно дня недели «сб», числа 20 и месяца «июн».
      expect(result).toMatch(/сб.*20.*июн/i);
    });
  });
});
