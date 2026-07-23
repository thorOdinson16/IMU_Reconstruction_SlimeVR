export function barChart(values: number[], maxValue: number, width: number, height: number, barColor = '#6c83ff', label = ''): string {
  if (values.length === 0) return '';
  const barW = Math.max(4, (width - 10) / values.length - 2);
  const gap = 2;
  const effectiveMax = maxValue > 0 ? maxValue : 1;
  const bars = values.map((v, i) => {
    const barH = Math.max(1, (v / effectiveMax) * (height - 10));
    const x = 5 + i * (barW + gap);
    const y = height - 5 - barH;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${barColor}" opacity="${0.4 + 0.6 * (v / effectiveMax)}"/>`;
  }).join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="${label}">${bars}</svg>`;
}

export function lineChart(values: number[], width: number, height: number, strokeColor = '#7aead5', label = ''): string {
  if (values.length < 2) return '';
  const padding = 4;
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const stepX = (width - padding * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((v - minV) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  const area = points.split(' ').map((p, i) => {
    if (i === 0) return `M${padding},${height - padding} L${p}`;
    if (i === values.length - 1) return `L${p} L${parseFloat(p.split(',')[0])},${height - padding} Z`;
    return `L${p}`;
  }).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="${label}">
    <path d="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${area}" fill="${strokeColor}" opacity="0.08"/>
  </svg>`;
}

export function progressRing(percent: number, size = 48, strokeWidth = 4, color = '#6c83ff'): string {
  const r = (size - strokeWidth) / 2;
  const c = Math.PI * 2 * r;
  const offset = c * (1 - Math.min(1, Math.max(0, percent)));
  const cx = size / 2;
  const cy = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${Math.round(percent * 100)}%">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${strokeWidth}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>
  </svg>`;
}

export function miniBar(value: number, maxValue: number, width = 80, height = 4, color = '#6c83ff'): string {
  const pct = maxValue > 0 ? Math.min(1, value / maxValue) : 0;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="2" fill="rgba(255,255,255,.06)"/><rect x="0" y="0" width="${width * pct}" height="${height}" rx="2" fill="${color}"/></svg>`;
}
