'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'notices',  label: 'Notices' },
  { id: 'pyq',      label: 'Past Papers' },
];

function StatCard({ label, value, sub }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statVal}>{value ?? '—'}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

export default function AdminPanel() {
  const [tab,     setTab]     = useState('overview');
  const [stats,   setStats]   = useState(null);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Redirect if no password stored
    if (typeof window !== 'undefined' && !sessionStorage.getItem('admin_password')) {
      window.location.href = '/admin';
      return;
    }

    const pw = sessionStorage.getItem('admin_password') || '';
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-password': pw,
    };

    // Fetch notices data
    Promise.all([
      fetch(`${API}/api/notices?limit=50`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/notices/alerts`,   { headers }).then(r => r.json()).catch(() => ({})),
    ]).then(([all, alerts]) => {
      setNotices(all.notices || []);
      setStats({
        totalNotices: all.total || (all.notices?.length ?? 0),
        alertCount:   alerts.notices?.length ?? 0,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const logout = () => {
    sessionStorage.removeItem('admin_password');
    window.location.href = '/admin';
  };

  return (
    <div className={styles.layout}>

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.brand}>RGPVMate</Link>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`${styles.navItem} ${tab === item.id ? styles.navItemActive : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <hr className={styles.divider} />
          <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <h1 className={styles.pageTitle}>
            {tab === 'overview' ? 'Overview' : tab === 'notices' ? 'Notices' : 'Past Papers'}
          </h1>
        </header>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingState}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: 'spin 0.7s linear infinite', color: 'var(--text-4)' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Loading…
            </div>
          ) : tab === 'overview' ? (
            <>
              <div className={styles.statsGrid}>
                <StatCard label="Total Notices" value={stats?.totalNotices} />
                <StatCard label="Active Alerts"  value={stats?.alertCount} sub="HIGH + MEDIUM priority" />
                <StatCard label="Past Papers"    value="3,000+" sub="across all branches" />
                <StatCard label="Branches"       value="10+"    sub="all semesters" />
              </div>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Recent Notices</h2>
                  <button className={styles.sectionLink} onClick={() => setTab('notices')}>
                    View all
                  </button>
                </div>
                <div className={styles.noticeTable}>
                  {notices.slice(0, 5).map((n, i) => (
                    <div key={i} className={styles.noticeRow}>
                      <span className={styles.noticeTitle}>{n.title}</span>
                      <span className={styles.noticeDate}>
                        {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-IN') : '—'}
                      </span>
                      <span className={`${styles.noticePriority} ${styles[`priority${n.priority}`]}`}>
                        {n.priority || 'LOW'}
                      </span>
                    </div>
                  ))}
                  {notices.length === 0 && (
                    <p className={styles.emptyState}>No notices found. Make sure the backend is running on port 3000.</p>
                  )}
                </div>
              </section>
            </>
          ) : tab === 'notices' ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>All Notices</h2>
                <span className={styles.count}>{notices.length} items</span>
              </div>
              <div className={styles.noticeTable}>
                {notices.map((n, i) => (
                  <div key={i} className={styles.noticeRow}>
                    <span className={styles.noticeTitle}>{n.title}</span>
                    <span className={styles.noticeDate}>
                      {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-IN') : '—'}
                    </span>
                    <span className={`${styles.noticePriority} ${styles[`priority${n.priority}`]}`}>
                      {n.priority || 'LOW'}
                    </span>
                  </div>
                ))}
                {notices.length === 0 && (
                  <p className={styles.emptyState}>No notices in database.</p>
                )}
              </div>
            </section>
          ) : (
            <div className={styles.emptyState}>
              Past paper management coming soon.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
