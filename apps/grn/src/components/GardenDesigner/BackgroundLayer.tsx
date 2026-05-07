import { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';

interface BackgroundLayerProps {
  src: string | null;
  widthInches: number;
  heightInches: number;
  pxPerInch: number;
  opacity: number; // 0..100
}

/**
 * Lightweight image loader for the optional satellite/yard photo. The
 * source URL is the CDN URL the API resolves on the canvas response.
 * Failures fall back silently — the rest of the canvas keeps rendering.
 */
export function BackgroundLayer({
  src,
  widthInches,
  heightInches,
  pxPerInch,
  opacity,
}: BackgroundLayerProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  // When the source changes (or is cleared), drop any prior image so we
  // don't keep showing a stale background while the next one loads.
  if (src === null && image !== null) {
    return null;
  }
  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={0}
      y={0}
      width={widthInches * pxPerInch}
      height={heightInches * pxPerInch}
      opacity={Math.max(0, Math.min(100, opacity)) / 100}
      listening={false}
    />
  );
}
