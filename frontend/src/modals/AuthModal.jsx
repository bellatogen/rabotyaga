// Модалка входа / задания пароля
import { useState } from 'react';
import { Lock, Loader } from 'lucide-react';
import { accountLabel } from '../utils/authUtils.js';

export function AuthModal({account,hasPassword,onCancel,onSubmit}){
  const[pwd,setPwd]=useState("");
  const[pwd2,setPwd2]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);

  const submit=async()=>{
    setErr("");
    if(!hasPassword){
      // первый вход — задаём пароль
      if(pwd.length<3){setErr("Минимум 3 символа");return;}
      if(pwd!==pwd2){setErr("Пароли не совпадают");return;}
    } else {
      if(!pwd){setErr("Введи пароль");return;}
    }
    setLoading(true);
    try {
      const r = await onSubmit(pwd);
      if(r && !r.ok) setErr(r.error || "Ошибка");
    } catch(e) {
      setErr(e?.message || "Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&!loading&&onCancel()}>
      <div className="modal">
        <div className="handle"/>
        <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <Lock size={18} color="var(--cu)"/>{accountLabel(account)}
        </div>

        {!hasPassword
          ? <div className="info-box" style={{fontSize:12,lineHeight:1.6}}>
              <b>Первый вход.</b> Придумай любой пароль — минимум 3 символа, без ограничений по символам.<br/>
              Запомни его: сбросить может только управляющий.<br/>
              <span style={{opacity:.7}}>Если iOS предлагает свой пароль — можно проигнорировать и ввести свой.</span>
            </div>
          : <div className="info-box" style={{fontSize:12,lineHeight:1.6}}>
              Введи свой пароль.<br/>
              <span style={{opacity:.7}}>Забыл? Обратись к управляющему — он сбросит, зайдёшь заново.</span>
            </div>
        }

        <div className="field">
          <label>Пароль</label>
          <input
            type="password"
            autoFocus
            autoComplete={hasPassword ? "current-password" : "new-password"}
            value={pwd}
            disabled={loading}
            onChange={e=>{setPwd(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&(hasPassword?submit():null)}
            placeholder="••••••"
          />
        </div>

        {!hasPassword&&(
          <div className="field">
            <label>Повторите пароль</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pwd2}
              disabled={loading}
              onChange={e=>{setPwd2(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              placeholder="••••••"
            />
          </div>
        )}

        {err&&<div style={{fontSize:13,color:"#e07a60",marginBottom:8,padding:"6px 10px",background:"rgba(232,80,53,.1)",borderRadius:6}}>{err}</div>}

        <button className="btn btn-p" onClick={submit} disabled={loading} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {loading
            ? <><Loader size={15} style={{animation:"spin 1s linear infinite"}}/> Проверка…</>
            : <><Lock size={15}/>{hasPassword?"Войти":"Задать пароль и войти"}</>
          }
        </button>
        <button className="btn btn-g" onClick={onCancel} disabled={loading}>Отмена</button>
      </div>
    </div>
  );
}
