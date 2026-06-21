// Модалка входа / задания пароля
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { accountLabel } from '../utils/authUtils.js';

export function AuthModal({account,hasPassword,onCancel,onSubmit}){
  const[pwd,setPwd]=useState("");const[pwd2,setPwd2]=useState("");const[err,setErr]=useState("");
  const submit=()=>{
    if(!hasPassword){if(pwd.length<3){setErr("Минимум 3 символа");return;}if(pwd!==pwd2){setErr("Пароли не совпадают");return;}}
    const r=onSubmit(pwd);
    if(r&&!r.ok)setErr(r.error||"Ошибка");
  };
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}><div className="modal">
    <div className="handle"/>
    <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}><Lock size={18} color="var(--cu)"/>{accountLabel(account)}</div>
    {!hasPassword
      ?<div className="info-box" style={{fontSize:12}}>Первый вход — придумай пароль для этого аккаунта.</div>
      :<div className="info-box" style={{fontSize:12}}>Введи пароль для входа.</div>}
    <div className="field"><label>Пароль</label><input type="password" autoFocus value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&hasPassword&&submit()} placeholder="••••••"/></div>
    {!hasPassword&&<div className="field"><label>Повторите пароль</label><input type="password" value={pwd2} onChange={e=>{setPwd2(e.target.value);setErr("");}} placeholder="••••••"/></div>}
    {err&&<div style={{fontSize:13,color:"#e07a60",marginBottom:8}}>{err}</div>}
    <button className="btn btn-p" onClick={submit}><Lock size={15}/>{hasPassword?"Войти":"Задать пароль и войти"}</button>
    <button className="btn btn-g" onClick={onCancel}>Отмена</button>
  </div></div>);
}
