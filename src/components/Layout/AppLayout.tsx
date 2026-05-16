import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Toast } from '@/components/ui/Toast';
import { ScrollToTop } from '@/components/ScrollToTop';
import { CommandPalette } from '@/components/CommandPalette';
import { TourProvider, TourOverlay, TourTrigger } from '@/components/Tour';
import styles from './AppLayout.module.css';

type Props = { children: ReactNode };

function readSidebarPref(): boolean {
  try {
    return localStorage.getItem('sidebarOpen') !== 'false';
  } catch {
    return true;
  }
}

export function AppLayout({ children }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpenState] = useState(readSidebarPref);

  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open);
    try {
      localStorage.setItem('sidebarOpen', String(open));
    } catch {
      // ignore quota / disabled storage
    }
  };

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
    <TourProvider>
      <div className={styles.shell}>
        <ScrollToTop />
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <div className={styles.content}>
          {!sidebarOpen && (
            <div className={styles.topbar}>
              <button
                className={styles.topbarBurger}
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                ☰
              </button>
              <span className={styles.topbarBrand}>Tempo</span>
            </div>
          )}
          <main className={styles.main}>{children}</main>
        </div>
        <Toast />
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      </div>
      <TourOverlay />
      <TourTrigger />
    </TourProvider>
  );
}
