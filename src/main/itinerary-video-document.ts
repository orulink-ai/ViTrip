import type { TimedVideoScene } from '../shared/itinerary-video';

/** Pure canvas scenes: rendered into the movie, never a capture of the app or its map. */
function drawVideoFrame(scenes: TimedVideoScene[], time: number) {
  const canvas = document.querySelector('canvas')!;
  const c = canvas.getContext('2d')!;
  const scene = scenes.find((s) => time < s.start + s.duration) ?? scenes.at(-1)!;
  const sceneIndex = scenes.indexOf(scene);
  const elapsed = Math.max(0, time - scene.start);
  const progress = Math.min(1, elapsed / scene.duration);
  const reveal = Math.min(1, elapsed / 0.8);
  const ease = 1 - Math.pow(1 - reveal, 3);
  const total = scenes.at(-1)!.start + scenes.at(-1)!.duration;
  c.fillStyle = '#111111';
  c.fillRect(0, 0, 1280, 720);
  c.strokeStyle = '#9b9b9b';
  c.lineWidth = 2;
  function text(
    value: string,
    x: number,
    y: number,
    size: number,
    color = '#eeeeee',
    max = 1080,
    maxLines = 5,
  ) {
    c.font = `${size}px -apple-system, "PingFang SC", sans-serif`;
    c.fillStyle = color;
    c.textAlign = 'left';
    let line = '',
      n = 0;
    for (const ch of value) {
      if (ch === '\n' || c.measureText(line + ch).width > max) {
        c.fillText(line, x, y + n * size * 1.45);
        line = ch === '\n' ? '' : ch;
        n++;
        if (n >= maxLines) return;
      } else line += ch;
    }
    c.fillText(line, x, y + n * size * 1.45);
  }
  function line(x1: number, y1: number, x2: number, y2: number, p = 1) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
    c.stroke();
  }
  function icon(kind: string | undefined, title: string, x: number, y: number, scale: number) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.strokeStyle = '#eeeeee';
    c.lineWidth = 2;
    if (kind === 'transport' && /车|巴士|bus/i.test(title)) {
      c.strokeRect(-30, -18, 60, 37);
      c.strokeRect(-22, -10, 16, 13);
      c.strokeRect(4, -10, 18, 13);
      c.beginPath();
      c.arc(-18, 23, 7, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(18, 23, 7, 0, Math.PI * 2);
      c.stroke();
    } else if (kind === 'transport' && /转机|行李/.test(title)) {
      c.strokeRect(-22, -20, 44, 48);
      c.strokeRect(-8, -30, 16, 10);
      line(-12, -12, -12, 20);
      line(12, -12, 12, 20);
    } else if (kind === 'transport') {
      c.beginPath();
      c.moveTo(-30, 8);
      c.lineTo(-6, 0);
      c.lineTo(-6, -24);
      c.lineTo(0, -30);
      c.lineTo(6, -24);
      c.lineTo(6, 0);
      c.lineTo(30, 8);
      c.lineTo(30, 14);
      c.lineTo(6, 9);
      c.lineTo(6, 25);
      c.lineTo(15, 30);
      c.lineTo(15, 34);
      c.lineTo(0, 30);
      c.lineTo(-15, 34);
      c.lineTo(-15, 30);
      c.lineTo(-6, 25);
      c.lineTo(-6, 9);
      c.lineTo(-30, 14);
      c.closePath();
      c.stroke();
    } else if (kind === 'stay') {
      line(-28, -8, 0, -30);
      line(0, -30, 28, -8);
      line(-22, -12, -22, 28);
      line(22, -12, 22, 28);
      line(-22, 28, 22, 28);
      c.strokeRect(-7, 7, 14, 21);
      c.strokeRect(-13, -7, 8, 8);
      c.strokeRect(5, -7, 8, 8);
    } else if (kind === 'meal') {
      line(-15, -27, -15, 28);
      line(-25, -27, -25, -8);
      line(-5, -27, -5, -8);
      line(-25, -8, -5, -8);
      line(15, -27, 15, 28);
      c.beginPath();
      c.ellipse(15, -14, 10, 15, 0, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(0, -7, 23, Math.PI * 0.15, Math.PI * 0.85, true);
      c.lineTo(0, 30);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.arc(0, -7, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  text('ViTrip / 行程动画短片', 70, 46, 18, '#aaaaaa');
  text(`${sceneIndex + 1} / ${scenes.length}`, 1120, 46, 18, '#aaaaaa', 140, 1);
  c.save();
  c.globalAlpha = ease;
  text(scene.title, 70, 106 + (1 - ease) * 16, 34, '#ffffff', 1110, 2);
  c.restore();
  if (scene.kind === 'stop') {
    const from = Math.max(0, Math.min(scene.activeIndex - 1, scene.stops.length - 3));
    const visible = scene.stops.slice(from, from + 3);
    visible.forEach((stop, i) => {
      const x = 230 + i * 410,
        y = 265;
      const active = stop === scene.stops[scene.activeIndex];
      if (i > 0) {
        c.strokeStyle = '#555555';
        line(x - 335, y, x - 75, y);
        c.strokeStyle = '#eeeeee';
        line(x - 335, y, x - 75, y, Math.min(1, elapsed / 2));
        if (active) {
          const px = x - 335 + 260 * Math.min(1, elapsed / 2);
          c.beginPath();
          c.arc(px, y, 5, 0, Math.PI * 2);
          c.fillStyle = '#ffffff';
          c.fill();
        }
      }
      c.strokeStyle = active ? '#ffffff' : '#555555';
      c.beginPath();
      c.arc(x, y, active ? 58 + 4 * Math.sin(Math.min(elapsed, 1) * Math.PI) : 46, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = active ? 1 : 0.45;
      icon(stop.kind, stop.title, x, y - 4, active ? 1 : 0.75);
      text(stop.title, x - 140, 350, 20, active ? '#ffffff' : '#999999', 280, 2);
      text(
        `${stop.time}${stop.optional || stop.optionGroup ? ' · 备选' : ''}`,
        x - 140,
        410,
        18,
        '#aaaaaa',
        280,
        2,
      );
      c.globalAlpha = 1;
    });
    c.strokeStyle = '#444444';
    line(70, 460, 1210, 460);
    const chunks = scene.caption.match(/[^。；！？\n]+[。；！？]?/g) ?? [scene.caption];
    const weights = chunks.reduce((sum, s) => sum + s.length, 0);
    let count = 0;
    const chunk =
      chunks.find((s) => {
        count += s.length;
        return progress < count / weights;
      }) ?? chunks.at(-1)!;
    text(chunk, 90, 515, 28, '#eeeeee', 1100, 3);
  } else {
    const max = scene.stops.length;
    const columns = Math.min(4, max);
    const rows = Math.ceil(max / columns);
    const gapY = Math.min(110, 320 / rows);
    scene.stops.forEach((stop, i) => {
      const appear = Math.min(1, Math.max(0, (elapsed - i * 0.12) * 2));
      c.globalAlpha = appear;
      const x = 100 + (i % columns) * 300;
      const y = 200 + Math.floor(i / columns) * gapY;
      c.strokeStyle = '#666666';
      c.beginPath();
      c.arc(x + 15, y, 15, 0, Math.PI * 2);
      c.stroke();
      text(String(i + 1), x + 8, y + 6, 16);
      text(stop.title, x + 42, y + 4, 18, '#eeeeee', 235, 2);
      text(
        stop.optional || stop.optionGroup ? '备选' : stop.time,
        x + 42,
        y + 50,
        15,
        '#aaaaaa',
        235,
        1,
      );
      c.globalAlpha = 1;
    });
    text(scene.caption, 90, 580, 24, '#bbbbbb', 1100, 2);
  }
  c.fillStyle = '#555555';
  c.fillRect(70, 680, 1140, 2);
  c.fillStyle = '#eeeeee';
  c.fillRect(70, 680, 1140 * Math.min(1, time / total), 2);
  text('依据已保存行程 · 待确认事项保留原标注', 70, 708, 14, '#888888');
  text(
    `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`,
    1150,
    708,
    14,
    '#888888',
    100,
    1,
  );
}
export function itineraryVideoDocument(scenes: TimedVideoScene[]): string {
  const data = JSON.stringify(scenes).replaceAll('<', '\\u003c');
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>body{margin:0;background:#111}canvas{display:block;width:1280px;height:720px}</style><canvas width="1280" height="720"></canvas><script>const scenes=${data};window.renderVideoFrame=(time)=>{(${drawVideoFrame.toString()})(scenes,time);return document.querySelector('canvas').toDataURL('image/png').split(',')[1]};window.renderVideoFrame(0);</script>`;
}
