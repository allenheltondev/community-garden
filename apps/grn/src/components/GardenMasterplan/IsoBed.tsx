import { memo, type ReactNode } from 'react';
import type { GardenBed, GrowerCropItem } from '../../types/listing';
import { CROP_ICON_PATHS } from '../CropPlanner/cropIconPaths';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { bedFootprint } from './footprints';
import {
  boundsOf,
  extrude,
  hashSeed,
  insetFootprint,
  project,
  projectFootprint,
  rotateWorld,
  scaleFootprint,
  smoothClosedPath,
  toPath,
  worldCentroid,
  type WorldPoint,
} from './iso';
import { SCENE, bedPalette, mute, shade, tint } from './palette';

const RAISED_BED_HEIGHT = 11;
const IN_GROUND_HEIGHT = 2.5;
const MAX_CROPS = 5;
const CROP_SPACING_INCHES = 15;

// Evenly spaced world positions along the bed's long axis where crop
// silhouettes stand. Returned in north-to-south order so the upright
// billboards overlap correctly when projected.
function cropAnchors(bed: GardenBed, footprint: WorldPoint[], count: number): WorldPoint[] {
  if (count === 0) return [];
  const centroid = worldCentroid(footprint);
  const length = bed.lengthInches ?? 96;
  const width = bed.widthInches ?? 48;
  const alongX = length >= width;
  const axis = rotateWorld(
    [{ x: alongX ? 1 : 0, y: alongX ? 0 : 1 }],
    0,
    0,
    bed.rotationDeg
  )[0];
  const extent = Math.max(length, width);
  const usable = Math.max(0, extent - 18);
  const span = Math.min(usable, (count - 1) * CROP_SPACING_INCHES);
  const anchors: WorldPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = count === 1 ? 0 : -span / 2 + (span / (count - 1)) * i;
    anchors.push({
      x: centroid.x + axis.x * offset,
      y: centroid.y + axis.y * offset,
    });
  }
  return anchors.sort((a, b) => a.x + a.y - (b.x + b.y));
}

interface IsoBedProps {
  bed: GardenBed;
  crops: GrowerCropItem[];
  isSelected: boolean;
}

/**
 * Pure SVG illustration of one bed: a flat-shaded extruded volume (or
 * contoured mound), a soil surface, standing crop silhouettes, a soft
 * ground shadow, and the name label. Interaction lives in the IsoElement
 * wrapper; this component only draws.
 */
export const IsoBed = memo(function IsoBed({ bed, crops, isSelected }: IsoBedProps) {
  const footprint = bedFootprint(bed);
  const palette = bedPalette(bed.bedType, bed.color);
  const height =
    bed.bedType === 'raised'
      ? RAISED_BED_HEIGHT
      : bed.bedType === 'mound'
        ? 0
        : IN_GROUND_HEIGHT;

  const shadowPath = toPath(
    projectFootprint(footprint, 0).map((p) => ({ x: p.x + 6, y: p.y + 4 }))
  );

  let body: ReactNode;
  let surfaceZ = height;

  if (bed.bedType === 'mound') {
    // Mounds render as stacked contour blobs instead of hard walls.
    const layers: Array<{ scale: number; z: number; fill: string }> = [
      { scale: 1, z: 0, fill: shade(SCENE.soil, 0.18) },
      { scale: 0.7, z: 4, fill: SCENE.soil },
      { scale: 0.42, z: 8, fill: tint(SCENE.soil, 0.16) },
    ];
    surfaceZ = 8;
    body = (
      <>
        {layers.map((layer, idx) => (
          <path
            key={idx}
            d={smoothClosedPath(
              projectFootprint(scaleFootprint(footprint, layer.scale), layer.z)
            )}
            fill={layer.fill}
          />
        ))}
      </>
    );
  } else {
    const solid = extrude(footprint, height);
    const soil = insetFootprint(footprint, bed.bedType === 'raised' ? 3.5 : 1.5);
    body = (
      <>
        {solid.walls.map((wall, idx) => (
          <path
            key={idx}
            d={toPath(wall.points)}
            fill={wall.facing === 'right' ? palette.frame.right : palette.frame.left}
          />
        ))}
        <path d={toPath(solid.top)} fill={palette.frame.top} />
        <path
          d={toPath(projectFootprint(soil, height))}
          fill={palette.soilTop}
          stroke={palette.soilEdge}
          strokeWidth={1}
        />
      </>
    );
  }

  const visibleCrops = crops.slice(0, MAX_CROPS);
  const overflow = crops.length - visibleCrops.length;
  const anchors = cropAnchors(bed, footprint, visibleCrops.length);

  const baseScreen = projectFootprint(footprint, 0);
  const bounds = boundsOf(baseScreen);
  const labelAnchor = project(
    worldCentroid(footprint).x,
    worldCentroid(footprint).y,
    0
  );

  // Stagger crop rows slightly so dense plantings read as planting, not
  // a picket line. Deterministic per bed.
  const jitter = hashSeed(bed.id) * 4 - 2;

  return (
    <>
      <path className="mp-el__shadow" d={shadowPath} fill={SCENE.elementShadow} />
      {body}
      {visibleCrops.map((crop, idx) => {
        const anchor = anchors[idx];
        if (!anchor) return null;
        const visual = visualForCrop(crop.cropName);
        const p = project(anchor.x, anchor.y, surfaceZ);
        const k = 1.05;
        return (
          <g key={crop.id} className="mp-crop">
            <ellipse
              cx={p.x}
              cy={p.y + 1}
              rx={7}
              ry={2.6}
              fill={SCENE.elementShadowSoft}
            />
            <path
              d={CROP_ICON_PATHS[visual.iconKey]}
              fill={mute(visual.accent, 0.22)}
              transform={`translate(${p.x - 12 * k + jitter} ${p.y - 23 * k}) scale(${k})`}
            />
          </g>
        );
      })}
      {overflow > 0 && (
        <text
          className="mp-label mp-label--count"
          x={bounds.maxX + 6}
          y={(bounds.minY + bounds.maxY) / 2}
        >
          +{overflow}
        </text>
      )}
      <text className="mp-label" x={labelAnchor.x} y={bounds.maxY + 13} textAnchor="middle">
        {bed.name}
      </text>
      {isSelected && (
        <path
          className="mp-el__ring"
          d={toPath(projectFootprint(scaleFootprint(footprint, 1.12), 0))}
          fill="none"
          stroke={SCENE.selection}
          strokeWidth={1.8}
          strokeDasharray="5 4"
        />
      )}
    </>
  );
});
