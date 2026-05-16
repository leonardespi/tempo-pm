import { useEffect } from 'react';
import type { RefObject } from 'react';

const DRAG_THRESHOLD = 5;

export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const node = el;

    let startX = 0;
    let startScrollLeft = 0;
    let active = false;
    let dragged = false;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      active = true;
      dragged = false;
      startX = e.clientX;
      startScrollLeft = node.scrollLeft;
      // Capture deferred to onPointerMove: eagerly capturing here reroutes the
      // subsequent click event to the scroll container, preventing child onClick
      // handlers (e.g. SVG cells) from firing on simple clicks.
    }

    function onPointerMove(e: PointerEvent) {
      if (!active) return;
      const dx = startX - e.clientX;
      if (!dragged && Math.abs(dx) > DRAG_THRESHOLD) {
        dragged = true;
        node.setPointerCapture(e.pointerId);
        node.style.cursor = 'grabbing';
        node.style.userSelect = 'none';
      }
      if (dragged) node.scrollLeft = startScrollLeft + dx;
    }

    function onPointerUp() {
      if (!active) return;
      active = false;
      node.style.cursor = '';
      node.style.userSelect = '';
      if (dragged) {
        // Block the next click so drag-release doesn't fire cell/bar click handlers
        node.addEventListener('click', absorbClick, { capture: true, once: true });
      }
    }

    function absorbClick(e: Event) {
      e.stopPropagation();
      e.preventDefault();
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [ref]);
}
