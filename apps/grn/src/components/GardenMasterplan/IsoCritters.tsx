import { memo, useEffect, useState } from 'react';
import type { Critter } from './critters';
import { projectPoint, smoothClosedPath } from './iso';
import { SCENE, mute, shade, tint } from './palette';

// Two-tone palette per critter, derived from the scene's muted ramps so
// the residents sit in the same marker-rendering world as the planting.
const RABBIT_BODY = tint(SCENE.marker, 0.3);
const RABBIT_EAR = shade(SCENE.marker, 0.28);
const CHICKEN_BODY = tint(SCENE.sand, 0.22);
const CHICKEN_COMB = mute('#c2674f', 0.2);
const BEE_BODY = mute('#d8a83c', 0.2);
const BEE_DARK = shade('#d8a83c', 0.55);
const BEE_WING = tint(SCENE.glass, 0.45);
const WING_FORE = mute('#c2674f', 0.3);
const WING_HIND = shade(mute('#c2674f', 0.3), 0.28);

// Hand-authored flat silhouettes, drawn around the origin with feet (or
// body center, for flyers) at 0,0 so animateMotion can carry the group.

function RabbitSprite() {
  return (
    <g>
      <path
        d="M-2.5 -10.5 C-4.5 -15 -4 -19.5 -2 -20 C-0.5 -20.3 0.4 -15.5 0.2 -11 Z M2.2 -10.8 C2 -15.5 3.4 -19.2 5 -18.6 C6.4 -18 5 -13 3.6 -10 Z"
        fill={RABBIT_EAR}
      />
      <path
        d="M-8.5 0 C-10 -4.5 -8 -8.5 -4.5 -9.5 C-3.5 -11.5 -0.5 -12 1.5 -11 C4 -11.8 6.5 -10.5 7.5 -8 C9.5 -6.5 10 -3 8.5 0 Z"
        fill={RABBIT_BODY}
      />
      <circle cx={-8.3} cy={-3.2} r={1.7} fill={RABBIT_EAR} />
    </g>
  );
}

function ChickenSprite() {
  return (
    <g>
      <path
        d="M-1 0 L-1 2.4 M2.2 0 L2.2 2.4"
        stroke={CHICKEN_COMB}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <path
        d="M-9 -12.5 C-7.5 -9 -6 -7.5 -4 -7 C-3.5 -10.5 -1 -12.5 2 -12.5 C4.5 -12.5 6.5 -10.8 6.8 -8.5 C8 -8 8.6 -7 8.8 -5.8 L6.5 -5.2 C7 -3 6 -1 3.8 -0.4 C0.5 0.6 -4 0.3 -6.3 -1.8 C-8.6 -3.9 -10.2 -8.7 -9 -12.5 Z"
        fill={CHICKEN_BODY}
      />
      <path
        d="M1.2 -12.4 C1.6 -14.4 2.5 -15 3.1 -14.2 C3.5 -15.2 4.4 -15.3 4.7 -14.2 C5.2 -14.9 5.9 -14.6 5.9 -13.4 L5.4 -12 C4.1 -12.7 2.6 -12.6 1.2 -12.4 Z"
        fill={CHICKEN_COMB}
      />
      <circle cx={6.4} cy={-6.6} r={0.9} fill={CHICKEN_COMB} />
    </g>
  );
}

function BeeSprite({ animate }: { animate: boolean }) {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={4.6} ry={3.1} fill={BEE_BODY} />
      <rect x={-2.7} y={-3} width={1.5} height={6} rx={0.7} fill={BEE_DARK} />
      <rect x={-0.3} y={-3} width={1.5} height={6} rx={0.7} fill={BEE_DARK} />
      <circle cx={4.4} cy={-0.4} r={2} fill={BEE_DARK} />
      <ellipse
        cx={-1}
        cy={-4.6}
        rx={2.7}
        ry={1.7}
        fill={BEE_WING}
        transform="rotate(-24 -1 -4.6)"
      >
        {animate && (
          <animate
            attributeName="opacity"
            values="1;0.35;1"
            dur="0.3s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>
    </g>
  );
}

function ButterflyWings({ animate }: { animate: boolean }) {
  return (
    <g>
      <path
        d="M0 -2 C-6 -9.5 -11.5 -8.5 -10.5 -3.5 C-9.8 -0.4 -4.5 0.3 0 -1 Z"
        fill={WING_FORE}
      />
      <path
        d="M0 -0.8 C-5 -0.2 -8.2 3 -6.4 5.4 C-4.7 7.6 -1 4.6 0 0.5 Z"
        fill={WING_HIND}
      />
      {animate && (
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1 1;0.45 1;1 1"
          dur="0.9s"
          repeatCount="indefinite"
          additive="sum"
        />
      )}
    </g>
  );
}

function ButterflySprite({ animate }: { animate: boolean }) {
  return (
    <g>
      <ButterflyWings animate={animate} />
      <g transform="scale(-1 1)">
        <ButterflyWings animate={animate} />
      </g>
      <ellipse cx={0} cy={1} rx={0.9} ry={3.6} fill={shade(WING_FORE, 0.4)} />
    </g>
  );
}

function CritterBody({ critter, animate }: { critter: Critter; animate: boolean }) {
  switch (critter.kind) {
    case 'rabbit':
      return <RabbitSprite />;
    case 'chicken':
      return <ChickenSprite />;
    case 'bee':
      return <BeeSprite animate={animate} />;
    case 'butterfly':
      return <ButterflySprite animate={animate} />;
  }
}

interface CritterFigureProps {
  critter: Critter;
  index: number;
  reducedMotion: boolean;
}

function CritterFigure({ critter, index, reducedMotion }: CritterFigureProps) {
  const flyer = critter.heightInches > 0;
  const shadow = flyer
    ? { dx: 1.5, dy: 1, rx: 4, ry: 1.5, opacity: 0.55 }
    : { dx: 0, dy: 0.8, rx: 7, ry: 2.6, opacity: 1 };

  if (reducedMotion) {
    // Static residents: parked at the first waypoint, no animate elements.
    const ground = projectPoint(critter.waypoints[0], 0);
    const body = projectPoint(critter.waypoints[0], critter.heightInches);
    return (
      <g className="mp-critter">
        <ellipse
          cx={ground.x + shadow.dx}
          cy={ground.y + shadow.dy}
          rx={shadow.rx}
          ry={shadow.ry}
          fill={SCENE.elementShadowSoft}
          opacity={shadow.opacity}
        />
        <g transform={`translate(${body.x} ${body.y})`}>
          <CritterBody critter={critter} animate={false} />
        </g>
      </g>
    );
  }

  // Shadow and body ride separate motion paths projected from the same
  // waypoints (ground vs travel height), so a flyer's shadow tracks the
  // lawn directly beneath it. Negative begins stagger the pair of
  // critters so they never feel choreographed.
  const groundPath = smoothClosedPath(critter.waypoints.map((p) => projectPoint(p, 0)));
  const travelPath = flyer
    ? smoothClosedPath(critter.waypoints.map((p) => projectPoint(p, critter.heightInches)))
    : groundPath;
  const dur = `${critter.durationSeconds}s`;
  const begin = `${-index * 13}s`;

  return (
    <g className="mp-critter">
      <g>
        <ellipse
          cx={shadow.dx}
          cy={shadow.dy}
          rx={shadow.rx}
          ry={shadow.ry}
          fill={SCENE.elementShadowSoft}
          opacity={shadow.opacity}
        />
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={groundPath} />
      </g>
      <g>
        {flyer ? (
          <g>
            <CritterBody critter={critter} animate />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0;0 -2.4;0 0"
              dur={critter.kind === 'bee' ? '1.7s' : '2.9s'}
              repeatCount="indefinite"
              additive="sum"
            />
          </g>
        ) : (
          <CritterBody critter={critter} animate />
        )}
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={travelPath} />
      </g>
    </g>
  );
}

interface IsoCrittersProps {
  critters: Critter[];
}

/**
 * Decorative ambient critters drifting over the masterplan. Renders
 * above the elements layer (small flyers reading over the garden, like
 * birds), never intercepts pointer events, and is hidden from assistive
 * tech. Honors prefers-reduced-motion by parking each critter at its
 * first waypoint with no SMIL at all.
 */
export const IsoCritters = memo(function IsoCritters({ critters }: IsoCrittersProps) {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (critters.length === 0) return null;

  return (
    <g className="mp-critters" aria-hidden="true" pointerEvents="none">
      {critters.map((critter, index) => (
        <CritterFigure
          key={critter.kind}
          critter={critter}
          index={index}
          reducedMotion={reducedMotion}
        />
      ))}
    </g>
  );
});
