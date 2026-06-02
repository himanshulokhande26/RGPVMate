'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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

const STATS = [
  { val: '3,000+', label: 'Past year questions' },
  { val: '1,787+', label: 'Exam notices' },
  { val: '10+',    label: 'Branches covered' },
  { val: '8',      label: 'Semesters' },
];

const QUOTES = [
  { text: 'Got CS301 BST deletion explained with the exact Dec 2020 paper question. Saved hours.', author: 'CSE — Sem 5' },
  { text: 'The notices feature alone is worth it. Never miss an exam schedule again.', author: 'IT — Sem 6' },
  { text: 'Finally an AI that knows RGPV syllabus. Syllabus-accurate answers every time.', author: 'ECE — Sem 4' },
];

function AuthContent() {
  const params = useSearchParams();
  const [mode,     setMode]     = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [step,     setStep]     = useState(1);   // 1 = credentials, 2 = academic context
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [apiError, setApiError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    program: 'B.Tech', branch: 'Computer Science Engineering', semester: '5',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field) => (ev) => {
    setForm(f => ({ ...f, [field]: ev.target.value }));
    setErrors(e => ({ ...e, [field]: undefined }));
    setApiError('');
  };

  const handleProgramChange = (prog) => {
    const defaultBranch = PROGRAM_BRANCHES[prog][0];
    setForm(f => ({ ...f, program: prog, branch: defaultBranch }));
  };

  const switchMode = (m) => {
    setMode(m); setStep(1); setErrors({}); setApiError('');
  };

  // ── Step 1 validation ──────────────────────────────────────────
  const validateStep1 = () => {
    const e = {};
    if (mode === 'signup' && !form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    if (form.password.length < 6) e.password = 'Minimum 6 characters';
    if (mode === 'signup' && form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  // ── Step 1 next ────────────────────────────────────────────────
  const handleStep1 = (ev) => {
    ev.preventDefault();
    const e = validateStep1();
    if (Object.keys(e).length) { setErrors(e); return; }
    if (mode === 'signup') { setStep(2); return; }
    // Login — submit directly
    handleLogin();
  };

  // ── Login submit ───────────────────────────────────────────────
  const handleLogin = async () => {
    setLoading(true); setApiError('');
    try {
      const res  = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setApiError(data.error || 'Login failed'); return; }
      localStorage.setItem('rgpv_token', data.token);
      localStorage.setItem('rgpv_user', JSON.stringify(data.user));
      window.location.href = '/chat';
    } catch {
      setApiError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // ── Register submit (step 2) ───────────────────────────────────
  const handleRegister = async (ev) => {
    ev.preventDefault();
    setLoading(true); setApiError('');
    try {
      const res  = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:     form.name,
          email:    form.email,
          password: form.password,
          program:  form.program,
          branch:   form.branch,
          semester: Number(form.semester),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setApiError(data.error || 'Registration failed'); return; }
      localStorage.setItem('rgpv_token', data.token);
      localStorage.setItem('rgpv_user', JSON.stringify(data.user));
      window.location.href = '/chat';
    } catch {
      setApiError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const nextQuote = () => setQuoteIdx(i => (i + 1) % QUOTES.length);

  // ── Context label for right panel note ────────────────────────
  const contextLabel = `${form.program} • ${form.branch.split(' ').slice(0, 2).join(' ')} • Sem ${form.semester}`;

  return (
    <div className={styles.page}>

      {/* Left */}
      <div className={styles.left}>
        <Link href="/" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          RGPVMate
        </Link>

        <div className={styles.leftContent}>
          <div className={styles.leftTop}>
            <p className={styles.leftEyebrow}>For RGPV students</p>
            <h1 className={styles.leftHeading}>
              {mode === 'login' ? 'Welcome back.' : 'Get started.'}
            </h1>
            <p className={styles.leftSub}>
              {mode === 'login'
                ? 'Sign in to access your personalised RGPV study assistant.'
                : 'Create a free account. Your answers are tailored to your program, branch & semester.'}
            </p>
          </div>

          {/* Stats grid */}
          <div className={styles.statsGrid}>
            {STATS.map(s => (
              <div key={s.label} className={styles.statCard}>
                <span className={styles.statVal}>{s.val}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Quote */}
          <div className={styles.quoteCard}>
            <p className={styles.quoteText}>"{QUOTES[quoteIdx].text}"</p>
            <div className={styles.quoteFooter}>
              <span className={styles.quoteAuthor}>{QUOTES[quoteIdx].author}</span>
              <button className={styles.quoteNext} onClick={nextQuote} aria-label="Next quote">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className={styles.right}>
        <div className={styles.formWrap}>
          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>
              {mode === 'login' ? 'Sign in' : step === 1 ? 'Create account' : 'Your academic context'}
            </h2>
            {mode === 'signup' && (
              <p className={styles.formSubtitle}>
                {step === 1 ? 'Step 1 of 2 — Basic info' : 'Step 2 of 2 — Personalise your experience'}
              </p>
            )}
          </div>

          {/* Mode toggle */}
          <div className={styles.toggle}>
            <button className={`${styles.toggleBtn} ${mode === 'login' ? styles.toggleActive : ''}`}
              onClick={() => switchMode('login')}>Sign in</button>
            <button className={`${styles.toggleBtn} ${mode === 'signup' ? styles.toggleActive : ''}`}
              onClick={() => switchMode('signup')}>Sign up</button>
          </div>

          {/* Step indicator */}
          {mode === 'signup' && (
            <div className={styles.stepDots}>
              <span className={`${styles.stepDot} ${step >= 1 ? styles.stepDotActive : ''}`} />
              <span className={styles.stepLine} />
              <span className={`${styles.stepDot} ${step >= 2 ? styles.stepDotActive : ''}`} />
            </div>
          )}

          {/* ── Step 1: Credentials ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className={styles.form} noValidate>
              {mode === 'signup' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full name</label>
                  <input type="text" id="auth-name"
                    className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
                    placeholder="Your name" value={form.name} onChange={handleChange('name')} autoComplete="name"/>
                  {errors.name && <span className={styles.errMsg}>{errors.name}</span>}
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input type="email" id="auth-email"
                  className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
                  placeholder="you@example.com" value={form.email} onChange={handleChange('email')} autoComplete="email"/>
                {errors.email && <span className={styles.errMsg}>{errors.email}</span>}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Password</label>
                <div className={styles.passWrap}>
                  <input type={showPass ? 'text' : 'password'} id="auth-password"
                    className={`${styles.formInput} ${errors.password ? styles.inputError : ''}`}
                    placeholder="Min. 6 characters" value={form.password} onChange={handleChange('password')}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={{ paddingRight: '44px' }}/>
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                    <EyeIcon open={showPass} />
                  </button>
                </div>
                {errors.password && <span className={styles.errMsg}>{errors.password}</span>}
              </div>

              {mode === 'signup' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Confirm password</label>
                  <div className={styles.passWrap}>
                    <input type={showConf ? 'text' : 'password'} id="auth-confirm"
                      className={`${styles.formInput} ${errors.confirm ? styles.inputError : ''}`}
                      placeholder="Repeat password" value={form.confirm} onChange={handleChange('confirm')}
                      autoComplete="new-password" style={{ paddingRight: '44px' }}/>
                    <button type="button" className={styles.eyeBtn} onClick={() => setShowConf(s => !s)} tabIndex={-1}>
                      <EyeIcon open={showConf} />
                    </button>
                  </div>
                  {errors.confirm && <span className={styles.errMsg}>{errors.confirm}</span>}
                </div>
              )}

              {mode === 'login' && (
                <div className={styles.forgotRow}>
                  <a href="#" className={styles.forgotLink}>Forgot password?</a>
                </div>
              )}

              {apiError && <p className={styles.apiError}>{apiError}</p>}

              <button type="submit" id="auth-submit" className={styles.submitBtn} disabled={loading}>
                {loading && <Spinner />}
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Continue →'}
              </button>
            </form>
          )}

          {/* ── Step 2: Academic Context ── */}
          {step === 2 && mode === 'signup' && (
            <form onSubmit={handleRegister} className={styles.form} noValidate>

              {/* Personalisation note */}
              <div className={styles.personNote}>
                <span className={styles.personIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)' }}>
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
                  </svg>
                </span>
                <p className={styles.personText}>
                  Your chat responses will be <strong>strictly personalised</strong> to your program, branch, and semester — no irrelevant content.
                </p>
              </div>

              {/* Program */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Program</label>
                <CustomSelect value={form.program} onChange={handleProgramChange} options={PROGRAMS} />
              </div>

              {/* Branch */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Branch</label>
                <CustomSelect 
                  value={form.branch} 
                  onChange={(v) => handleChange('branch')({target: {value: v}})} 
                  options={PROGRAM_BRANCHES[form.program] || [form.branch]} 
                />
              </div>

              {/* Semester */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Semester</label>
                <CustomSelect 
                  value={form.semester} 
                  onChange={(v) => handleChange('semester')({target: {value: v}})} 
                  options={SEMESTERS} 
                  renderLabel={(v) => `Semester ${v}`} 
                />
              </div>

              {/* Context preview */}
              <div className={styles.contextPreview}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Responses will be tailored to: <strong>{contextLabel}</strong></span>
              </div>

              {apiError && <p className={styles.apiError}>{apiError}</p>}

              <div className={styles.step2Btns}>
                <button type="button" className={styles.backBtn} onClick={() => setStep(1)} disabled={loading}>
                  ← Back
                </button>
                <button type="submit" id="auth-create" className={styles.submitBtn} disabled={loading} style={{ flex: 1 }}>
                  {loading && <Spinner />}
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <>
              <div className={styles.dividerRow}>
                <span className={styles.dividerLine} />
                <span className={styles.dividerText}>or</span>
                <span className={styles.dividerLine} />
              </div>

              <div className={styles.socialBtns}>
                <a href={`${API}/api/auth/google`} className={styles.socialBtn} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center' }}>
                  <GoogleIcon /> Continue with Google
                </a>
                <a href={`${API}/api/auth/github`} className={styles.socialBtn} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                  <GitHubIcon /> Continue with GitHub
                </a>
              </div>
            </>
          )}

          <p className={styles.switchMode}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button className={styles.switchLink}
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

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

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <AuthContent />
    </Suspense>
  );
}
