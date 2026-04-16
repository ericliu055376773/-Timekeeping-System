// src/components/AdminDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase';
import {
  calcSalaryFromPunches,
  fmtMoney,
  fmtHours,
} from '../hooks/useSalaryCalc';
import SalaryReport from './SalaryReport';
import LeaveManager from './LeaveManager';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

const TABS = ['薪資計算', '打卡紀錄', '請假審核', '員工管理'];

export default function AdminDashboard() {
  const [employees, setEmployees] = useState([]);
  const [allPunches, setAllPunches] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('薪資計算');
  const [editingEmp, setEditingEmp] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    payType: 'hourly',
    hourlyRate: 180,
    monthlySalary: 30000,
    overtimeEnabled: false,
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Employees
      const empSnap = await getDocs(collection(db, 'users'));
      const emps = empSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.role === 'employee');
      setEmployees(emps);

      // Punches for selected month
      const start = Timestamp.fromDate(
        startOfMonth(parseISO(selectedMonth + '-01'))
      );
      const end = Timestamp.fromDate(
        endOfMonth(parseISO(selectedMonth + '-01'))
      );
      const pSnap = await getDocs(
        query(
          collection(db, 'punches'),
          where('timestamp', '>=', start),
          where('timestamp', '<=', end),
          orderBy('timestamp', 'asc')
        )
      );
      setAllPunches(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // All leaves (for payroll deduction)
      const lSnap = await getDocs(
        query(collection(db, 'leaves'), orderBy('createdAt', 'desc'))
      );
      setAllLeaves(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Salary summaries per employee
  const salarySummaries = employees.map((emp) => {
    const punches = allPunches.filter((p) => p.uid === emp.id);
    const leaves = allLeaves.filter(
      (l) => l.uid === emp.id && l.status === 'approved'
    );
    const { totalHours, totalOvertimeHours, totalSalary } =
      calcSalaryFromPunches(punches, emp);

    // Deduct unpaid leave
    const dailyRate =
      emp.payType === 'hourly'
        ? (emp.hourlyRate || 0) * 8
        : (emp.monthlySalary || 0) / 30;
    const leaveDeduction = leaves.reduce(
      (s, l) => s + dailyRate * l.workdays * (1 - (l.payRate ?? 1)),
      0
    );

    return {
      ...emp,
      punches,
      leaves,
      totalHours,
      totalOvertimeHours,
      netSalary: Math.max(0, totalSalary - leaveDeduction),
      leaveDeduction,
      punchCount: punches.length,
    };
  });

  const totalPayroll = salarySummaries.reduce((s, e) => s + e.netSalary, 0);

  async function handleAddEmployee() {
    setAddError('');
    setAddLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        addForm.email,
        addForm.password
      );
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: addForm.name,
        email: addForm.email,
        role: addForm.role,
        payType: addForm.payType,
        hourlyRate: Number(addForm.hourlyRate),
        monthlySalary: Number(addForm.monthlySalary),
        overtimeEnabled: addForm.overtimeEnabled,
        createdAt: serverTimestamp(),
      });
      setShowAddModal(false);
      setAddForm({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        payType: 'hourly',
        hourlyRate: 180,
        monthlySalary: 30000,
        overtimeEnabled: false,
      });
      await fetchAll();
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use': 'Email 已被使用',
        'auth/weak-password': '密碼至少 6 碼',
      };
      setAddError(msgs[err.code] || err.message);
    }
    setAddLoading(false);
  }

  async function handleUpdateEmployee() {
    try {
      await updateDoc(doc(db, 'users', editForm.id), {
        name: editForm.name,
        payType: editForm.payType,
        hourlyRate: Number(editForm.hourlyRate),
        monthlySalary: Number(editForm.monthlySalary),
        overtimeEnabled: !!editForm.overtimeEnabled,
      });
      setEditingEmp(null);
      await fetchAll();
    } catch (err) {
      alert('更新失敗：' + err.message);
    }
  }

  const pendingLeaves = allLeaves.filter((l) => l.status === 'pending').length;

  return (
    <div style={{ padding: '32px 40px' }} className="fade-in">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>管理後台</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            薪資計算 · 請假審核 · 員工管理
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: 155, fontSize: 13 }}
          />
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '9px 16px',
              background: 'var(--amber)',
              color: '#000',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + 新增員工
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <KpiCard label="員工人數" value={employees.length} unit="人" />
        <KpiCard
          label="本月打卡次數"
          value={allPunches.length}
          unit="次"
          color="var(--blue)"
        />
        <KpiCard
          label="待審假單"
          value={pendingLeaves}
          unit="筆"
          color={pendingLeaves > 0 ? 'var(--red)' : 'var(--text-muted)'}
        />
        <KpiCard
          label="本月應付薪資"
          value={fmtMoney(totalPayroll)}
          color="var(--amber)"
          highlight
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          background: 'var(--bg-elevated)',
          borderRadius: 8,
          padding: 4,
          width: 'fit-content',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: activeTab === t ? 'var(--amber)' : 'transparent',
              color: activeTab === t ? '#000' : 'var(--text-secondary)',
              position: 'relative',
            }}
          >
            {t}
            {t === '請假審核' && pendingLeaves > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--red)',
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 60,
            color: 'var(--text-muted)',
            fontFamily: 'var(--mono)',
            fontSize: 12,
          }}
        >
          載入中...
        </div>
      ) : activeTab === '薪資計算' ? (
        <SalaryTab
          summaries={salarySummaries}
          allPunches={allPunches}
          allLeaves={allLeaves}
          month={selectedMonth}
        />
      ) : activeTab === '打卡紀錄' ? (
        <RecordsTab punches={allPunches} employees={employees} />
      ) : activeTab === '請假審核' ? (
        <div>
          <LeaveManager isAdmin={true} />
        </div>
      ) : (
        <EmployeesTab
          employees={employees}
          editingEmp={editingEmp}
          editForm={editForm}
          onEdit={(emp) => {
            setEditingEmp(emp.id);
            setEditForm({ ...emp });
          }}
          onEditChange={(k, v) => setEditForm((f) => ({ ...f, [k]: v }))}
          onSave={handleUpdateEmployee}
          onCancel={() => setEditingEmp(null)}
        />
      )}

      {/* Add employee modal */}
      {showAddModal && (
        <Modal
          title="新增員工帳號"
          onClose={() => {
            setShowAddModal(false);
            setAddError('');
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['姓名', 'name', 'text'],
              ['Email', 'email', 'email'],
              ['密碼', 'password', 'password'],
            ].map(([lbl, key, type]) => (
              <label key={key} style={labelStyle}>
                <span>{lbl}</span>
                <input
                  type={type}
                  value={addForm[key]}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label style={labelStyle}>
              <span>角色</span>
              <select
                value={addForm.role}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, role: e.target.value }))
                }
              >
                <option value="employee">員工</option>
                <option value="admin">管理員</option>
              </select>
            </label>
            <label style={labelStyle}>
              <span>薪資類型</span>
              <select
                value={addForm.payType}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, payType: e.target.value }))
                }
              >
                <option value="hourly">時薪制</option>
                <option value="monthly">月薪制</option>
              </select>
            </label>
            {addForm.payType === 'hourly' ? (
              <label style={labelStyle}>
                <span>時薪（元）</span>
                <input
                  type="number"
                  value={addForm.hourlyRate}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, hourlyRate: e.target.value }))
                  }
                />
              </label>
            ) : (
              <label style={labelStyle}>
                <span>月薪（元）</span>
                <input
                  type="number"
                  value={addForm.monthlySalary}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, monthlySalary: e.target.value }))
                  }
                />
              </label>
            )}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={addForm.overtimeEnabled}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    overtimeEnabled: e.target.checked,
                  }))
                }
                style={{ width: 'auto' }}
              />
              <span style={{ fontSize: 13 }}>
                啟用加班費計算（勞基法：前2h×1.34，之後×1.67）
              </span>
            </label>
            {addError && (
              <div
                style={{
                  background: 'var(--red-glow)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  padding: '10px 14px',
                  borderRadius: 6,
                  color: 'var(--red)',
                  fontSize: 13,
                }}
              >
                {addError}
              </div>
            )}
            <button
              onClick={handleAddEmployee}
              disabled={addLoading}
              style={{
                padding: 12,
                background: 'var(--amber)',
                color: '#000',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {addLoading ? '建立中...' : '建立帳號'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SalaryTab({ summaries, allPunches, allLeaves, month }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>員工</th>
            <th>薪資類型</th>
            <th>費率</th>
            <th>工時</th>
            <th>加班</th>
            <th>請假扣薪</th>
            <th>實發薪資</th>
            <th>薪資單</th>
          </tr>
        </thead>
        <tbody>
          {summaries.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  padding: 40,
                }}
              >
                尚無員工資料
              </td>
            </tr>
          ) : (
            summaries.map((emp) => (
              <tr key={emp.id}>
                <td style={{ fontWeight: 500 }}>{emp.name}</td>
                <td>
                  <span
                    className={`badge ${
                      emp.payType === 'hourly' ? 'badge-amber' : 'badge-muted'
                    }`}
                  >
                    {emp.payType === 'hourly' ? '時薪制' : '月薪制'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {emp.payType === 'hourly'
                    ? `$${emp.hourlyRate}/hr`
                    : `$${(emp.monthlySalary || 0).toLocaleString()}/mo`}
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {emp.totalHours > 0 ? (
                    fmtHours(emp.totalHours)
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>0h</span>
                  )}
                </td>
                <td
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color:
                      emp.totalOvertimeHours > 0
                        ? 'var(--amber)'
                        : 'var(--text-muted)',
                  }}
                >
                  {emp.totalOvertimeHours > 0
                    ? fmtHours(emp.totalOvertimeHours)
                    : '--'}
                </td>
                <td
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color:
                      emp.leaveDeduction > 0
                        ? 'var(--red)'
                        : 'var(--text-muted)',
                  }}
                >
                  {emp.leaveDeduction > 0
                    ? `-${fmtMoney(emp.leaveDeduction)}`
                    : '--'}
                </td>
                <td
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      emp.netSalary > 0 ? 'var(--amber)' : 'var(--text-muted)',
                  }}
                >
                  {fmtMoney(emp.netSalary)}
                </td>
                <td>
                  <SalaryReport
                    employee={emp}
                    punches={emp.punches}
                    leaves={emp.leaves}
                    month={month}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RecordsTab({ punches, employees }) {
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>員工</th>
            <th>類型</th>
            <th>時間</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {[...punches]
            .sort((a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis())
            .map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>
                  {empMap[p.uid] || p.userName}
                </td>
                <td>
                  <span
                    className={`badge ${
                      p.type === 'in' ? 'badge-green' : 'badge-red'
                    }`}
                  >
                    {p.type === 'in' ? '▶ 上班' : '⏹ 下班'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {p.timestamp?.toDate()
                    ? format(p.timestamp.toDate(), 'MM/dd HH:mm:ss')
                    : '--'}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {p.note || '--'}
                </td>
              </tr>
            ))}
          {punches.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  padding: 40,
                }}
              >
                本月無打卡紀錄
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmployeesTab({
  employees,
  editingEmp,
  editForm,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {employees.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-muted)',
          }}
        >
          尚無員工
        </div>
      )}
      {employees.map((emp) => (
        <div key={emp.id} className="card" style={{ padding: '16px 20px' }}>
          {editingEmp === emp.id ? (
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <label style={{ ...labelStyle, flex: '1 1 150px' }}>
                <span>姓名</span>
                <input
                  value={editForm.name || ''}
                  onChange={(e) => onEditChange('name', e.target.value)}
                />
              </label>
              <label style={{ ...labelStyle, flex: '1 1 110px' }}>
                <span>薪資類型</span>
                <select
                  value={editForm.payType || 'hourly'}
                  onChange={(e) => onEditChange('payType', e.target.value)}
                >
                  <option value="hourly">時薪制</option>
                  <option value="monthly">月薪制</option>
                </select>
              </label>
              {editForm.payType === 'hourly' ? (
                <label style={{ ...labelStyle, flex: '1 1 110px' }}>
                  <span>時薪</span>
                  <input
                    type="number"
                    value={editForm.hourlyRate || 0}
                    onChange={(e) => onEditChange('hourlyRate', e.target.value)}
                  />
                </label>
              ) : (
                <label style={{ ...labelStyle, flex: '1 1 130px' }}>
                  <span>月薪</span>
                  <input
                    type="number"
                    value={editForm.monthlySalary || 0}
                    onChange={(e) =>
                      onEditChange('monthlySalary', e.target.value)
                    }
                  />
                </label>
              )}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  paddingBottom: 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!editForm.overtimeEnabled}
                  onChange={(e) =>
                    onEditChange('overtimeEnabled', e.target.checked)
                  }
                  style={{ width: 'auto' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  啟用加班費
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={onSave}
                  style={{
                    padding: '9px 16px',
                    background: 'var(--green)',
                    color: '#000',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  儲存
                </button>
                <button
                  onClick={onCancel}
                  style={{
                    padding: '9px 16px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'var(--amber-glow)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 16,
                    color: 'var(--amber)',
                  }}
                >
                  {emp.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {emp.name}
                    {emp.overtimeEnabled && (
                      <span
                        className="badge badge-amber"
                        style={{ fontSize: 10 }}
                      >
                        加班費
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--mono)',
                      marginTop: 2,
                    }}
                  >
                    {emp.email}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      color: 'var(--amber)',
                    }}
                  >
                    {emp.payType === 'hourly'
                      ? `$${emp.hourlyRate}/hr`
                      : `$${(emp.monthlySalary || 0).toLocaleString()}/mo`}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {emp.payType === 'hourly' ? '時薪制' : '月薪制'}
                  </div>
                </div>
                <button
                  onClick={() => onEdit(emp)}
                  style={{
                    padding: '7px 14px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  編輯
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, unit, color, highlight }) {
  return (
    <div
      className="card"
      style={
        highlight
          ? {
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,0.25)',
            }
          : {}
      }
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 24,
            fontWeight: 600,
            color: color || 'var(--text-primary)',
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card fade-in"
        style={{
          width: '100%',
          maxWidth: 440,
          margin: 20,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              padding: '4px 9px',
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.07em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
};
