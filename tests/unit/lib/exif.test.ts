import { describe, it, expect } from 'vitest';
import { wgs84ToGcj02, parseExifGps } from '@/lib/exif';

describe('wgs84ToGcj02', () => {
  it('converts WGS84 to GCJ02 for coordinates within China', () => {
    const [lng, lat] = wgs84ToGcj02(116.397428, 39.90923);
    expect(lng).toBeGreaterThan(116.39);
    expect(lng).toBeLessThan(116.41);
    expect(lat).toBeGreaterThan(39.90);
    expect(lat).toBeLessThan(39.92);
  });

  it('returns same coordinates for outside China', () => {
    const [lng, lat] = wgs84ToGcj02(0, 0);
    expect(lng).toBe(0);
    expect(lat).toBe(0);
  });
});

describe('parseExifGps', () => {
  it('returns null for non-JPEG file', async () => {
    const pngFile = new File(['not a jpeg'], 'test.png', { type: 'image/png' });
    const result = await parseExifGps(pngFile);
    expect(result).toBeNull();
  });
});
