'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!password) { setError('Password is required.'); return; }
    setLoading(true);
    try {
      // Backend uses x-admin-password header — verify by hitting a protected route
      const res = await fetch(`${API}/api/admin/documents`, {
        method: 'GET',
        headers: {
          'x-admin-password': password,
        },
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid admin password');
      }
      if (!res.ok && res.status !== 200) {
        // Any non-403 response means the password was accepted (route may return empty)
        // but we still allow through if it's a 5xx or data issue
        const data = await res.json().catch(() => ({}));
        if (data.error && res.status === 403) throw new Error(data.error);
      }

      // Password accepted — store it and redirect
      sessionStorage.setItem('admin_password', password);
      window.location.href = '/admin/panel';
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        setError('Cannot connect to backend. Make sure the server is running on port 3000.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Link href="/" className={styles.backLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            RGPVMate
          </Link>
          <div className={styles.badge}>Admin</div>
        </div>

        <div className={styles.cardBody}>
          <h1 className={styles.heading}>Admin access</h1>
          <p className={styles.sub}>Enter your admin password to access the panel.</p>

          {error && (
            <div className={styles.errorBanner}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.formGroup}>
              <label className={styles.label}>Admin password</label>
              <input
                type="password"
                className={styles.input}
                placeholder="Enter admin password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                autoFocus
              />
              <span className={styles.hint}>
                Set via <code className={styles.code}>ADMIN_PASSWORD</code> in backend <code className={styles.code}>.env</code>
              </span>
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ animation: 'spin 0.7s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                : null
              }
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
