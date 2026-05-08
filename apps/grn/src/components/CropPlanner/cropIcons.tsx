import type { CSSProperties } from 'react';
import { CROP_ICON_PATHS, type CropIconKey } from './cropIconPaths';

interface CropIconProps {
  iconKey: CropIconKey;
  /** Pixel or CSS length passed to the <svg> width/height. Defaults to 1em so it follows surrounding font-size. */
  size?: number | string;
  /** Stroke color. Defaults to currentColor so it inherits from CSS. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** When provided, the icon is exposed as an `img` with this label. Otherwise it is hidden from assistive tech. */
  title?: string;
}

export function CropIcon({
  iconKey,
  size = '1em',
  color = 'currentColor',
  className,
  style,
  title,
}: CropIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d={CROP_ICON_PATHS[iconKey]} />
    </svg>
  );
}
