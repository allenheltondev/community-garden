import { memo, type ReactNode } from 'react';
import type { GardenAnnotation } from '../../types/listing';
import {
  PX_PER_INCH,
  boundsOf,
  ellipseFootprint,
  extrude,
  hashSeed,
  insetFootprint,
  polygonFootprint,
  project,
  projectFootprint,
  rectFootprint,
  rotateWorld,
  scaleFootprint,
  smoothClosedPath,
  smoothOpenPath,
  toPath,
  worldCentroid,
  type WorldPoint,
} from './iso';
import {
  BERRY_DOT,
  FOLIAGE,
  FOLIAGE_BERRY,
  FOLIAGE_FRUIT,
  FRUIT_DOT,
  SCENE,
  annotationKind,
  materialFrom,
  mute,
  shade,
  tint,
  type AnnotationKind,
} from './palette';

// Kinds that sit flush with the ground; the scene paints these before any
// extruded volume regardless of depth so beds and structures always sit
// on top of paths and water.
export const FLAT_KINDS: ReadonlySet<AnnotationKind> = new Set(['path', 'pond']);

function geometry(a: GardenAnnotation) {
  return {
    x: a.positionX ?? 12,
    y: a.positionY ?? 12,
    length: a.lengthInches ?? 48,
    width: a.widthInches ?? 48,
    rotationDeg: a.rotationDeg,
  };
}

export function annotationFootprint(a: GardenAnnotation): WorldPoint[] {
  const g = geometry(a);
  if (a.shape === 'line' && a.points && a.points.length >= 2) {
    return polygonFootprint({ x: g.x, y: g.y, points: a.points, rotationDeg: g.rotationDeg });
  }
  if (a.shape === 'circle') {
    return ellipseFootprint(g);
  }
  if (a.shape === 'polygon' && a.points && a.points.length >= 3) {
    return polygonFootprint({ x: g.x, y: g.y, points: a.points, rotationDeg: g.rotationDeg });
  }
  return rectFootprint(g);
}

// Structures (sheds, greenhouses, bins…) always build from an oriented
// rectangle so roof/wall construction has four predictable corners, even
// if the underlying record was created with another shape.
function structureCorners(a: GardenAnnotation): WorldPoint[] {
  return rectFootprint(geometry(a));
}

function avgRadius(footprint: WorldPoint[]): number {
  const c = worldCentroid(footprint);
  if (footprint.length === 0) return 12;
  const total = footprint.reduce((sum, p) => sum + Math.hypot(p.x - c.x, p.y - c.y), 0);
  return Math.max(8, total / footprint.length);
}

function groundShadow(footprint: WorldPoint[], spread = 1): ReactNode {
  const pts = projectFootprint(scaleFootprint(footprint, spread), 0).map((p) => ({
    x: p.x + 6,
    y: p.y + 4,
  }));
  return <path className="mp-el__shadow" d={smoothClosedPath(pts)} fill={SCENE.elementShadow} />;
}

// Slightly irregular n-gon for organic canopies; jitter is deterministic
// per element id so the illustration is stable across renders.
function organicRing(center: WorldPoint, radius: number, seed: number, segments = 8): WorldPoint[] {
  const points: WorldPoint[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 1 + (((seed * 997 + i * 131) % 23) / 23 - 0.5) * 0.22;
    points.push({
      x: center.x + Math.cos(angle) * radius * wobble,
      y: center.y + Math.sin(angle) * radius * wobble,
    });
  }
  return points;
}

// --- Kind renderers ---------------------------------------------------------

function renderCanopyPlant(
  a: GardenAnnotation,
  kind: 'tree' | 'fruitTree' | 'berryBush'
): ReactNode {
  const footprint = annotationFootprint(a);
  const c = worldCentroid(footprint);
  const r = avgRadius(footprint);
  const seed = hashSeed(a.id);

  const base =
    kind === 'tree'
      ? FOLIAGE[Math.floor(seed * FOLIAGE.length) % FOLIAGE.length]
      : kind === 'fruitTree'
        ? FOLIAGE_FRUIT
        : FOLIAGE_BERRY;

  const slices =
    kind === 'berryBush'
      ? [
          { scale: 1, z: r * 0.28, fill: shade(base, 0.16) },
          { scale: 0.62, z: r * 0.62, fill: tint(base, 0.08) },
        ]
      : [
          { scale: 1, z: r * 0.5, fill: shade(base, 0.18) },
          { scale: 0.74, z: r * 0.82, fill: base },
          { scale: 0.46, z: r * 1.08, fill: tint(base, 0.16) },
        ];

  const trunk =
    kind === 'berryBush'
      ? null
      : extrude(
          rectFootprint({
            x: c.x - Math.max(2, r * 0.09),
            y: c.y - Math.max(2, r * 0.09),
            length: Math.max(4, r * 0.18),
            width: Math.max(4, r * 0.18),
          }),
          r * 0.55
        );

  const dots: ReactNode[] = [];
  if (kind !== 'tree') {
    const dotFill = kind === 'fruitTree' ? FRUIT_DOT : BERRY_DOT;
    const count = kind === 'fruitTree' ? 5 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = seed * Math.PI * 2 + (i / count) * Math.PI * 2;
      const dist = r * (0.32 + ((seed * 31 + i * 17) % 10) / 28);
      const z = kind === 'fruitTree' ? r * 0.82 : r * 0.5;
      const p = project(c.x + Math.cos(angle) * dist, c.y + Math.sin(angle) * dist, z);
      dots.push(<circle key={i} cx={p.x} cy={p.y} r={2.3} fill={dotFill} />);
    }
  }

  return (
    <>
      {groundShadow(footprint, 1.05)}
      {trunk && (
        <>
          {trunk.walls.map((wall, idx) => (
            <path
              key={idx}
              d={toPath(wall.points)}
              fill={wall.facing === 'right' ? shade(SCENE.trunk, 0.12) : shade(SCENE.trunk, 0.3)}
            />
          ))}
        </>
      )}
      {slices.map((slice, idx) => (
        <path
          key={idx}
          d={smoothClosedPath(
            projectFootprint(organicRing(c, r * slice.scale, seed + idx), slice.z)
          )}
          fill={slice.fill}
        />
      ))}
      {dots}
    </>
  );
}

function renderPond(a: GardenAnnotation): ReactNode {
  const footprint = annotationFootprint(a);
  const c = worldCentroid(footprint);
  const ripple1 = projectFootprint(
    organicRing(c, avgRadius(footprint) * 0.34, hashSeed(a.id), 6),
    0
  );
  return (
    <>
      <path
        d={smoothClosedPath(projectFootprint(scaleFootprint(footprint, 1.12), 0))}
        fill={SCENE.sand}
      />
      <path
        d={smoothClosedPath(projectFootprint(footprint, 0))}
        fill={SCENE.water}
        stroke={SCENE.waterEdge}
        strokeWidth={1.2}
      />
      <path
        d={smoothClosedPath(projectFootprint(scaleFootprint(footprint, 0.68), 0))}
        fill={tint(SCENE.water, 0.2)}
      />
      <path
        d={smoothOpenPath(ripple1.slice(0, 4))}
        fill="none"
        stroke={tint(SCENE.water, 0.5)}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </>
  );
}

function renderPath(a: GardenAnnotation): ReactNode {
  const footprint = annotationFootprint(a);
  const projected = projectFootprint(footprint, 0);
  const d =
    a.shape === 'line'
      ? smoothOpenPath(projected)
      : smoothClosedPath(projected);
  const widthPx = Math.max(6, (a.widthInches ?? 12) * PX_PER_INCH * 0.9);
  if (a.shape !== 'line') {
    // Area paths (patios, gravel pads) fill their footprint instead.
    return (
      <path d={d} fill={SCENE.stone} stroke={SCENE.stoneEdge} strokeWidth={1.5} />
    );
  }
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={SCENE.stoneEdge}
        strokeWidth={widthPx + 3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={SCENE.stone}
        strokeWidth={widthPx}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

const FENCE_HEIGHT = 34;
const FENCE_POST_SPACING = 48;

function renderFence(a: GardenAnnotation): ReactNode {
  let line = annotationFootprint(a);
  // Rect fences enclose an area: walk the full perimeter.
  const closed = a.shape !== 'line';
  if (closed && line.length >= 3) line = [...line, line[0]];

  const posts: WorldPoint[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const aPt = line[i];
    const bPt = line[i + 1];
    const dist = Math.hypot(bPt.x - aPt.x, bPt.y - aPt.y);
    const count = Math.max(1, Math.round(dist / FENCE_POST_SPACING));
    for (let j = 0; j < count; j += 1) {
      const t = j / count;
      posts.push({ x: aPt.x + (bPt.x - aPt.x) * t, y: aPt.y + (bPt.y - aPt.y) * t });
    }
  }
  posts.push(line[line.length - 1]);

  const railTop = toPath(projectFootprint(line, FENCE_HEIGHT * 0.82), false);
  const railMid = toPath(projectFootprint(line, FENCE_HEIGHT * 0.45), false);

  return (
    <>
      <path
        d={toPath(projectFootprint(line, 0), false)}
        fill="none"
        stroke={SCENE.elementShadowSoft}
        strokeWidth={3}
      />
      {posts.map((p, idx) => {
        const bottom = project(p.x, p.y, 0);
        const top = project(p.x, p.y, FENCE_HEIGHT);
        return (
          <line
            key={idx}
            x1={bottom.x}
            y1={bottom.y}
            x2={top.x}
            y2={top.y}
            stroke={shade(SCENE.fence, 0.22)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
      <path d={railTop} fill="none" stroke={SCENE.fence} strokeWidth={1.6} />
      <path d={railMid} fill="none" stroke={SCENE.fence} strokeWidth={1.6} />
    </>
  );
}

interface RoofSpec {
  eaves: number;
  ridge: number;
  color: string;
  overhang: number;
}

// Gabled structure: extruded walls to the eaves plus two flat-shaded roof
// planes meeting at a ridge along the long axis.
function renderGabledStructure(
  a: GardenAnnotation,
  wallBase: string,
  roof: RoofSpec,
  extras?: (corners: WorldPoint[], eaves: number) => ReactNode
): ReactNode {
  const g = geometry(a);
  const corners = structureCorners(a);
  const walls = extrude(corners, roof.eaves);
  const material = materialFrom(wallBase);

  const alongX = g.length >= g.width;
  const ridgeEnds: WorldPoint[] = alongX
    ? [
        { x: g.x, y: g.y + g.width / 2 },
        { x: g.x + g.length, y: g.y + g.width / 2 },
      ]
    : [
        { x: g.x + g.length / 2, y: g.y },
        { x: g.x + g.length / 2, y: g.y + g.width },
      ];
  const [r0, r1] = rotateWorld(ridgeEnds, g.x, g.y, g.rotationDeg);

  const eaveCorners = scaleFootprint(corners, roof.overhang);
  const [c0, c1, c2, c3] = eaveCorners;
  // Plane A spans the first long edge to the ridge, plane B the ridge to
  // the opposite edge. With light from the north-west, A (the back/north
  // slope) reads lighter.
  const planeA = alongX ? [c0, c1] : [c1, c2];
  const planeB = alongX ? [c3, c2] : [c0, c3];

  const roofA = [
    project(planeA[0].x, planeA[0].y, roof.eaves),
    project(planeA[1].x, planeA[1].y, roof.eaves),
    project(r1.x, r1.y, roof.ridge),
    project(r0.x, r0.y, roof.ridge),
  ];
  const roofB = [
    project(r0.x, r0.y, roof.ridge),
    project(r1.x, r1.y, roof.ridge),
    project(planeB[1].x, planeB[1].y, roof.eaves),
    project(planeB[0].x, planeB[0].y, roof.eaves),
  ];

  return (
    <>
      {groundShadow(corners, 1.08)}
      {walls.walls.map((wall, idx) => (
        <path
          key={idx}
          d={toPath(wall.points)}
          fill={wall.facing === 'right' ? material.right : material.left}
        />
      ))}
      {extras?.(corners, roof.eaves)}
      <path d={toPath(roofA)} fill={tint(roof.color, 0.12)} />
      <path d={toPath(roofB)} fill={shade(roof.color, 0.14)} />
      <line
        x1={project(r0.x, r0.y, roof.ridge).x}
        y1={project(r0.x, r0.y, roof.ridge).y}
        x2={project(r1.x, r1.y, roof.ridge).x}
        y2={project(r1.x, r1.y, roof.ridge).y}
        stroke={tint(roof.color, 0.35)}
        strokeWidth={1.2}
      />
    </>
  );
}

// Door on the south-facing wall, drawn only when that wall faces the camera.
function doorExtra(doorColor: string) {
  return (corners: WorldPoint[], eaves: number): ReactNode => {
    const [, , c2, c3] = corners;
    const centroid = worldCentroid(corners);
    const mx = (c2.x + c3.x) / 2;
    const my = (c2.y + c3.y) / 2;
    if (mx - centroid.x + (my - centroid.y) <= 0) return null;
    const half = Math.min(0.2, 12 / Math.max(1, Math.hypot(c2.x - c3.x, c2.y - c3.y)));
    const d0 = { x: mx + (c3.x - c2.x) * half, y: my + (c3.y - c2.y) * half };
    const d1 = { x: mx + (c2.x - c3.x) * half, y: my + (c2.y - c3.y) * half };
    const doorHeight = eaves * 0.78;
    return (
      <path
        d={toPath([
          project(d0.x, d0.y, 0),
          project(d1.x, d1.y, 0),
          project(d1.x, d1.y, doorHeight),
          project(d0.x, d0.y, doorHeight),
        ])}
        fill={doorColor}
      />
    );
  };
}

function renderGreenhouse(a: GardenAnnotation): ReactNode {
  const corners = structureCorners(a);
  const plinth = extrude(corners, 4);
  return (
    <>
      {plinth.walls.map((wall, idx) => (
        <path
          key={idx}
          d={toPath(wall.points)}
          fill={wall.facing === 'right' ? shade(SCENE.wood, 0.1) : shade(SCENE.wood, 0.28)}
        />
      ))}
      <g className="mp-greenhouse-glass">
        {renderGabledStructure(
          a,
          SCENE.glass,
          { eaves: 62, ridge: 84, color: SCENE.glass, overhang: 1.04 },
          (cs, eaves) => {
            // Mullions on the two camera-facing walls.
            const lines: ReactNode[] = [];
            const visible = extrude(cs, eaves).walls;
            visible.forEach((wall, wIdx) => {
              const [b0, b1, t1, t0] = wall.points;
              for (let i = 1; i < 4; i += 1) {
                const t = i / 4;
                lines.push(
                  <line
                    key={`${wIdx}-${i}`}
                    x1={b0.x + (b1.x - b0.x) * t}
                    y1={b0.y + (b1.y - b0.y) * t}
                    x2={t0.x + (t1.x - t0.x) * t}
                    y2={t0.y + (t1.y - t0.y) * t}
                    stroke={SCENE.glassFrame}
                    strokeWidth={1}
                  />
                );
              }
            });
            return <>{lines}</>;
          }
        )}
      </g>
    </>
  );
}

const TRELLIS_HEIGHT = 66;

function renderTrellis(a: GardenAnnotation): ReactNode {
  const g = geometry(a);
  const alongX = g.length >= g.width;
  const ends: WorldPoint[] = alongX
    ? [
        { x: g.x, y: g.y + g.width / 2 },
        { x: g.x + g.length, y: g.y + g.width / 2 },
      ]
    : [
        { x: g.x + g.length / 2, y: g.y },
        { x: g.x + g.length / 2, y: g.y + g.width },
      ];
  const [e0, e1] = rotateWorld(ends, g.x, g.y, g.rotationDeg);
  const b0 = project(e0.x, e0.y, 0);
  const b1 = project(e1.x, e1.y, 0);
  const t0 = project(e0.x, e0.y, TRELLIS_HEIGHT);
  const t1 = project(e1.x, e1.y, TRELLIS_HEIGHT);

  const verticals: ReactNode[] = [];
  for (let i = 1; i < 4; i += 1) {
    const t = i / 4;
    verticals.push(
      <line
        key={i}
        x1={b0.x + (b1.x - b0.x) * t}
        y1={b0.y + (b1.y - b0.y) * t}
        x2={t0.x + (t1.x - t0.x) * t}
        y2={t0.y + (t1.y - t0.y) * t}
        stroke={SCENE.woodDark}
        strokeWidth={1.2}
      />
    );
  }
  const horizontals = [0.35, 0.7].map((f, idx) => (
    <line
      key={idx}
      x1={b0.x + (t0.x - b0.x) * f}
      y1={b0.y + (t0.y - b0.y) * f}
      x2={b1.x + (t1.x - b1.x) * f}
      y2={b1.y + (t1.y - b1.y) * f}
      stroke={SCENE.woodDark}
      strokeWidth={1.2}
    />
  ));

  return (
    <>
      <path
        d={toPath([b0, b1].map((p) => ({ x: p.x + 4, y: p.y + 3 })), false)}
        stroke={SCENE.elementShadowSoft}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={toPath([b0, b1, t1, t0])}
        fill="rgba(213, 227, 218, 0.18)"
        stroke={SCENE.wood}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {verticals}
      {horizontals}
    </>
  );
}

function renderCompost(a: GardenAnnotation): ReactNode {
  const corners = structureCorners(a);
  const height = 24;
  const bin = extrude(corners, height);
  const fill = insetFootprint(corners, 3);
  const seed = hashSeed(a.id);
  const c = worldCentroid(corners);
  return (
    <>
      {groundShadow(corners)}
      {bin.walls.map((wall, idx) => {
        const [b0, b1, t1, t0] = wall.points;
        return (
          <g key={idx}>
            <path
              d={toPath(wall.points)}
              fill={wall.facing === 'right' ? shade(SCENE.wood, 0.14) : shade(SCENE.wood, 0.32)}
            />
            {[0.33, 0.66].map((f, i) => (
              <line
                key={i}
                x1={b0.x + (t0.x - b0.x) * f}
                y1={b0.y + (t0.y - b0.y) * f}
                x2={b1.x + (t1.x - b1.x) * f}
                y2={b1.y + (t1.y - b1.y) * f}
                stroke={shade(SCENE.wood, 0.45)}
                strokeWidth={0.8}
              />
            ))}
          </g>
        );
      })}
      <path d={toPath(bin.top)} fill={tint(SCENE.wood, 0.08)} />
      <path d={toPath(projectFootprint(fill, height))} fill={SCENE.compost} />
      {[0, 1, 2].map((i) => {
        const angle = seed * 7 + i * 2.1;
        const p = project(c.x + Math.cos(angle) * 8, c.y + Math.sin(angle) * 8, height);
        return <circle key={i} cx={p.x} cy={p.y} r={1.6} fill={tint(SCENE.compost, 0.35)} />;
      })}
    </>
  );
}

function renderMarker(a: GardenAnnotation): ReactNode {
  const corners = structureCorners(a);
  const base = a.color ? mute(a.color, 0.4) : SCENE.marker;
  const material = materialFrom(base);
  const block = extrude(corners, 8);
  return (
    <>
      {groundShadow(corners)}
      {block.walls.map((wall, idx) => (
        <path
          key={idx}
          d={toPath(wall.points)}
          fill={wall.facing === 'right' ? material.right : material.left}
        />
      ))}
      <path d={toPath(block.top)} fill={material.top} />
    </>
  );
}

// --- Component ---------------------------------------------------------------

interface IsoAnnotationProps {
  annotation: GardenAnnotation;
  isSelected: boolean;
}

/**
 * Pure SVG illustration for one annotation, dispatched on its visual
 * kind. Like IsoBed this only draws — interaction lives in IsoElement.
 */
export const IsoAnnotation = memo(function IsoAnnotation({
  annotation,
  isSelected,
}: IsoAnnotationProps) {
  const kind = annotationKind(annotation);

  let body: ReactNode;
  switch (kind) {
    case 'tree':
    case 'fruitTree':
    case 'berryBush':
      body = renderCanopyPlant(annotation, kind);
      break;
    case 'pond':
      body = renderPond(annotation);
      break;
    case 'path':
      body = renderPath(annotation);
      break;
    case 'fence':
      body = renderFence(annotation);
      break;
    case 'shed':
      body = renderGabledStructure(
        annotation,
        annotation.color ? mute(annotation.color, 0.35) : SCENE.woodDark,
        { eaves: 70, ridge: 96, color: SCENE.terracotta, overhang: 1.06 },
        doorExtra(shade(SCENE.woodDark, 0.35))
      );
      break;
    case 'greenhouse':
      body = renderGreenhouse(annotation);
      break;
    case 'trellis':
      body = renderTrellis(annotation);
      break;
    case 'compost':
      body = renderCompost(annotation);
      break;
    case 'coop':
      body = renderGabledStructure(
        annotation,
        SCENE.coop,
        { eaves: 40, ridge: 56, color: shade(SCENE.coop, 0.1), overhang: 1.05 },
        doorExtra(shade(SCENE.coop, 0.4))
      );
      break;
    case 'marker':
    default:
      body = renderMarker(annotation);
      break;
  }

  const footprint = annotationFootprint(annotation);
  const bounds = boundsOf(projectFootprint(footprint, 0));
  const labelAnchor = (bounds.minX + bounds.maxX) / 2;

  return (
    <>
      {body}
      <text className="mp-label" x={labelAnchor} y={bounds.maxY + 13} textAnchor="middle">
        {annotation.label}
      </text>
      {isSelected && (
        <path
          className="mp-el__ring"
          d={toPath(projectFootprint(scaleFootprint(footprint, 1.12), 0), annotation.shape !== 'line')}
          fill="none"
          stroke={SCENE.selection}
          strokeWidth={1.8}
          strokeDasharray="5 4"
        />
      )}
    </>
  );
});
