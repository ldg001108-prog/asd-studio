import { useState, useRef, useEffect, useCallback } from 'react';

interface WhiteZone {
  x: number; y: number; w: number; h: number;
  uploadedSrc?: string;
}

interface Props {
  visible: boolean;
  imageSrc: string;
  onClose: () => void;
  onApply: (resultDataUrl: string) => void;
}

// Detect large white rectangular areas in an image
function detectWhiteAreas(canvas: HTMLCanvasElement, minAreaRatio = 0.015): WhiteZone[] {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;

  // Downscale for analysis
  const GRID = 4; // sample every 4 pixels
  const gw = Math.floor(W / GRID);
  const gh = Math.floor(H / GRID);
  const binary: boolean[][] = [];

  for (let gy = 0; gy < gh; gy++) {
    binary[gy] = [];
    for (let gx = 0; gx < gw; gx++) {
      const px = gx * GRID;
      const py = gy * GRID;
      const idx = (py * W + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      binary[gy][gx] = r > 225 && g > 225 && b > 225;
    }
  }

  // Connected component labeling
  const labels: number[][] = Array.from({ length: gh }, () => new Array(gw).fill(0));
  let labelCount = 0;
  const compPixels = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>();

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!binary[y][x] || labels[y][x] !== 0) continue;
      labelCount++;
      const label = labelCount;
      const queue: [number, number][] = [[x, y]];
      let minX = x, minY = y, maxX = x, maxY = y, count = 0;
      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
        if (!binary[cy][cx] || labels[cy][cx] !== 0) continue;
        labels[cy][cx] = label;
        count++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      compPixels.set(label, { minX, minY, maxX, maxY, count });
    }
  }

  const totalCells = gw * gh;
  const zones: WhiteZone[] = [];

  for (const [, comp] of compPixels) {
    const ratio = comp.count / totalCells;
    if (ratio < minAreaRatio) continue;
    // Check rectangularity
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    const rectRatio = comp.count / (bw * bh);
    if (rectRatio < 0.5) continue; // must be roughly rectangular

    zones.push({
      x: comp.minX * GRID,
      y: comp.minY * GRID,
      w: (comp.maxX - comp.minX + 1) * GRID,
      h: (comp.maxY - comp.minY + 1) * GRID,
    });
  }

  // Sort by position (top to bottom, left to right)
  zones.sort((a, b) => a.y - b.y || a.x - b.x);
  return zones;
}

export default function PhotoOverlayModal({ visible, imageSrc, onClose, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zones, setZones] = useState<WhiteZone[]>([]);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displayScale, setDisplayScale] = useState(1);
  const [applying, setApplying] = useState(false);

  const loadImage = useCallback(async () => {
    if (!visible || !imageSrc) return;
    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(); };
        img.src = blobUrl;
      });

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Calculate display scale to fit in viewport
      const maxDisplayW = Math.min(window.innerWidth * 0.8, 700);
      setDisplayScale(maxDisplayW / img.naturalWidth);

      const detected = detectWhiteAreas(canvas);
      setZones(detected);
    } catch (e) {
      console.error('Image load failed:', e);
    }
  }, [visible, imageSrc]);

  useEffect(() => { loadImage(); }, [loadImage]);
  useEffect(() => { if (!visible) { setZones([]); setImgSize({ w: 0, h: 0 }); } }, [visible]);

  const handleUpload = (zoneIdx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        setZones(prev => prev.map((z, i) =>
          i === zoneIdx ? { ...z, uploadedSrc: e.target?.result as string } : z
        ));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleRemove = (zoneIdx: number) => {
    setZones(prev => prev.map((z, i) =>
      i === zoneIdx ? { ...z, uploadedSrc: undefined } : z
    ));
  };

  const handleApply = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setApplying(true);

    try {
      const ctx = canvas.getContext('2d')!;
      // Redraw original image
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const baseImg = new Image();
      await new Promise<void>((resolve) => {
        baseImg.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        baseImg.src = blobUrl;
      });
      ctx.drawImage(baseImg, 0, 0);

      // Overlay each uploaded photo
      for (const zone of zones) {
        if (!zone.uploadedSrc) continue;
        const overlayImg = new Image();
        await new Promise<void>((resolve) => {
          overlayImg.onload = () => resolve();
          overlayImg.src = zone.uploadedSrc!;
        });
        // Draw uploaded image to fill the white zone area, cover-fit
        const zoneAspect = zone.w / zone.h;
        const imgAspect = overlayImg.naturalWidth / overlayImg.naturalHeight;
        let sx = 0, sy = 0, sw = overlayImg.naturalWidth, sh = overlayImg.naturalHeight;
        if (imgAspect > zoneAspect) {
          sw = overlayImg.naturalHeight * zoneAspect;
          sx = (overlayImg.naturalWidth - sw) / 2;
        } else {
          sh = overlayImg.naturalWidth / zoneAspect;
          sy = (overlayImg.naturalHeight - sh) / 2;
        }
        ctx.drawImage(overlayImg, sx, sy, sw, sh, zone.x, zone.y, zone.w, zone.h);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onApply(dataUrl);
    } catch (err) {
      console.error('Apply failed:', err);
      alert('합성 실패: ' + (err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const hasUploads = zones.some(z => z.uploadedSrc);

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 600 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-head">
          <h3 className="modal-title">📷 사진 삽입 — {zones.length}개 빈칸 감지</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px', position: 'relative' }}>
          {zones.length === 0 && imgSize.w > 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '0.85rem' }}>
              흰색 빈칸이 감지되지 않았습니다. AI 편집(✏️)을 사용해보세요.
            </div>
          )}
          <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: '8px',
              }}
            />
            {/* Upload zone overlays */}
            {zones.map((zone, i) => {
              const left = (zone.x / imgSize.w) * 100;
              const top = (zone.y / imgSize.h) * 100;
              const width = (zone.w / imgSize.w) * 100;
              const height = (zone.h / imgSize.h) * 100;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: zone.uploadedSrc ? '2px solid #2d7d46' : '2px dashed #d4af37',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: zone.uploadedSrc ? 'transparent' : 'rgba(212,175,55,0.08)',
                    transition: 'all 0.2s',
                    overflow: 'hidden',
                  }}
                  onClick={() => zone.uploadedSrc ? undefined : handleUpload(i)}
                >
                  {zone.uploadedSrc ? (
                    <>
                      <img
                        src={zone.uploadedSrc}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                        style={{
                          position: 'absolute', top: '4px', right: '4px',
                          background: 'rgba(0,0,0,0.7)', color: '#ff4444',
                          border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                          fontSize: '0.6rem', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >✕</button>
                    </>
                  ) : (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: '2px', color: '#d4af37', fontSize: '0.65rem', fontWeight: 700,
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>📷</span>
                      <span>클릭하여 업로드</span>
                      <span style={{ color: '#888', fontSize: '0.6rem' }}>#{i + 1}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          {hasUploads && (
            <button
              onClick={handleApply}
              disabled={applying}
              style={{
                display: 'block', width: '100%', marginTop: '12px',
                padding: '12px', border: 'none', borderRadius: '8px',
                background: applying ? '#555' : 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: applying ? '#999' : '#0a0a0a',
                fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700,
                cursor: applying ? 'not-allowed' : 'pointer',
              }}
            >
              {applying ? '합성 중...' : `✅ ${zones.filter(z => z.uploadedSrc).length}장 사진 합성 적용`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
