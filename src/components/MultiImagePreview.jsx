import { useState, useEffect, useCallback, useRef } from 'react';
import { T } from '../lib/constants';
import { useWindowSize } from '../lib/useWindowSize';

// Renders 1-N images in a Twitter/Instagram-style composition grid.
//   1   → single full-bleed
//   2   → 1×2 split
//   3   → big feature on the left, two stacked on the right
//   4   → 2×2 grid
//   5+  → 2×2 grid with "+N more" overlay on the 4th tile
// Click any tile to open a lightbox with arrow / swipe navigation.

function Tile({ url, alt, onClick, overlay, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
        cursor: 'pointer',
        ...style,
      }}
    >
      <img
        src={url}
        alt={alt || ''}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {overlay && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 28, fontWeight: 700,
          fontFamily: 'inherit',
        }}>
          {overlay}
        </div>
      )}
    </div>
  );
}

function Lightbox({ urls, index, onClose, onIndex }) {
  const total = urls.length;

  const prev = useCallback(() => onIndex((index - 1 + total) % total), [index, total, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % total), [index, total, onIndex]);

  // Body-overflow lock — runs once on mount, restores once on unmount.
  // Capturing prevOverflow inside the keyboard effect would re-run on
  // index change and snapshot 'hidden' as the "previous" value.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Keyboard nav uses refs so the listener doesn't have to re-bind on
  // every index change.
  const prevRef = useRef(prev), nextRef = useRef(next), closeRef = useRef(onClose);
  prevRef.current  = prev;
  nextRef.current  = next;
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     closeRef.current();
      if (e.key === 'ArrowLeft')  prevRef.current();
      if (e.key === 'ArrowRight') nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 40, height: 40, borderRadius: '50%',
          border: 'none', background: 'rgba(255,255,255,.12)',
          color: '#fff', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}
      >✕</button>

      {total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              width: 44, height: 44, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,.12)',
              color: '#fff', fontSize: 22, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >‹</button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next"
            style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              width: 44, height: 44, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,.12)',
              color: '#fff', fontSize: 22, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >›</button>
        </>
      )}

      <img
        src={urls[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '90vh',
          objectFit: 'contain',
          boxShadow: '0 6px 40px rgba(0,0,0,.45)',
        }}
      />

      {total > 1 && (
        <div style={{
          position: 'absolute', bottom: 18, left: 0, right: 0,
          textAlign: 'center', color: 'rgba(255,255,255,.75)',
          fontSize: 12, fontWeight: 600,
        }}>
          {index + 1} / {total}
        </div>
      )}
    </div>
  );
}

export default function MultiImagePreview({ urls = [], onClickThumb }) {
  const { isMobile } = useWindowSize();
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  if (!urls.length) return null;

  const open = (i) => {
    if (onClickThumb) onClickThumb(i);
    else              setLightboxIndex(i);
  };

  const gridHeight = isMobile ? 280 : 360;
  const gap = 2;
  const radius = 12;
  const containerStyle = {
    margin: '8px 0',
    borderRadius: radius,
    overflow: 'hidden',
    border: `1px solid ${T.bdr}`,
  };

  const n = urls.length;

  let body;
  if (n === 1) {
    body = (
      <Tile
        url={urls[0]}
        onClick={() => open(0)}
        style={{
          width: '100%',
          maxHeight: isMobile ? 360 : 520,
          minHeight: 200,
          aspectRatio: '16 / 10',
        }}
      />
    );
  } else if (n === 2) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, height: gridHeight }}>
        <Tile url={urls[0]} onClick={() => open(0)} style={{ width: '100%', height: '100%' }}/>
        <Tile url={urls[1]} onClick={() => open(1)} style={{ width: '100%', height: '100%' }}/>
      </div>
    );
  } else if (n === 3) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap, height: gridHeight }}>
        <Tile url={urls[0]} onClick={() => open(0)} style={{ width: '100%', height: '100%' }}/>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap }}>
          <Tile url={urls[1]} onClick={() => open(1)} style={{ width: '100%', height: '100%' }}/>
          <Tile url={urls[2]} onClick={() => open(2)} style={{ width: '100%', height: '100%' }}/>
        </div>
      </div>
    );
  } else {
    // 4 or 5+: 2×2 grid; if more than 4, last tile gets a "+N" overlay.
    const extra = n - 4;
    body = (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap, height: gridHeight,
      }}>
        <Tile url={urls[0]} onClick={() => open(0)} style={{ width: '100%', height: '100%' }}/>
        <Tile url={urls[1]} onClick={() => open(1)} style={{ width: '100%', height: '100%' }}/>
        <Tile url={urls[2]} onClick={() => open(2)} style={{ width: '100%', height: '100%' }}/>
        <Tile
          url={urls[3]}
          onClick={() => open(3)}
          overlay={extra > 0 ? `+${extra}` : null}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    );
  }

  return (
    <>
      <div style={containerStyle}>{body}</div>
      {lightboxIndex >= 0 && (
        <Lightbox
          urls={urls}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(-1)}
        />
      )}
    </>
  );
}
