'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
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

const BRANCH_SHORT = {
  'Computer Science Engineering': 'CSE',
  'Information Technology': 'IT',
  'Electronics and Communication Engineering': 'ECE',
  'Electrical Engineering': 'EE',
  'Mechanical Engineering': 'ME',
  'Civil Engineering': 'CE',
  'AI and Machine Learning': 'AIML',
  'AI and Data Science': 'AIDS',
  'Cyber Security': 'CYBER',
  'CSE IoT': 'IOT',
  'Pharmacy': 'PHARM',
  'Computer Applications': 'CA',
  'Business Administration': 'BA',
  'Structural Engineering': 'SE',
  'Power Systems': 'PS'
};

const SUGGESTIONS = [
  'CS301 Data Structures December 2020 past questions',
  "Explain Kruskal's algorithm with example",
  'Show me 5th semester IT syllabus topics',
  'What are the latest RGPV exam notices?',
];

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
   Code Block — custom markdown component with copy state
──────────────────────────────────────────────────────────── */
function CodeBlock({ match, children, ...props }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeLanguage}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          {match[1]}
        </span>
        <button 
          className={styles.codeCopyBtn}
          title="Copy code"
          onClick={handleCopy}
        >
          {copied ? (
            <span className={styles.codeCopiedText}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Copied!
            </span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        CodeTag="div"
        customStyle={{ margin: 0, padding: '16px', background: 'transparent' }}
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
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
  }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    navigator.clipboard.writeText(msg.rawContent || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showingAll = displayed.length === (msg.content || '').length;

  const mdComponents = {
    pre: ({ children }) => <>{children}</>,
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      if (!inline && match) {
        return <CodeBlock match={match} children={children} {...props} />;
      }
      return <code className={className} {...props}>{children}</code>;
    }
  };

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowBot} fade-in`}>
      {!isUser && <div className={styles.msgAvatar}>R</div>}
      <div className={`${styles.msgContent} ${isUser ? styles.msgContentUser : ''}`}>
        {isUser ? (
          <p className={styles.userText}>{msg.content}</p>
        ) : (
          <>
            <div className={`${styles.botText} prose`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{displayed}</ReactMarkdown>
            </div>
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
  const [program,     setProgram]     = useState('B.Tech');
  const [branch,      setBranch]      = useState('Computer Science Engineering');
  const [semester,    setSemester]    = useState('5');
  const [user,        setUser]        = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notices,     setNotices]     = useState([]);
  const [threads,     setThreads]     = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  const loadThreads = useCallback(async (token) => {
    try {
      const res = await fetch(`${API}/api/chat/threads`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.threads) setThreads(data.threads);
    } catch {}
  }, []);

  const loadThreadMessages = async (threadId) => {
    const token = localStorage.getItem('rgpv_token');
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/chat/threads/${threadId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.messages) {
        setMessages(data.messages.map(m => ({
          role: m.role === 'assistant' ? 'bot' : 'user',
          content: m.content,
          rawContent: m.content,
          sources: m.sources || [],
          elapsed: null,
          streaming: false,
        })));
        setActiveThreadId(threadId);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  // Load user profile from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rgpv_user');
      const token = localStorage.getItem('rgpv_token');
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        if (u.program)  setProgram(u.program);
        if (u.branch)   setBranch(u.branch);
        if (u.semester) setSemester(String(u.semester));
      }
      if (token) {
        loadThreads(token);
      }
    } catch {}
  }, [loadThreads]);

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('rgpv_token') : null;
      const res  = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q, program, branch, semester: Number(semester), history, threadId: activeThreadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      
      if (data.threadId && data.threadId !== activeThreadId) {
        setActiveThreadId(data.threadId);
        const token = localStorage.getItem('rgpv_token');
        if (token) loadThreads(token);
      }

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
  }, [input, loading, messages, program, branch, semester, activeThreadId, loadThreads]);

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
          <button className={styles.newChatBtn} onClick={() => { setMessages([]); setActiveThreadId(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Chat
          </button>

          <hr className={styles.sidebarDivider} />

          {!user ? (
            <div className={styles.contextSection}>
              <p className={styles.sectionLabel}>Context</p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Program</label>
                <CustomSelect value={program} onChange={(v) => { setProgram(v); setBranch(PROGRAM_BRANCHES[v][0]); }} options={PROGRAMS} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Branch</label>
                <CustomSelect value={branch} onChange={setBranch} options={PROGRAM_BRANCHES[program] || [branch]} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Semester</label>
                <CustomSelect value={semester} onChange={setSemester} options={SEMESTERS}
                  renderLabel={(v) => `Semester ${v}`} />
              </div>
            </div>
          ) : (
            <div className={styles.histSection}>
              <p className={styles.sectionLabel}>Recent Chats</p>
              {threads.length > 0 ? (
                threads.map(th => (
                  <button key={th._id} 
                    className={`${styles.histItem} ${activeThreadId === th._id ? styles.histItemActive : ''}`}
                    onClick={() => loadThreadMessages(th._id)}>
                    <span className={styles.histTitle}>{th.title}</span>
                  </button>
                ))
              ) : (
                <p className={styles.histEmpty}>No conversations yet.</p>
              )}
            </div>
          )}
        </div>

        <div className={styles.sidebarFooter}>
          <hr className={styles.sidebarDivider} />
          {user ? (
            <a href="/profile" className={styles.profileFooterLink}>
              <span className={styles.profileFooterAvatar}>
                {user.name?.charAt(0).toUpperCase()}
              </span>
              <span className={styles.profileFooterName}>{user.name}</span>
            </a>
          ) : (
            <Link href="/auth" className={styles.footerLink}>Sign in</Link>
          )}
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
            <span className={styles.topBadge}>{program}</span>
            <span className={styles.topSep}>·</span>
            <span className={styles.topBadge}>{branch.split(' ')[0]}</span>
            <span className={styles.topSep}>/</span>
            <span className={styles.topBadge}>Sem {semester}</span>
          </div>
          {user ? (
            <a href="/profile" className={styles.avatarBtn} title={user.name}>
              {user.photoUrl
                ? <img src={user.photoUrl} alt={user.name} className={styles.avatarImg} />
                : <span className={styles.avatarInitials}>{user.name?.charAt(0).toUpperCase()}</span>
              }
            </a>
          ) : (
            <Link href="/auth" className={`btn btn-sm btn-secondary ${styles.signInBtn}`}>Sign in</Link>
          )}
        </header>

        {notices.length > 0 && (
          <NoticeBanner notices={notices} onDismiss={() => setNotices(n => n.slice(1))} />
        )}

        {/* Messages */}
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={`${styles.empty} fade-in`}>
              <h2 className={styles.emptyHeading}>How can I help you?</h2>
              {/* Personalisation banner */}
              <div className={styles.personBanner}>
                <span className={styles.personBannerText}>
                  Responses are tailored to your <strong>{program} · {BRANCH_SHORT[branch] || branch.split(' ')[0]} · Sem {semester}</strong> context
                </span>
              </div>
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
