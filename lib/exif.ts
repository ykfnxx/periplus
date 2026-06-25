import EXIF from 'exif-js';

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(lng: number, lat: number): number {
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * PI) +
      300.0 * Math.sin((lng / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (
    lng < 72.004 ||
    lng > 137.8347 ||
    lat < 0.8293 ||
    lat > 55.8271
  ) {
    return [lng, lat];
  }

  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatOut = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const dLngOut = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLngOut, lat + dLatOut];
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 从 File 对象解析 EXIF GPS 信息
 * 使用 exif-js 的 readFromBinaryFile 直接读取二进制数据，避免 Image 元素异步加载问题
 */
export async function parseExifGps(
  file: File
): Promise<{ lat: number; lng: number } | null> {
  // exif-js only supports JPEG/TIFF
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) {
    return null;
  }

  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (!exifData) {
      return null;
    }

    const latRef = exifData.GPSLatitudeRef as string | undefined;
    const lngRef = exifData.GPSLongitudeRef as string | undefined;
    const latArr = exifData.GPSLatitude as [number, number, number] | undefined;
    const lngArr = exifData.GPSLongitude as [number, number, number] | undefined;

    if (!latRef || !lngRef || !latArr || !lngArr) {
      return null;
    }

    const lat =
      (latArr[0] + latArr[1] / 60 + latArr[2] / 3600) *
      (latRef === 'N' ? 1 : -1);
    const lng =
      (lngArr[0] + lngArr[1] / 60 + lngArr[2] / 3600) *
      (lngRef === 'E' ? 1 : -1);

    return { lat, lng };
  } catch {
    return null;
  }
}
