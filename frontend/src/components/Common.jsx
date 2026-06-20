export function Modal({ isOpen, title, children, onClose, actions }) {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: '12px', padding: '20px', maxWidth: '500px', width: '90%',
        maxHeight: '80vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--mt)'
          }}>×</button>
        </div>
        <div style={{ marginBottom: '16px' }}>
          {children}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function Alert({ type = 'info', icon = 'ℹ️', children }) {
  const colors = {
    info: 'rgba(201,125,60,.3)',
    warning: 'rgba(232,160,48,.4)',
    danger: 'rgba(158,63,43,.5)',
    success: 'rgba(78,112,64,.4)'
  };
  return (
    <div style={{
      background: colors[type], border: `1px solid ${colors[type]}`, borderRadius: '10px',
      padding: '12px 14px', marginBottom: '12px', display: 'flex', gap: '9px',
      alignItems: 'flex-start', fontSize: '13px', lineHeight: '1.5'
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function Button({ children, onClick, disabled = false, variant = 'primary', ...props }) {
  const styles = {
    primary: {
      background: 'var(--pp)', color: '#fff', border: 'none',
      padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500
    },
    secondary: {
      background: 'var(--sf)', color: 'var(--pp)', border: '1px solid var(--bd)',
      padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500
    },
    danger: {
      background: '#e07a60', color: '#fff', border: 'none',
      padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500
    }
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles[variant], opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      {...props}
    >
      {children}
    </button>
  );
}
