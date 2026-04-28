import { useState, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { T } from '../lib/constants';
import Btn from './Btn';

// Square crop with circular preview. Returns a 512×512 cropped File (same
// MIME type as the input) via onConfirm. The output is wrapped in a File
// (not a raw Blob) so the existing uploadAvatar helpers — which read
// `file.name`, `file.type`, `file.size` — keep working unchanged.

const OUTPUT_SIZE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function getCroppedFile(imageSrc, pixelCrop, originalFile) {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width  = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
  );
  const mime = originalFile.type && originalFile.type.startsWith('image/') ? originalFile.type : 'image/jpeg';
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92));
  if (!blob) throw new Error("Couldn't process image");
  // Preserve the original filename so the upload path heuristics keep working.
  return new File([blob], originalFile.name || 'avatar.jpg', { type: blob.type });
}

export default function AvatarCropModal({
  file,
  onConfirm,
  onCancel,
  title = 'Adjust photo',
  helper = 'Drag to position, scroll to zoom.',
}) {
  const [imageSrc,        setImageSrc]        = useState(null);
  const [crop,            setCrop]            = useState({ x: 0, y: 0 });
  const [zoom,            setZoom]            = useState(1);
  const [croppedArea,     setCroppedArea]     = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setImageSrc(reader.result);
    reader.onerror = () => setError("Couldn't read the image file.");
    reader.readAsDataURL(file);
  }, [file]);

  const onCropComplete = useCallback((_, pixels) => setCroppedArea(pixels), []);

  const confirm = async () => {
    if (!imageSrc || !croppedArea || saving) return;
    setSaving(true);
    setError('');
    try {
      const cropped = await getCroppedFile(imageSrc, croppedArea, file);
      await onConfirm(cropped);
    } catch (e) {
      setError(e.message || 'Crop failed.');
      setSaving(false);
    }
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(27,29,54,.55)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:3000, fontFamily:"'DM Sans',sans-serif", padding:16,
    }}>
      <div style={{
        background:T.w, borderRadius:14, maxWidth:520, width:'100%',
        boxShadow:'0 8px 40px rgba(0,0,0,.18)', overflow:'hidden',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.bdr}` }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:T.text }}>
            {title}
          </div>
          <div style={{ fontSize:12, color:T.mu, marginTop:2 }}>{helper}</div>
        </div>

        <div style={{ position:'relative', width:'100%', height:340, background:'#000' }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div style={{ padding:'14px 20px', borderTop:`1px solid ${T.bdr}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <span style={{ fontSize:12, color:T.mu, minWidth:36 }}>Zoom</span>
            <input
              type="range"
              min={1} max={3} step={0.01}
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              style={{ flex:1, accentColor: T.v }}
            />
          </div>

          {error && (
            <div style={{ fontSize:12.5, color:T.ro, marginBottom:8 }}>⚠️ {error}</div>
          )}

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Btn onClick={onCancel} disabled={saving}>Cancel</Btn>
            <button
              onClick={confirm}
              disabled={!croppedArea || saving}
              style={{
                padding:'8px 18px', borderRadius:9, border:'none',
                background: croppedArea && !saving ? T.v : T.bdr,
                color: croppedArea && !saving ? '#fff' : T.mu,
                cursor: croppedArea && !saving ? 'pointer' : 'default',
                fontSize:13, fontWeight:700, fontFamily:'inherit',
              }}
            >
              {saving ? 'Saving…' : 'Save photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
