import { useState, useRef, useEffect } from 'react';
import styles from './CustomSelect.module.css';

export default function CustomSelect({ value, onChange, options, renderLabel }) {
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
    <div className={`${styles.customSelect} ${open ? styles.customSelectOpen : ''}`} ref={ref}>
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
            <button
              key={opt}
              type="button"
              className={`${styles.selectOption} ${opt === value ? styles.selectOptionActive : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {renderLabel ? renderLabel(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
