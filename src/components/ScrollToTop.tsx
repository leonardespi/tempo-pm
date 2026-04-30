import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollToTop() {
  const { pathname } = useLocation();
  const mainRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!mainRef.current) {
      mainRef.current = document.querySelector('main');
    }
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname]);

  return null;
}
