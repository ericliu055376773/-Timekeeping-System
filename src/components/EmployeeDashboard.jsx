// src/components/EmployeeDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  calcSalaryFromPunches,
  fmtMoney,
  fmtHours,
} from '../hooks/useSalaryCalc';
import LeaveManager from './LeaveManager';
import { format, startOfMonth, endOfMonth, parseISO, isToday } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const TABS = ['打卡', '請假'];

export default function EmployeeDashboard() {
  const { user, profile } = useAuth();
  const [now, setNow] = useState(new Date());
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [punchLoading, setPunchLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [note, setNote] = useState('');
  const [activeTab, setActiveTab] = useState('打卡');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchPunches = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = Timestamp.fromDate(
        startOfMonth(parseISO(selectedMonth + '-01'))
      );
      const end = Timestamp.fromDate(
        endOfMonth(parseISO(selectedMonth + '-01'))
      );
      const q = query(
        collection(db, 'punches'),
        where('uid', '==', user.uid),
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'asc')
      );
      const snap = await getDocs(q);
      setPunches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [user, selectedMonth]);

  useEffect(() => {
    fetchPunches();
  }, [fetchPunches]);

  const todayPunches = punches.filter((p) =>
    isToday(p.timestamp?.toDate?.() || new Date(0))
  );
  const lastPunch = todayPunches[todayPunches.length - 1];
  const isClockedIn = lastPunch?.type === 'in';

  async function handlePunch() {
    if (!user || punchLoading) return;
    setPunchLoading(true);
    try {
      await addDoc(collection(db, 'punches'), {
        uid: user.uid,
        userName: profile?.name || '',
        type: isClockedIn ? 'out' : 'in',
        timestamp: serverTimestamp(),
        date: format(now, 'yyyy-MM-dd'),
        note: note.trim(),
      });
      setNote('');
      await fetchPunches();
    } catch (err) {
      alert('打卡失敗：' + err.message);
    }
    setPunchLoading(false);
  }

  const { dailyRecords, totalHours, totalOvertimeHours, totalSalary } =
    calcSalaryFromPunches(punches, profile);

  return (
    <div
      style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}
      className="fade-in"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>員工介面</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            歡迎回來，<strong>{profile?.name}</strong>
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            padding: 4,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: '7px 20px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: activeTab === t ? 'var(--amber)' : 'transparent',
                color: activeTab === t ? '#000' : 'var(--text-secondary)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {activeTab === '打卡' ? (
        <div
          style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}
        >
          {/* Left: Clock + Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              className="card"
              style={{ textAlign: 'center', padding: '28px 20px' }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 44,
                  fontWeight: 300,
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {format(now, 'HH:mm:ss')}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                }}
              >
                {format(now, 'yyyy年MM月dd日 EEEE', { locale: zhTW })}
              </div>
              <div
                style={{
                  margin: '18px 0 20px',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {isClockedIn ? (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--green)',
                        animation: 'pulse-ring 2s infinite',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--green)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      上班中 · {format(lastPunch.timestamp.toDate(), 'HH:mm')}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--text-muted)',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      尚未打卡
                    </span>
                  </div>
                )}
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="備註（選填）"
                style={{ marginBottom: 12, fontSize: 13 }}
              />
              <button
                onClick={handlePunch}
                disabled={punchLoading}
                style={{
                  width: '100%',
                  padding: 13,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  background: isClockedIn ? 'var(--red-glow)' : 'var(--amber)',
                  color: isClockedIn ? 'var(--red)' : '#000',
                  border: isClockedIn
                    ? '1px solid rgba(239,68,68,0.4)'
                    : 'none',
                }}
              >
                {punchLoading
                  ? '處理中...'
                  : isClockedIn
                  ? '⏹ 下班打卡'
                  : '▶ 上班打卡'}
              </button>
            </div>

            <div className="card">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 14,
                }}
              >
                本月統計
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 11 }}
              >
                <StatRow label="工作時數" value={fmtHours(totalHours)} />
                {totalOvertimeHours > 0 && (
                  <StatRow
                    label="加班時數"
                    value={fmtHours(totalOvertimeHours)}
                    color="var(--amber)"
                  />
                )}
                <StatRow
                  label="薪資類型"
                  value={
                    profile?.payType === 'hourly'
                      ? `時薪 $${profile?.hourlyRate}`
                      : '月薪制'
                  }
                />
                <StatRow
                  label="預估薪資"
                  value={fmtMoney(totalSalary)}
                  highlight
                />
              </div>
            </div>
          </div>

          {/* Right: Records table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>打卡紀錄</h2>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: 160, fontSize: 13 }}
              />
            </div>

            {loading ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                }}
              >
                載入中...
              </div>
            ) : dailyRecords.length === 0 ? (
              <div
                className="card"
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                <div style={{ fontSize: 13 }}>本月尚無打卡紀錄</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>上班</th>
                      <th>下班</th>
                      <th>工時</th>
                      <th>加班</th>
                      <th>薪資</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRecords.map((r) => (
                      <tr key={r.date}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {r.date}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--mono)',
                            color: 'var(--green)',
                            fontSize: 12,
                          }}
                        >
                          {r.inTime || '--'}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--mono)',
                            color: 'var(--red)',
                            fontSize: 12,
                          }}
                        >
                          {r.outTime || '--'}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {r.hours > 0 ? fmtHours(r.hours) : '--'}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color:
                              r.overtimeHours > 0
                                ? 'var(--amber)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {r.overtimeHours > 0
                            ? fmtHours(r.overtimeHours)
                            : '--'}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--mono)',
                            color: 'var(--amber)',
                            fontSize: 12,
                          }}
                        >
                          {r.salary > 0 ? fmtMoney(r.salary) : '--'}
                        </td>
                        <td>
                          {r.outTime ? (
                            <span className="badge badge-green">完成</span>
                          ) : r.inTime ? (
                            <span
                              className="badge badge-amber"
                              style={{ animation: 'blink 2s infinite' }}
                            >
                              上班中
                            </span>
                          ) : (
                            <span className="badge badge-muted">缺勤</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dailyRecords.length > 0 && (
              <div
                className="card"
                style={{
                  background: 'var(--amber-glow)',
                  border: '1px solid rgba(245,158,11,0.25)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: 'var(--amber)',
                        marginBottom: 4,
                      }}
                    >
                      {selectedMonth} 薪資估計
                    </div>
                    <div
                      style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                      {fmtHours(totalHours)}
                      {totalOvertimeHours > 0
                        ? ` · 含加班 ${fmtHours(totalOvertimeHours)}`
                        : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 26,
                      fontWeight: 600,
                      color: 'var(--amber)',
                    }}
                  >
                    {fmtMoney(totalSalary)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <LeaveManager isAdmin={false} />
      )}
    </div>
  );
}

function StatRow({ label, value, highlight, color }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 600,
          color: color || (highlight ? 'var(--amber)' : 'var(--text-primary)'),
        }}
      >
        {value}
      </span>
    </div>
  );
}
