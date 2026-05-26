'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const BRANCHES = [
  'Computer Science Engineering',
  'Information Technology',
  'Electronics and Communication Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering',
];
const BRANCH_SHORT = {
  'Computer Science Engineering': 'CSE',
  'Information Technology': 'IT',
  'Electronics and Communication Engineering': 'ECE',
  'Mechanical Engineering': 'ME',
  'Civil Engineering': 'CE',
  'Electrical Engineering': 'EE',
};
const SEMESTERS = ['1','2','3','4','5','6','7','8'];

const SUGGESTIONS = [
  'CS301 Data Structures December 2020 past questions',
  "Explain Kruskal's algorithm with example",
  'Show me 5th semester IT syllabus topics',
  'What are the latest RGPV exam notices?',
];

/* ────────────────────────────────────────────────────────────
   Custom Dropdown
──────────────────────────────────────────────────────────── */
function CustomSelect({ value, onChange, options, renderLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={styles.customSelect} ref={ref}>
      <button type="button" className={styles.selectBtn} onClick={() => setOpen(o => !o)}>
        <span className={styles.selectValue}>{renderLabel ? renderLabel(value) : value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '150ms ease', flexShrink: 0, color: 'var(--text-4)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className={`${styles.selectDropdown} slide-down`}>
          {options.map(opt => (
            <button key={opt} type="button"
              className={`${styles.selectOption} ${opt === value ? styles.selectOptionActive : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}>
              {renderLabel ? renderLabel(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Markdown renderer — proper line-by-line parser
──────────────────────────────────────────────────────────── */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFmt(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`\n]+)`/g,   '<code>$1</code>');
}

function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inUl = false, inOl = false, inPre = false, preLines = [], preLang = '';

  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  for (const line of lines) {
    // ── Code block fence ──
    if (line.startsWith('```')) {
      if (!inPre) {
        closeList();
        inPre = true;
        preLang = line.slice(3).trim();
        preLines = [];
      } else {
        html += `<pre><code${preLang ? ` class="language-${preLang}"` : ''}>${escHtml(preLines.join('\n').trimEnd())}</code></pre>`;
        inPre = false; preLang = ''; preLines = [];
      }
      continue;
    }
    if (inPre) { preLines.push(line); continue; }

    // ── Headings ──
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h3) { closeList(); html += `<h3>${inlineFmt(h3[1])}</h3>`; continue; }
    if (h2) { closeList(); html += `<h2>${inlineFmt(h2[1])}</h2>`; continue; }
    if (h1) { closeList(); html += `<h1>${inlineFmt(h1[1])}</h1>`; continue; }

    // ── Horizontal rule ──
    if (/^---+$/.test(line.trim())) { closeList(); html += '<hr/>'; continue; }

    // ── Numbered list ──
    const olMatch = line.match(/^(\d+)[.)]\s+(.+)/);
    if (olMatch) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${inlineFmt(olMatch[2])}</li>`;
      continue;
    }

    // ── Bullet list ──
    const ulMatch = line.match(/^[•\-\*]\s+(.+)/);
    if (ulMatch) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${inlineFmt(ulMatch[1])}</li>`;
      continue;
    }

    // ── Blockquote ──
    const bqMatch = line.match(/^>\s+(.+)/);
    if (bqMatch) { closeList(); html += `<blockquote>${inlineFmt(bqMatch[1])}</blockquote>`; continue; }

    // ── Empty line ──
    if (line.trim() === '') { closeList(); continue; }

    // ── Regular paragraph ──
    closeList();
    html += `<p>${inlineFmt(line)}</p>`;
  }

  if (inPre)  html += `<pre><code>${escHtml(preLines.join('\n'))}</code></pre>`;
  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';

  return html;
}

/* ────────────────────────────────────────────────────────────
   Sources panel
──────────────────────────────────────────────────────────── */
function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className={styles.sources}>
      <button className={styles.sourcesToggle} onClick={() => setOpen(o => !o)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>{sources.length} source{sources.length !== 1 ? 's' : ''}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: '150ms ease', marginLeft: 'auto' }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {open && (
        <div className={`${styles.sourcesList} slide-down`}>
          {sources.map((s, i) => (
            <div key={i} className={styles.sourceItem}>
              <span className={styles.sourceItemText}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Message — with typewriter for new bot messages
──────────────────────────────────────────────────────────── */
function Message({ msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied]   = useState(false);
  const [displayed, setDisplayed] = useState(
    msg.streaming ? '' : (msg.content || '')
  );
  const doneRef = useRef(!msg.streaming);

  // Typewriter animation — runs once on mount for streaming messages
  useEffect(() => {
    if (!msg.streaming) { setDisplayed(msg.content || ''); return; }
    const text = msg.content || '';
    if (!text) return;
    let i = 0;
    // Adaptive chunk size: aim for ~120ms total for short text, cap speed at 8ms/chunk
    const totalMs = Math.min(Math.max(text.length * 12, 800), 6000);
    const steps   = Math.ceil(totalMs / 12);
    const chunk   = Math.max(1, Math.ceil(text.length / steps));

    const iv = setInterval(() => {
      i = Math.min(i + chunk, text.length);
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); doneRef.current = true; }
    }, 12);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(msg.rawContent || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showingAll = displayed.length === (msg.content || '').length;

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowBot} fade-in`}>
      {!isUser && <div className={styles.msgAvatar}>R</div>}
      <div className={`${styles.msgContent} ${isUser ? styles.msgContentUser : ''}`}>
        {isUser ? (
          <p className={styles.userText}>{msg.content}</p>
        ) : (
          <>
            <div className={`${styles.botText} prose`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(displayed) }} />
            {/* Blinking cursor while typing */}
            {!showingAll && <span className={styles.inlineCursor} />}
          </>
        )}

        {/* Sources — shown once typing is done */}
        {!isUser && showingAll && msg.sources?.length > 0 && (
          <SourcesPanel sources={msg.sources} />
        )}

        {/* Action bar — always visible for bot messages once done */}
        {!isUser && showingAll && (
          <div className={styles.msgActions}>
            <button className={styles.msgAction} onClick={copy}>
              {copied
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              }
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            {msg.elapsed != null && (
              <span className={styles.msgTime}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {msg.elapsed}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Typing indicator — 3 bouncing dots
──────────────────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className={`${styles.msgRow} ${styles.msgRowBot} fade-in`}>
      <div className={styles.msgAvatar}>R</div>
      <div className={styles.msgContent}>
        <div className={styles.typing}>
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Notice banner
──────────────────────────────────────────────────────────── */
function NoticeBanner({ notices, onDismiss }) {
  const top = notices[0];
  if (!top) return null;
  return (
    <div className={styles.noticeBanner}>
      <span className={styles.noticeText}>{top.title}</span>
      <span className={styles.noticeDate}>
        {new Date(top.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </span>
      <button className={styles.noticeDismiss} onClick={onDismiss}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Main Chat Page
──────────────────────────────────────────────────────────── */
export default function ChatPage() {
  const [branch,      setBranch]      = useState('Computer Science Engineering');
  const [semester,    setSemester]    = useState('5');
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notices,     setNotices]     = useState([]);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/notices/alerts`)
      .then(r => r.json())
      .then(d => setNotices(d.notices || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, []);

  const sendMessage = useCallback(async (overrideText) => {
    const q = (overrideText ?? input).trim();
    if (!q || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const history = messages.slice(-8).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.rawContent || m.content,
    }));

    setMessages(prev => [...prev, { role: 'user', content: q, rawContent: q }]);
    setLoading(true);
    const start = Date.now();

    try {
      const res  = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, branch, semester: Number(semester), history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      setMessages(prev => [...prev, {
        role: 'bot',
        content: data.answer || 'No response received.',
        rawContent: data.answer || '',
        sources: Array.isArray(data.sources) ? data.sources : [],
        elapsed: data.elapsedSeconds ?? elapsed,
        streaming: true,   // ← triggers typewriter in Message
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        content: `**Could not connect to the backend.**\n\nMake sure the server is running on port 3000.\n\n${err.message}`,
        rawContent: '',
        sources: [],
        elapsed: null,
        streaming: false,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, branch, semester]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className={styles.layout}>

      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarHidden : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.brand}>RGPVMate</Link>
        </div>

        <div className={styles.sidebarBody}>
          <button className={styles.newChatBtn} onClick={() => setMessages([])}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Chat
          </button>

          <hr className={styles.sidebarDivider} />

          <div className={styles.contextSection}>
            <p className={styles.sectionLabel}>Context</p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Branch</label>
              <CustomSelect value={branch} onChange={setBranch} options={BRANCHES} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Semester</label>
              <CustomSelect value={semester} onChange={setSemester} options={SEMESTERS}
                renderLabel={(v) => `Semester ${v}`} />
            </div>
          </div>

          <hr className={styles.sidebarDivider} />

          <div className={styles.histSection}>
            <p className={styles.sectionLabel}>Recent</p>
            {messages.length > 0 ? (
              <button className={`${styles.histItem} ${styles.histItemActive}`}>
                <span className={styles.histTitle}>
                  {messages.find(m => m.role === 'user')?.content?.slice(0, 36)}…
                </span>
              </button>
            ) : (
              <p className={styles.histEmpty}>No conversations yet.</p>
            )}
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <hr className={styles.sidebarDivider} />
          <Link href="/auth" className={styles.footerLink}>Sign in</Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>

        {/* Topbar */}
        <header className={styles.topbar}>
          <button className={styles.menuBtn} onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className={styles.topMeta}>
            <span className={styles.topBadge}>{BRANCH_SHORT[branch]}</span>
            <span className={styles.topSep}>/</span>
            <span className={styles.topBadge}>Sem {semester}</span>
          </div>
          <Link href="/auth" className={`btn btn-sm btn-secondary ${styles.signInBtn}`}>Sign in</Link>
        </header>

        {notices.length > 0 && (
          <NoticeBanner notices={notices} onDismiss={() => setNotices(n => n.slice(1))} />
        )}

        {/* Messages */}
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={`${styles.empty} fade-in`}>
              <h2 className={styles.emptyHeading}>How can I help you?</h2>
              <p className={styles.emptyDesc}>Ask about past papers, syllabus, concepts, or RGPV notices.</p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className={styles.suggestion} onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.thread}>
              {messages.map((m, i) => <Message key={i} msg={m} />)}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className={styles.inputWrapper}>
          <div className={styles.inputArea}>
            <div className={`${styles.inputPill} ${input.trim() ? styles.inputPillFilled : ''}`}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                placeholder="Ask anything"
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(); }}
                onKeyDown={handleKey}
                rows={1}
              />
              <button
                className={`${styles.sendBtn} ${(input.trim() && !loading) ? styles.sendBtnActive : ''}`}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                aria-label="Send"
              >
                {loading
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ animation: 'spin 0.7s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                    </svg>
                }
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
