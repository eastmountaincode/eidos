"use client";

import { useCallback, useLayoutEffect, useRef } from 'react';

export function useChatScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const frame = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const element = scrollRef.current;
      // Include bottom padding, and avoid smooth-scroll events changing follow intent.
      if (element && following.current) element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
    });
  }, []);

  const followLatest = useCallback(() => { following.current = true; scrollToBottom(); }, [scrollToBottom]);
  const pauseFollowing = useCallback(() => { following.current = false; }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content) return;
    let lastTop = element.scrollTop;
    let lastHeight = element.scrollHeight;
    let lastViewport = element.clientHeight;
    let touchY: number | undefined;

    const onScroll = () => {
      const atBottom = element.scrollHeight - element.clientHeight - element.scrollTop <= 2;
      const layoutChanged = lastHeight !== element.scrollHeight || lastViewport !== element.clientHeight;
      // Layout/scroll anchoring isn't a request to stop following. Scrolling up is.
      if (atBottom) following.current = true;
      else if (!layoutChanged && element.scrollTop < lastTop - 1) following.current = false;
      lastTop = element.scrollTop;
      lastHeight = element.scrollHeight;
      lastViewport = element.clientHeight;
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) pauseFollowing(); };
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY; };
    const onTouchMove = (event: TouchEvent) => {
      const next = event.touches[0]?.clientY;
      if (next !== undefined && touchY !== undefined && next > touchY) pauseFollowing();
      touchY = next;
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    // Replies, image/font loading, composer growth and viewport changes all affect the bottom.
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(element);
    observer.observe(content);
    scrollToBottom();
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
    };
  }, [pauseFollowing, scrollToBottom]);

  return { scrollRef, contentRef, followLatest, pauseFollowing };
}
