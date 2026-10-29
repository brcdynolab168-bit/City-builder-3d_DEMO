// ---------------------------------------------------------------
// แผนที่ย่อ (minimap): พื้นดิน/น้ำ + ถนน + อาคาร + กรอบมุมกล้อง คลิก/ลากเพื่อย้ายกล้อง
// ---------------------------------------------------------------
const COL = {
  road: '#c9ced6', res: '#6fd58a', com: '#4aa3ff', ind: '#f5c542', service: '#c58bff', park: '#2f9e57', farm: '#b7d94a',
  power: '#ff9a4a', water: '#3ecbd4', part: null,
};
export function createMinimap(canvas, { N, isWater, heightAt, onPick }) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width, px = S / N;
  // ชั้นภูมิประเทศวาดครั้งเดียว
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const b = base.getContext('2d');
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (isWater(x, z)) b.fillStyle = '#1d5f8a';
    else {
      const h = Math.min(1, Math.max(0, heightAt(x, z) / 6));
      const g = Math.round(110 + 70 * (1 - h)), r = Math.round(70 + 90 * h), bl = Math.round(60 + 60 * h);
      b.fillStyle = `rgb(${r},${g},${bl})`;
    }
    b.fillRect(x * px, z * px, px + 0.5, px + 0.5);
  }
  let cache = null;
  function drawTiles(tiles) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    for (let i = 0; i < tiles.length; i++) {
      const tl = tiles[i];
      if (!tl) continue;
      const k = tl.t === 'part' ? (tiles[tl.m]?.t || null) : tl.t;
      const col = COL[k];
      if (!col) continue;
      g.fillStyle = col;
      const x = i % N, z = Math.floor(i / N);
      if (k === 'road') g.fillRect(x * px + px * 0.15, z * px + px * 0.15, px * 0.7, px * 0.7);
      else g.fillRect(x * px, z * px, px, px);
    }
    cache = c;
  }
  // cam: { x, z } ตำแหน่งที่มองใน world (ศูนย์กลางแผนที่ = 0), size = ครึ่งความกว้างโดยประมาณ, ang = มุมกล้อง
  function render(cam) {
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(cache || base, 0, 0);
    if (!cam) return;
    const cx = (cam.x + N / 2) * px, cz = (cam.z + N / 2) * px, r = cam.size * px;
    ctx.save();
    ctx.translate(cx, cz); ctx.rotate(-cam.ang);
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6;
    ctx.strokeRect(-r * 1.2, -r * 0.8, r * 2.4, r * 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-r * 1.2, -r * 0.8, r * 2.4, r * 1.6);
    ctx.restore();
  }
  let drag = false;
  const pick = e => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * N - N / 2, z = ((e.clientY - r.top) / r.height) * N - N / 2;
    onPick(Math.max(-N / 2, Math.min(N / 2, x)), Math.max(-N / 2, Math.min(N / 2, z)));
  };
  canvas.addEventListener('pointerdown', e => { drag = true; canvas.setPointerCapture?.(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', e => { if (drag) pick(e); });
  canvas.addEventListener('pointerup', () => { drag = false; });
  return { drawTiles, render };
}
