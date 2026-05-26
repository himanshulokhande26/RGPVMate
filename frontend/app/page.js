'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

/* ── Cycling typewriter ── */
const CYCLE_TEXTS = [
  'The ultimate AI study companion for RGPV students',
  'instant step-by-step solutions',
  'explore 3,000+ real PYQs',
  'stay updated with official notice broadcasts',
];

function useCycleTyping(texts, typeSpeed = 38, backSpeed = 18, pauseMs = 1600) {
  const [displayed, setDisplayed] = useState('');
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('typing');

  useEffect(() => {
    const current = texts[idx];
    let t;
    if (phase === 'typing') {
      if (displayed.length < current.length) {
        t = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), typeSpeed);
      } else {
        t = setTimeout(() => setPhase('backspacing'), pauseMs);
      }
    } else {
      if (displayed.length > 0) {
        t = setTimeout(() => setDisplayed(d => d.slice(0, -1)), backSpeed);
      } else {
        setIdx(i => (i + 1) % texts.length);
        setPhase('typing');
      }
    }
    return () => clearTimeout(t);
  }, [displayed, phase, idx, texts, typeSpeed, backSpeed, pauseMs]);

  return displayed;
}

/* ── Chat Demo ── */
const USER_Q   = 'Explain CS301 Dec 2020 Question 4 — binary search tree deletion';
const BOT_TEXT = 'Case analysis for deleting a node with two children: find inorder successor, swap values, then delete leaf...';
const CODE_LINES = [
  'void deleteNode(Node* root, int key) {',
  '  // Case 1: no children',
  '  // Case 2: one child',
  '  // Case 3: two children → successor',
  '}',
];
const SOURCES = ['RGPV_PYQ_CSE_CS301_Nov-2019.pdf', 'RGPV_PYQ_CSE_CS301_Dec-2020.pdf'];

function ChatDemo() {
  const ref    = useRef(null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase]     = useState(0);
  const [botTyped, setBotTyped] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [showSrc,  setShowSrc]  = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [started]);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0; setBotTyped('');
    const iv = setInterval(() => {
      i++;
      setBotTyped(BOT_TEXT.slice(0, i));
      if (i >= BOT_TEXT.length) {
        clearInterval(iv);
        setTimeout(() => setShowCode(true), 300);
        setTimeout(() => setShowSrc(true),  900);
      }
    }, 24);
    return () => clearInterval(iv);
  }, [phase]);

  return (
    <div className={styles.chatDemoWrap} ref={ref}>
      <div className={styles.chatWindow}>
        <div className={styles.chatTitleBar}>
          <div className={styles.chatDots}>
            <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
          </div>
          <span className={styles.chatTitle}>RGPVMate · Chat</span>
        </div>
        <div className={styles.chatBody}>
          {phase >= 1 && (
            <div className={`${styles.chatMsg} fade-in`}>
              <span className={styles.chatRole}>YOU</span>
              <p className={styles.chatUserText}>{USER_Q}</p>
            </div>
          )}
          {phase >= 2 && (
            <div className={`${styles.chatMsg} fade-in`}>
              <span className={styles.chatRole}>AI</span>
              <p className={styles.chatBotText}>
                {botTyped}
                {botTyped.length < BOT_TEXT.length && <span className={styles.cursor} />}
              </p>
              {showCode && (
                <div className={`${styles.codeBlock} fade-in`}>
                  {CODE_LINES.map((l, i) => <div key={i} className={styles.codeLine}>{l}</div>)}
                </div>
              )}
            </div>
          )}
          {showSrc && (
            <div className={`${styles.chatSources} fade-in`}>
              {SOURCES.map(s => <span key={s} className={styles.sourceChip}>{s}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Capabilities ── */
const CAPABILITIES = [
  { num: '01', title: 'Past Year Questions',    desc: 'Search 3,000+ RGPV past papers by subject code, semester, or year. Get exact questions with context.' },
  { num: '02', title: 'Concept Explanations',   desc: 'Ask any engineering concept in plain language. Get structured, exam-focused answers with examples.' },
  { num: '03', title: 'Exam Notices',           desc: '1,787+ university announcements scraped and classified. Never miss a deadline or schedule change.' },
  { num: '04', title: 'Syllabus Explorer',      desc: 'Branch-specific, semester-wise syllabus on demand. Know exactly what is in scope before any exam.' },
];

const STEPS = [
  { num: '1', title: 'Set your context',    desc: 'Select your branch and semester once. Every response filters to your exact academic context.' },
  { num: '2', title: 'Ask in plain English', desc: 'Type your question naturally — about PYQs, syllabus, concepts, or university announcements.' },
  { num: '3', title: 'Get sourced answers', desc: 'Receive structured, exam-relevant answers with references to actual RGPV documents.' },
];

/* ── Page ── */
export default function LandingPage() {
  const cycled = useCycleTyping(CYCLE_TEXTS);

  return (
    <div className={styles.page}>

      {/* Nav */}
      <header className={styles.nav}>
        <div className={`container ${styles.navInner}`}>
          <Link href="/" className={styles.navLogo}>RGPVMate</Link>
          <nav className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#how"      className={styles.navLink}>How it works</a>
          </nav>
          <div className={styles.navActions}>
            <Link href="/auth" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/chat" className="btn btn-primary btn-sm">Open Chat</Link>
          </div>
        </div>
      </header>

      {/* Hero + Demo side by side */}
      <section className={styles.heroSection}>
        <div className={`container ${styles.heroInner}`}>
          {/* Left: text */}
          <div className={styles.heroLeft}>
            <h1 className={styles.heroHeading}>Master Your Engineering Exams with RGPVMate</h1>
            <p className={styles.heroDesc}>
              <span className={styles.cycledText}>{cycled}</span>
              <span className={styles.cursor} />
            </p>
            <div className={styles.heroCta}>
              <Link href="/chat" className="btn btn-primary btn-lg">Start for free</Link>
              <Link href="/auth?mode=signup" className="btn btn-secondary btn-lg">Create account</Link>
            </div>
          </div>
          {/* Right: animated demo */}
          <div className={styles.heroRight}>
            <ChatDemo />
          </div>
        </div>
      </section>

      <div className={styles.fullDivider} />

      {/* Capabilities */}
      <section id="features" className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Capabilities</p>
            <h2 className={styles.sectionTitle}>Built around how RGPV students actually study</h2>
          </div>
          <div className={styles.capGrid}>
            {CAPABILITIES.map(c => (
              <div key={c.num} className={styles.capCard}>
                <span className={styles.capNum}>{c.num}</span>
                <h3 className={styles.capTitle}>{c.title}</h3>
                <p className={styles.capDesc}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.fullDivider} />

      {/* Steps */}
      <section id="how" className={styles.section}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 className={styles.sectionTitle}>Three steps to a better study session</h2>
          </div>
          <div className={styles.steps}>
            {STEPS.map(s => (
              <div key={s.num} className={styles.step}>
                <span className={styles.stepNum}>{s.num}</span>
                <div>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.stepDesc}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.fullDivider} />

      {/* Stats */}
      <section className={styles.statsSection}>
        <div className="container">
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statVal}>3,000+</span>
              <span className={styles.statLabel}>Past year questions indexed</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statVal}>1,787+</span>
              <span className={styles.statLabel}>RGPV notices tracked</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statVal}>10+</span>
              <span className={styles.statLabel}>Engineering branches covered</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statVal}>8</span>
              <span className={styles.statLabel}>Semesters, all branches</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        {/* Giant brand name — above the footer links */}
        <div className={styles.brandName} aria-hidden="true">RGPVMATE</div>

        <div className={styles.footerTop}>
          <div className={`container ${styles.footerMeta}`}>
            <div className={styles.footerLinks}>
              <Link href="/chat"    className={styles.footerLink}>Chat</Link>
              <Link href="/auth"    className={styles.footerLink}>Sign in</Link>
              <a href="https://github.com/himanshulokhande26/RGPVMate" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>GitHub</a>
            </div>
            <Link href="/admin" className={styles.adminLink}>Admin</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
