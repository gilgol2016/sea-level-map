import { useState, useRef, useCallback, useEffect } from 'react';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Clamps panel translation so at least a minimal handle / margin remains inside the viewport.
 */
export function clampViewportPosition(
  currentPos: Point,
  delta: { dx: number; dy: number },
  initialRect: Rect,
  viewport: ViewportSize
): Point {
  const targetX = currentPos.x + delta.dx;
  const targetY = currentPos.y + delta.dy;

  // Keep at least 80px of the panel visible horizontally
  const minX = -(initialRect.left + initialRect.width - 80);
  const maxX = Math.max(0, viewport.width - initialRect.left - 80);

  // Keep top header inside screen (no higher than top of screen, no lower than bottom - 40px)
  const minY = -initialRect.top;
  const maxY = Math.max(0, viewport.height - initialRect.top - 40);

  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  const clampedY = Math.max(minY, Math.min(maxY, targetY));

  return { x: clampedX, y: clampedY };
}

/**
 * Lightweight in-memory draggable hook for floating panels.
 * Resets to default position on reload.
 */
export function useDraggable() {
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"], .no-drag')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
  }, [position.x, position.y]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      const newTargetX = dragStartRef.current.posX + dx;
      const newTargetY = dragStartRef.current.posY + dy;

      if (targetRef.current) {
        const rect = targetRef.current.getBoundingClientRect();
        const baseLeft = rect.left - position.x;
        const baseTop = rect.top - position.y;

        const clamped = clampViewportPosition(
          { x: 0, y: 0 },
          { dx: newTargetX, dy: newTargetY },
          { left: baseLeft, top: baseTop, width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight }
        );
        setPosition(clamped);
      } else {
        setPosition({ x: newTargetX, y: newTargetY });
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, position.x, position.y]);

  return {
    targetRef,
    position,
    isDragging,
    handlePointerDown,
    style: {
      transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      willChange: isDragging ? 'transform' : 'auto'
    } as React.CSSProperties
  };
}
