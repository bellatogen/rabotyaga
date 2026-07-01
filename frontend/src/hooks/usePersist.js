// Хук для автосохранения значения в хранилище при каждом изменении

import { useEffect, useRef } from 'react';
import { sv } from '../services/api.js';

/**
 * Сохраняет value в хранилище по ключу key при каждом изменении value,
 * но только после того как ready станет true.
 * Пропускает первый прогон после загрузки, чтобы не затереть изменения
 * с другого устройства (не эхоировать только что прочитанный снимок обратно).
 *
 * @param {object} [skipRef] — опциональный useRef({current:false}). Если вызывающий код ставит
 *   skipRef.current=true перед программным setState(свежепрочитанным с сервера значением),
 *   следующая запись пропускается один раз — чтобы не эхоировать обратно на сервер то,
 *   что только что оттуда же и пришло (лишний fetch + PG-flush на каждый sync/бэкфилл).
 */
export function usePersist(key, value, ready, skipRef) {
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; return; }
    if (skipRef?.current) { skipRef.current = false; return; }
    sv(key, value);
  }, [value, ready]);
}
