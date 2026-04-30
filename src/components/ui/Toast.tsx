import { useEffect } from 'react';
import { useStore } from '@/store';
import styles from './Toast.module.css';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const clearToast = useStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 4000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`} role="alert">
      <span>{toast.message}</span>
      <button onClick={clearToast} aria-label="Dismiss" className={styles.dismiss}>
        ✕
      </button>
    </div>
  );
}
