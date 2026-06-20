// Хук для автосохранения значения в хранилище при каждом изменении

import { useEffect, useRef } from 'react';
import { sv } from '../services/api.js';

/**
 * Сохраняет value в хранилище по ключу key при каждом изменении value,
 * но только после того как ready станет true.
 * Пропускает первый прогон после загрузки, чтобы не затереть изменения
 * с другого устройства (не эхоировать только что прочитанный снимок обратно).
 */
export function usePersist(key, value, ready) {
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; return; }
    sv(key, value);
  }, [value, ready]);
}
