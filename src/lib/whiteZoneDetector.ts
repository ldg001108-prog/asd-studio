export interface WhiteZone { x: number; y: number; w: number; h: number }

export async function detectWhiteZones(imageSrc: string, minAreaRatio = 0.015): Promise<{ zones: WhiteZone[]; imgW: number; imgH: number }> {
  const res = await fetch(imageSrc);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('load failed')); };
    img.src = blobUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const W = canvas.width, H = canvas.height;
  const data = ctx.getImageData(0, 0, W, H).data;
  const G = 4, gw = Math.floor(W / G), gh = Math.floor(H / G);
  const bin: boolean[][] = [];

  for (let gy = 0; gy < gh; gy++) {
    bin[gy] = [];
    for (let gx = 0; gx < gw; gx++) {
      const i = ((gy * G) * W + (gx * G)) * 4;
      bin[gy][gx] = data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225;
    }
  }

  const labels: number[][] = Array.from({ length: gh }, () => new Array(gw).fill(0));
  let lc = 0;
  const comps = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>();

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!bin[y][x] || labels[y][x]) continue;
      lc++;
      const q: [number, number][] = [[x, y]];
      let mnX = x, mnY = y, mxX = x, mxY = y, cnt = 0;
      while (q.length) {
        const [cx, cy] = q.pop()!;
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh || !bin[cy][cx] || labels[cy][cx]) continue;
        labels[cy][cx] = lc; cnt++;
        if (cx < mnX) mnX = cx; if (cy < mnY) mnY = cy;
        if (cx > mxX) mxX = cx; if (cy > mxY) mxY = cy;
        q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      comps.set(lc, { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY, count: cnt });
    }
  }

  const zones: WhiteZone[] = [];
  const total = gw * gh;
  for (const [, c] of comps) {
    if (c.count / total < minAreaRatio) continue;
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (c.count / (bw * bh) < 0.5) continue;
    zones.push({ x: c.minX * G, y: c.minY * G, w: bw * G, h: bh * G });
  }
  zones.sort((a, b) => a.y - b.y || a.x - b.x);
  return { zones, imgW: W, imgH: H };
}

export async function compositeImageOnZone(
  baseSrc: string, overlaySrc: string, zone: WhiteZone
): Promise<string> {
  // Load base
  const bRes = await fetch(baseSrc);
  const bBlob = await bRes.blob();
  const bUrl = URL.createObjectURL(bBlob);
  const baseImg = new Image();
  await new Promise<void>(r => { baseImg.onload = () => { URL.revokeObjectURL(bUrl); r(); }; baseImg.src = bUrl; });

  // Load overlay
  const overlayImg = new Image();
  if (overlaySrc.startsWith('data:')) {
    await new Promise<void>(r => { overlayImg.onload = () => r(); overlayImg.src = overlaySrc; });
  } else {
    const oRes = await fetch(overlaySrc);
    const oBlob = await oRes.blob();
    const oUrl = URL.createObjectURL(oBlob);
    await new Promise<void>(r => { overlayImg.onload = () => { URL.revokeObjectURL(oUrl); r(); }; overlayImg.src = oUrl; });
  }

  const canvas = document.createElement('canvas');
  canvas.width = baseImg.naturalWidth;
  canvas.height = baseImg.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(baseImg, 0, 0);

  // Contain-fit: show full image centered, white fill for remaining space
  // First fill zone with white to clear placeholder text
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

  const zA = zone.w / zone.h;
  const iA = overlayImg.naturalWidth / overlayImg.naturalHeight;
  let dx = zone.x, dy = zone.y, dw = zone.w, dh = zone.h;

  if (iA > zA) {
    // Image is wider than zone → fit width, center vertically
    dh = zone.w / iA;
    dy = zone.y + (zone.h - dh) / 2;
  } else {
    // Image is taller than zone → fit height, center horizontally
    dw = zone.h * iA;
    dx = zone.x + (zone.w - dw) / 2;
  }

  ctx.drawImage(overlayImg, 0, 0, overlayImg.naturalWidth, overlayImg.naturalHeight, dx, dy, dw, dh);

  return canvas.toDataURL('image/jpeg', 0.92);
}
