import { useState, useEffect } from 'react';

/**
 * Returns { isMobile: true } when viewport width is below 768px.
 * Updates live on window resize.
 */
export function useWindowSize() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return { isMobile };
}
