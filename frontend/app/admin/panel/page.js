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
                  <h2 className={styles.sectionTitle}>Upload New Document</h2>
                  <span className={styles.sectionHint}>PDF files only · Max 20 MB</span>
                </div>

                <form onSubmit={handleUpload} className={styles.uploadForm}>

                  {/* File drop zone */}
                  <div className={styles.fileZone}
                    onClick={() => document.getElementById('adminFileInput').click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.fileZoneDrag); }}
                    onDragLeave={(e) => e.currentTarget.classList.remove(styles.fileZoneDrag)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove(styles.fileZoneDrag);
                      const f = e.dataTransfer.files?.[0];
                      if (f && f.type === 'application/pdf') setUploadData({ ...uploadData, file: f });
                    }}
                  >
                    <input
                      id="adminFileInput"
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={e => setUploadData({ ...uploadData, file: e.target.files[0] })}
                    />
                    {uploadData.file ? (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.75">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span className={styles.fileZoneName}>{uploadData.file.name}</span>
                        <span className={styles.fileZoneSize}>{(uploadData.file.size / 1024).toFixed(0)} KB</span>
                        <button type="button" className={styles.fileZoneRemove}
                          onClick={e => { e.stopPropagation(); setUploadData({ ...uploadData, file: null }); }}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-4)' }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <span className={styles.fileZoneText}>Click or drag & drop a PDF here</span>
                        <span className={styles.fileZoneHint}>Supported: Syllabus, PYQs, Ordinance, Calendar, Fee Structure</span>
                      </>
                    )}
                  </div>

                  {/* 2-column grid for metadata */}
                  <div className={styles.formGrid}>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Document Type</label>
                      <select
                        className={styles.formSelect}
                        value={uploadData.documentType}
                        onChange={e => setUploadData({ ...uploadData, documentType: e.target.value })}
                      >
                        <option value="syllabus">Syllabus</option>
                        <option value="pyq">Past Year Questions (PYQ)</option>
                        <option value="rules">Ordinance / Rules</option>
                        <option value="calendar">Academic Calendar</option>
                        <option value="fees">Fee Structure</option>
                      </select>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Branch <span className={styles.formOptional}>(optional)</span></label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. Computer Science Engineering"
                        value={uploadData.branch}
                        onChange={e => setUploadData({ ...uploadData, branch: e.target.value })}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Semester <span className={styles.formOptional}>(optional)</span></label>
                      <input
                        type="number"
                        className={styles.formInput}
                        placeholder="e.g. 5"
                        min="1" max="8"
                        value={uploadData.semester}
                        onChange={e => setUploadData({ ...uploadData, semester: e.target.value })}
                      />
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>Scheme / Year <span className={styles.formOptional}>(optional)</span></label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="e.g. 2023-24"
                        value={uploadData.scheme}
                        onChange={e => setUploadData({ ...uploadData, scheme: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className={styles.uploadFooter}>
                    <button type="submit" disabled={uploading || !uploadData.file} className={styles.submitBtn}>
                      {uploading ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{ animation: 'spin 0.7s linear infinite' }}>
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                          Ingesting PDF…
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Upload to Qdrant
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Ingested Documents</h2>
                  <span className={styles.sectionHint}>
                    {documents.length} files · {documents.reduce((s, d) => s + (d.chunks || 0), 0)} total chunks in Qdrant
                  </span>
                </div>
                <div className={styles.docsTable}>
                  <div className={styles.docsTableHeader}>
                    <span>Document Source</span>
                    <span>Chunks</span>
                    <span></span>
                  </div>
                  {documents.map((d, i) => (
                    <div key={i} className={styles.docsRow}>
                      <span className={styles.docSource}>{d.source}</span>
                      <span className={styles.docChunks}>
                        <span className={styles.chunkBadge}>{d.chunks}</span>
                        <span className={styles.chunkLabel}>chunks</span>
                      </span>
                      <button onClick={() => handleDelete(d.source)} className={styles.deleteBtn}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                        Delete
                      </button>
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
