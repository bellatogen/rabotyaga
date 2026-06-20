import { useState } from 'react';
import { AlertTriangle, AtSign } from 'lucide-react';

export function AdminTab({ auth, members, ds }) {
  const adminToken = auth?.manager || '';
  const [copied, setCopied] = useState(false);
  
  const copyToken = () => {
    navigator.clipboard.writeText(adminToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!adminToken) {
    return (
      <div className="sec">
        <div className="info-box">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: 6 }} />
          Токен админа не задан. Установи пароль управляющего в кабинете.
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
        <div className="sec-lbl" style={{ marginBottom: 8 }}>⚙️ Админ-панель</div>
        <div className="info-box">
          Используй панель для управления пушами, расписанием и привязками сотрудников к Telegram.
        </div>
        
        <div className="info-box" style={{ fontSize: 11, marginTop: 8 }}>
          Ссылка (с токеном):
        </div>
        <code
          style={{
            background: 'var(--bg)',
            padding: '8px 10px',
            borderRadius: 6,
            display: 'block',
            marginTop: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            wordBreak: 'break-all',
            color: 'var(--cu)',
          }}
        >
          ?admin=true&token={adminToken}
        </code>
        
        <button
          className="btn btn-p"
          onClick={copyToken}
          style={{ marginTop: 8 }}
        >
          <AtSign size={15} />
          {copied ? '✓ Скопировано' : 'Копировать токен'}
        </button>
      </div>

      <div className="info-box" style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>В админке доступно:</div>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>📬 Логи пушей — история рассылок</li>
          <li>📅 График пушей — расписание на день</li>
          <li>👥 Привязки — сотрудники и Telegram ID</li>
        </ul>
      </div>

      <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 10 }}>
        Панель находится в отдельном интерфейсе. Токен выше — используй для авторизации в админке.
      </div>
    </div>
  );
}
