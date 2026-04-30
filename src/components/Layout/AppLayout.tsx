import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Toast } from '@/components/ui/Toast';
import { ScrollToTop } from '@/components/ScrollToTop';
import { CommandPalette } from '@/components/CommandPalette';
import styles from './AppLayout.module.css';

type Props = { children: ReactNode };

export function AppLayout({ children }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className={styles.shell}>
      <ScrollToTop />
      <Sidebar onOpenSearch={() => setPaletteOpen(true)} />
      <main className={styles.main}>{children}</main>
      <Toast />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
