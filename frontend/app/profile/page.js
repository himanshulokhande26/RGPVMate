'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import CustomSelect from '../../components/CustomSelect';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const PROGRAM_BRANCHES = {
  'B.Tech': [
    'Computer Science Engineering',
    'Information Technology',
    'Electronics and Communication Engineering',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'AI and Machine Learning',
    'AI and Data Science',
    'Cyber Security',
    'CSE IoT'
  ],
  'B.Pharm': ['Pharmacy'],
  'Diploma': [
    'Computer Science Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Electrical Engineering'
  ],
  'MCA': ['Computer Applications'],
  'MBA': ['Business Administration'],
  'M.Tech': [
    'Computer Science Engineering',
    'Structural Engineering',
    'Power Systems'
  ]
};

const PROGRAMS = Object.keys(PROGRAM_BRANCHES);
const SEMESTERS = ['1','2','3','4','5','6','7','8'];

export default function ProfilePage() {
  const [user,       setUser]       = useState(null);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState('');
  const [saveError,  setSaveError]  = useState('');

  // Profile form
  const [name,     setName]     = useState('');
  const [program,  setProgram]  = useState('B.Tech');
  const [branch,   setBranch]   = useState('Computer Science Engineering');
  const [semester, setSemester] = useState('5');
  const [photoUrl, setPhotoUrl] = useState('');

  // Password form
  const [oldPass,    setOldPass]    = useState('');
  const [newPass,    setNewPass]    = useState('');
  const [confPass,   setConfPass]   = useState('');
  const [passMsg,    setPassMsg]    = useState('');
  const [passError,  setPassError]  = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfPass, setShowConfPass] = useState(false);

  const fileRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('rgpv_token');
    if (!token) { window.location.href = '/auth'; return; }

    fetch(`${API}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUser(d.user);
          setName(d.user.name || '');
          setProgram(d.user.program || 'B.Tech');
          setBranch(d.user.branch || 'Computer Science Engineering');
          setSemester(String(d.user.semester || '5'));
          setPhotoUrl(d.user.photoUrl || '');
        }
        if (d.stats) {
          setStats(d.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Save profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setSaveError('Name is required'); return; }
    setSaving(true); setSaveMsg(''); setSaveError('');
    try {
      const token = localStorage.getItem('rgpv_token');
      const res   = await fetch(`${API}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, program, branch, semester: Number(semester), photoUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Save failed'); return; }
      setUser(data.user);
      localStorage.setItem('rgpv_user', JSON.stringify(data.user));
      setSaveMsg('Profile saved ✓');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSaveError('Cannot reach server');
    } finally {
      setSaving(false);
    }
  };

  // Save password
  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) { setPassError('New password must be at least 6 characters'); return; }
    if (newPass !== confPass) { setPassError('Passwords do not match'); return; }
    setSavingPass(true); setPassMsg(''); setPassError('');
    try {
      const token = localStorage.getItem('rgpv_token');
      const res   = await fetch(`${API}/api/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) { setPassError(data.error || 'Failed'); return; }
      setPassMsg('Password changed successfully ✓');
      setOldPass(''); setNewPass(''); setConfPass('');
      setTimeout(() => setPassMsg(''), 4000);
    } catch {
      setPassError('Cannot reach server');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('rgpv_token');
    localStorage.removeItem('rgpv_user');
    window.location.href = '/auth';
  };

  const initials = (name || user?.name || '?').charAt(0).toUpperCase();
  const displayPhoto = photoUrl || user?.photoUrl || user?.picture;

  if (loading) {
    return (
      <div className={styles.loadWrap}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ animation: 'spin 0.8s linear infinite', opacity: 0.5 }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── Topbar ── */}
      <header className={styles.topbar}>
        <Link href="/chat" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to chat
        </Link>
        <span className={styles.topTitle}>Profile</span>
        <div />
      </header>

      <div className={styles.body}>

        {/* ── Left: Avatar card ── */}
        <aside className={styles.avatarCard}>
          <div className={styles.avatarWrap}>
            {displayPhoto
              ? <img src={displayPhoto} alt={name} className={styles.avatarImg} />
              : <span className={styles.avatarInitials}>{initials}</span>
            }
            <button className={styles.avatarEditBtn} onClick={() => fileRef.current?.click()} title="Change photo">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = ev => setPhotoUrl(ev.target.result);
                reader.readAsDataURL(f);
              }}
            />
          </div>
          <p className={styles.avatarName}>{name || user?.name}</p>
          <span className={styles.avatarBadge}>{program} • Sem {semester}</span>
          {user?.isOAuth && (
            <span className={styles.oauthTag}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              Google account
            </span>
          )}
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </aside>

        {/* ── Right: Edit panels ── */}
        <div className={styles.panels}>

          {/* Personal Info */}
          <form className={styles.panel} onSubmit={handleSaveProfile}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Personal Info</h2>
              <p className={styles.panelDesc}>Update your name and profile photo.</p>
            </div>
            <div className={styles.panelBody}>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Full name</label>
                <input type="text" className={styles.fieldInput} value={name}
                  onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email</label>
                <input type="email" className={`${styles.fieldInput} ${styles.fieldInputReadonly}`}
                  value={user?.email || ''} readOnly />
                <span className={styles.fieldHint}>Email cannot be changed.</span>
              </div>
            </div>

            <hr className={styles.panelDivider} />

            {/* Academic Context */}
            <div className={styles.panelHeader} style={{ marginTop: '1.5rem' }}>
              <h2 className={styles.panelTitle}>Academic Context</h2>
              <p className={styles.panelDesc}>
                Responses are <strong>strictly tailored</strong> to your program, branch, and semester.
              </p>
            </div>
            <div className={styles.panelBody}>

              {/* Program */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Program</label>
                <CustomSelect 
                  value={program} 
                  onChange={(v) => { setProgram(v); setBranch(PROGRAM_BRANCHES[v][0]); }} 
                  options={PROGRAMS} 
                />
              </div>

              {/* Branch */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Branch</label>
                <CustomSelect 
                  value={branch} 
                  onChange={setBranch} 
                  options={PROGRAM_BRANCHES[program] || [branch]} 
                />
              </div>

              {/* Semester */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Semester</label>
                <CustomSelect 
                  value={semester} 
                  onChange={setSemester} 
                  options={SEMESTERS} 
                  renderLabel={(v) => `Semester ${v}`} 
                />
              </div>

            </div>

            <div className={styles.panelFooter}>
              {saveMsg   && <span className={styles.successMsg}>{saveMsg}</span>}
              {saveError && <span className={styles.errorMsg}>{saveError}</span>}
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>

          {/* Usage Stats */}
          {stats && (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>My Usage</h2>
                <p className={styles.panelDesc}>Your activity and AI interactions.</p>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Total Messages Sent</label>
                  <p className={styles.statCount}>{stats.totalMessages}</p>
                </div>
              </div>
            </div>
          )}

          {/* Change Password (Only for non-OAuth users) */}
          {!user?.isOAuth && (
            <form className={styles.panel} onSubmit={handleSavePassword}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Security</h2>
                <p className={styles.panelDesc}>Update your password.</p>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Current password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showOldPass ? 'text' : 'password'} className={styles.fieldInput} value={oldPass}
                      onChange={e => setOldPass(e.target.value)} placeholder="Your current password" autoComplete="current-password"
                      style={{ paddingRight: '44px' }} />
                    <button type="button" onClick={() => setShowOldPass(s => !s)} tabIndex={-1}
                      style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}>
                      <EyeIcon open={showOldPass} />
                    </button>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>New password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showNewPass ? 'text' : 'password'} className={styles.fieldInput} value={newPass}
                      onChange={e => setNewPass(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password"
                      style={{ paddingRight: '44px' }} />
                    <button type="button" onClick={() => setShowNewPass(s => !s)} tabIndex={-1}
                      style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}>
                      <EyeIcon open={showNewPass} />
                    </button>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Confirm new password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showConfPass ? 'text' : 'password'} className={styles.fieldInput} value={confPass}
                      onChange={e => setConfPass(e.target.value)} placeholder="Repeat new password" autoComplete="new-password"
                      style={{ paddingRight: '44px' }} />
                    <button type="button" onClick={() => setShowConfPass(s => !s)} tabIndex={-1}
                      style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}>
                      <EyeIcon open={showConfPass} />
                    </button>
                  </div>
                </div>
              </div>
              <div className={styles.panelFooter}>
                {passMsg   && <span className={styles.successMsg}>{passMsg}</span>}
                {passError && <span className={styles.errorMsg}>{passError}</span>}
                <button type="submit" className={styles.saveBtn} disabled={savingPass}>
                  {savingPass ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}

          {/* Account meta */}
          <div className={styles.metaPanel}>
            <span className={styles.metaItem}>
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}

function EyeIcon({ open }) {
  return open
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>;
}
