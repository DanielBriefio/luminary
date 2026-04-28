import { useState, useRef, useEffect } from 'react';
import { T } from '../lib/constants';

// Drag-to-reposition cover image preview. The frame matches the actual
// display crop (so what you see while dragging is what readers will see).
// Tracks vertical position only — horizontal stays centred. Returns the
// chosen Y as a 0–100 percentage; the caller stores it as
// `object-position: 50% Y%`.
//
// Used by:
//   - NewPostScreen (deep-dive cover, height 200)
//   - GroupProfile (group cover, height 160)
//
// Touch + mouse supported.
export default function CoverRepositioner({
  url, y, onChange, onDragEnd,
  height = 200, onRemove,
  hint = '↕ Drag to reposition',
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, posY: 50 });

  const begin = (clientY) => {
    startRef.current = { y: clientY, posY: y };
    setDragging(true);
  };
  const move = (clientY) => {
    if (!dragging) return;
    const dy = clientY - startRef.current.y;
    // Drag down → reveal upper part of the image (Y% toward 0).
    // `height` pixels of drag ≈ 100% shift.
    const next = Math.max(0, Math.min(100, startRef.current.posY - (dy / height) * 100));
    onChange(next);
  };
  const end = () => {
    if (!dragging) return;
    setDragging(false);
    onDragEnd?.();
  };

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e) => move(e.clientY);
    const onTouchMove = (e) => { if (e.touches[0]) move(e.touches[0].clientY); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchend', end);
    };
  }); // eslint-disable-line

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative', width: '100%', height,
          borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${T.bdr}`, background: T.s2,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none', touchAction: 'none',
        }}
        onMouseDown={(e) => { e.preventDefault(); begin(e.clientY); }}
        onTouchStart={(e) => { if (e.touches[0]) begin(e.touches[0].clientY); }}
      >
        <img src={url} alt="" draggable={false}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: `50% ${y}%`,
            display: 'block', pointerEvents: 'none',
          }}/>
        {hint && (
          <div style={{
            position: 'absolute', left: 8, bottom: 8,
            background: 'rgba(0,0,0,.55)', color: '#fff',
            padding: '3px 9px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, pointerEvents: 'none',
          }}>
            {hint}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,.55)', color: '#fff',
            border: 'none', borderRadius: 20, padding: '4px 10px',
            fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          title="Remove cover image"
        >
          ✕ Remove
        </button>
      )}
    </div>
  );
}
