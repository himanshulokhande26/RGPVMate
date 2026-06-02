'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents & Upload' },
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
  const [documents, setDocuments] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadData, setUploadData] = useState({
    file: null,
    documentType: 'syllabus',
    semester: '',
    branch: '',
    scheme: ''
  });

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

    // Fetch notices and stats data
    Promise.all([
      fetch(`${API}/api/admin/stats`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/admin/documents`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/notices?limit=50`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/notices/alerts`,   { headers }).then(r => r.json()).catch(() => ({})),
    ]).then(([sysStats, docsData, all, alerts]) => {
      setNotices(all.notices || []);
      setDocuments(docsData.documents || []);
      setStats({
        users: sysStats.users ?? 0,
        threads: sysStats.threads ?? 0,
        messages: sysStats.messages ?? 0,
        documents: sysStats.documents ?? 0,
        chunks: sysStats.chunks ?? 0,
        totalNotices: all.total || (all.notices?.length ?? 0),
        alertCount:   alerts.notices?.length ?? 0,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) return alert('Please select a PDF file');
    
    setUploading(true);
    const pw = sessionStorage.getItem('admin_password') || '';
    const formData = new FormData();
    formData.append('pdf', uploadData.file);
    formData.append('documentType', uploadData.documentType);
    if (uploadData.semester) formData.append('semester', uploadData.semester);
    if (uploadData.branch) formData.append('branch', uploadData.branch);
    if (uploadData.scheme) formData.append('scheme', uploadData.scheme);

    try {
      const res = await fetch(`${API}/api/admin/documents/upload`, {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      alert(`Success! Ingested ${data.chunks} chunks.`);
      setUploadData({ ...uploadData, file: null });
      // Refresh documents
      const docsRes = await fetch(`${API}/api/admin/documents`, {
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }
      });
      const docsData = await docsRes.json();
      setDocuments(docsData.documents || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (sourceName) => {
    if (!confirm(`Are you sure you want to delete all chunks for ${sourceName}?`)) return;
    const pw = sessionStorage.getItem('admin_password') || '';
    try {
      const res = await fetch(`${API}/api/admin/documents/${sourceName}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': pw },
      });
      if (!res.ok) throw new Error('Delete failed');
      setDocuments(documents.filter(d => d.source !== sourceName));
    } catch (err) {
      alert(err.message);
    }
  };

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
            {tab === 'overview' ? 'Overview' : tab === 'documents' ? 'Documents & Upload' : tab === 'notices' ? 'Notices' : 'Past Papers'}
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
                <StatCard label="Total Users" value={stats?.users} />
                <StatCard label="Total Threads" value={stats?.threads} />
                <StatCard label="Messages Sent" value={stats?.messages} />
                <StatCard label="Vector Documents" value={stats?.documents} sub={`${stats?.chunks} total chunks`} />
                <StatCard label="Total Notices" value={stats?.totalNotices} />
                <StatCard label="Active Alerts" value={stats?.alertCount} sub="HIGH + MEDIUM priority" />
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
          ) : tab === 'documents' ? (
            <div className={styles.docsSection}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Upload New PDF</h2>
                </div>
                <form onSubmit={handleUpload} className={styles.uploadForm}>
                  <div className={styles.formRow}>
                    <label>PDF File</label>
                    <input type="file" accept="application/pdf" onChange={e => setUploadData({ ...uploadData, file: e.target.files[0] })} />
                  </div>
                  <div className={styles.formRow}>
                    <label>Document Type</label>
                    <select value={uploadData.documentType} onChange={e => setUploadData({ ...uploadData, documentType: e.target.value })}>
                      <option value="syllabus">Syllabus</option>
                      <option value="pyq">Past Year Question (PYQ)</option>
                      <option value="rules">Ordinance / Rules</option>
                      <option value="calendar">Academic Calendar</option>
                      <option value="fees">Fee Structure</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label>Branch (Optional)</label>
                    <input type="text" placeholder="e.g. Computer Science Engineering" value={uploadData.branch} onChange={e => setUploadData({ ...uploadData, branch: e.target.value })} />
                  </div>
                  <div className={styles.formRow}>
                    <label>Semester (Optional)</label>
                    <input type="number" placeholder="e.g. 5" value={uploadData.semester} onChange={e => setUploadData({ ...uploadData, semester: e.target.value })} />
                  </div>
                  <button type="submit" disabled={uploading || !uploadData.file} className={styles.submitBtn}>
                    {uploading ? 'Ingesting PDF...' : 'Upload to Qdrant'}
                  </button>
                </form>
              </section>
              
              <section className={styles.section} style={{ marginTop: '2rem' }}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Ingested Documents ({documents.length})</h2>
                </div>
                <div className={styles.noticeTable}>
                  {documents.map((d, i) => (
                    <div key={i} className={styles.noticeRow}>
                      <span className={styles.noticeTitle}>{d.source}</span>
                      <span className={styles.noticeDate}>{d.chunks} chunks</span>
                      <button onClick={() => handleDelete(d.source)} className={styles.deleteBtn}>Delete</button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <p className={styles.emptyState}>No documents in Qdrant vector database.</p>
                  )}
                </div>
              </section>
            </div>
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
