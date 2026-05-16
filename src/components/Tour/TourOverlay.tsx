import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTour } from './useTour';
import { TOUR_STEPS } from './steps';
import styles from './Tour.module.css';

const PAD = 10;
const CARD_W = 356;
const CARD_H = 260;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type ArrowDir = 'top' | 'bottom' | 'left' | 'right';

function placeCard(rect: TargetRect, yOffset = 0): { top: number; left: number; arrow: ArrowDir } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const el = { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
  const gap = PAD + 8;

  const spaceBelow = vh - el.bottom - gap;
  const spaceAbove = el.top - gap;
  const spaceRight = vw - el.right - gap;

  let top: number;
  let left: number;
  let arrow: ArrowDir;

  if (spaceBelow >= CARD_H) {
    top = el.bottom + gap + yOffset;
    left = Math.max(16, Math.min(el.left, vw - CARD_W - 16));
    arrow = 'top';
  } else if (spaceAbove >= CARD_H) {
    top = el.top - gap - CARD_H - yOffset;
    left = Math.max(16, Math.min(el.left, vw - CARD_W - 16));
    arrow = 'bottom';
  } else if (spaceRight >= CARD_W) {
    top = Math.max(16, Math.min(el.top + yOffset, vh - CARD_H - 16));
    left = el.right + gap;
    arrow = 'left';
  } else {
    top = Math.max(16, Math.min(el.top + yOffset, vh - CARD_H - 16));
    left = Math.max(16, el.left - gap - CARD_W);
    arrow = 'right';
  }

  return { top, left, arrow };
}

export function TourOverlay() {
  const { isActive, currentStep, totalSteps, next, prev, end } = useTour();
  const navigate = useNavigate();
  const location = useLocation();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const pollRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const step = TOUR_STEPS[currentStep];

  const measureElement = useCallback((target: string) => {
    let attempts = 0;

    const poll = () => {
      if (!mountedRef.current) return;
      const el = document.querySelector<HTMLElement>(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        setTimeout(() => {
          if (!mountedRef.current) return;
          const r = el.getBoundingClientRect();
          setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }, 300);
      } else if (attempts < 40) {
        attempts++;
        pollRef.current = requestAnimationFrame(poll);
      } else {
        setTargetRect(null);
      }
    };

    pollRef.current = requestAnimationFrame(poll);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    cancelAnimationFrame(pollRef.current);
    setTargetRect(null);

    if (!isActive) return;

    const onCorrectRoute = step.routePattern
      ? location.pathname.startsWith(step.routePattern)
      : location.pathname === step.route;

    if (!onCorrectRoute) {
      void navigate(step.routeFn ? step.routeFn() : step.route);
      return;
    }

    const t = setTimeout(() => measureElement(step.target), 80);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(pollRef.current);
    };
  }, [isActive, currentStep, location.pathname, step, navigate, measureElement]);

  useEffect(() => {
    if (!isActive) return;
    const onResize = () => {
      const el = document.querySelector<HTMLElement>(step.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isActive, step]);

  if (!isActive) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const renderSpotlight = () => {
    if (!targetRect) {
      return <div className={styles.backdropSolid} />;
    }

    const { top, left, width, height } = targetRect;
    const right = left + width;
    const bottom = top + height;
    const tp = Math.max(0, top - PAD);
    const lp = Math.max(0, left - PAD);
    const rp = Math.min(vw, right + PAD);
    const bp = Math.min(vh, bottom + PAD);

    return (
      <>
        <div className={styles.backdropRect} style={{ top: 0, left: 0, width: vw, height: tp }} />
        <div
          className={styles.backdropRect}
          style={{ top: bp, left: 0, width: vw, height: Math.max(0, vh - bp) }}
        />
        <div
          className={styles.backdropRect}
          style={{ top: tp, left: 0, width: lp, height: bp - tp }}
        />
        <div
          className={styles.backdropRect}
          style={{ top: tp, left: rp, width: Math.max(0, vw - rp), height: bp - tp }}
        />
        <div
          className={styles.highlight}
          style={{ top: tp, left: lp, width: rp - lp, height: bp - tp }}
        />
      </>
    );
  };

  const renderCard = () => {
    if (!targetRect) return null;

    const { top, left, arrow } = placeCard(targetRect, step.yOffset);
    const arrowClass =
      arrow === 'top' && step.arrowAlign === 'right'
        ? styles.arrow_top_right
        : styles[`arrow_${arrow}`];

    return (
      <div
        className={`${styles.card} ${arrowClass}`}
        style={{ top, left, width: CARD_W }}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${currentStep + 1} of ${totalSteps}: ${step.title}`}
      >
        <div className={styles.cardHeader}>
          <span className={styles.stepBadge}>
            {currentStep + 1} / {totalSteps}
          </span>
          <button className={styles.closeBtn} onClick={end} aria-label="Close tour">
            ✕
          </button>
        </div>

        <h3 className={styles.cardTitle}>{step.title}</h3>

        <ul className={styles.cardBody}>
          {step.body.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <div className={styles.cardFooter}>
          <button className={styles.navBtn} onClick={prev} disabled={currentStep === 0}>
            ← Back
          </button>

          <div className={styles.dots}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={`${styles.dot} ${i === currentStep ? styles.dotActive : ''}`}
              />
            ))}
          </div>

          <button className={styles.navBtnPrimary} onClick={next}>
            {currentStep === totalSteps - 1 ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.root}>
      {renderSpotlight()}
      {renderCard()}
    </div>
  );
}

export function TourTrigger() {
  const { start, isActive } = useTour();

  if (isActive) return null;

  return (
    <button className={styles.trigger} onClick={start} aria-label="Start guided tour">
      <span className={styles.triggerIcon}>✦</span>
      Tour
    </button>
  );
}
