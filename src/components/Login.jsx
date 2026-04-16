// src/components/Login.jsx
import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', payType: 'hourly', hourlyRate: 180, monthlySalary: 30000 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          name: form.name,
          email: form.email,
          role: form.role,
          payType: form.payType,
          hourlyRate: Number(form.hourlyRate),
          monthlySalary: Number(form.monthlySalary),
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      const msgs = {
        'auth/user-not-found': '查無此帳號',
        'auth/wrong-password': '密碼錯誤',
        'auth/email-already-in-use': '此 Email 已被使用',
        'auth/weak-password': '密碼至少需要 6 個字元',
        'auth/invalid-email': 'Email 格式錯誤',
        'auth/invalid-credential': '帳號或密碼錯誤',
      };
      setError(msgs[err.code] || err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(59,130,246,0.04) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, background: 'var(--amber-glow)',
            border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
            TIMECLOCK
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginTop: 4 }}>
            打卡薪資管理系統
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Mode toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-elevated)', borderRadius: 8, padding: 4 }}>
              {['login', 'register'].map(m => (
                <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
                  style={{
                    padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 500,
                    background: mode === m ? 'var(--amber)' : 'transparent',
                    color: mode === m ? '#000' : 'var(--text-muted)',
                  }}>
                  {m === 'login' ? '登入' : '註冊'}
                </button>
              ))}
            </div>

            {mode === 'register' && (
              <>
                <label style={labelStyle}>
                  <span>姓名</span>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="輸入姓名" required />
                </label>
                <label style={labelStyle}>
                  <span>角色</span>
                  <select value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="employee">員工</option>
                    <option value="admin">管理員</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>薪資類型</span>
                  <select value={form.payType} onChange={e => set('payType', e.target.value)}>
                    <option value="hourly">時薪制</option>
                    <option value="monthly">月薪制</option>
                  </select>
                </label>
                {form.payType === 'hourly' ? (
                  <label style={labelStyle}>
                    <span>時薪（元）</span>
                    <input type="number" value={form.hourlyRate} onChange={e => set('hourlyRate', e.target.value)} min={0} />
                  </label>
                ) : (
                  <label style={labelStyle}>
                    <span>月薪（元）</span>
                    <input type="number" value={form.monthlySalary} onChange={e => set('monthlySalary', e.target.value)} min={0} />
                  </label>
                )}
              </>
            )}

            <label style={labelStyle}>
              <span>Email</span>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" required />
            </label>
            <label style={labelStyle}>
              <span>密碼</span>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" required />
            </label>

            {error && (
              <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: 'var(--red)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: 'var(--amber)', color: '#000', letterSpacing: '0.05em',
              marginTop: 4,
            }}>
              {loading ? '處理中...' : mode === 'login' ? '登入系統' : '建立帳號'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
};
