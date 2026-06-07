import type { PlanEvaluation } from '../CropPlanner/gardenPyramid';

interface PlanScoreProps {
  evaluation: PlanEvaluation;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#426b3f'; // moss
  if (score >= 50) return '#6f8f5f'; // sage
  if (score >= 25) return '#d8a741'; // gold
  if (score > 0) return '#b06a3c'; // clay
  return 'rgba(79, 56, 37, 0.3)';
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Radial gauge that visualizes the 0–100 plan score plus its friendly label.
 * The arc fills proportionally and is colored by score band.
 */
export function PlanScore({ evaluation }: PlanScoreProps) {
  const { score, label } = evaluation;
  const color = scoreColor(score);
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="grn-plan-score" role="img" aria-label={`Plan score ${score} out of 100: ${label}`}>
      <svg viewBox="0 0 120 120" className="grn-plan-score__dial" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="rgba(79, 56, 37, 0.12)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
        <text x="60" y="56" textAnchor="middle" className="grn-plan-score__value" fill={color}>
          {score}
        </text>
        <text x="60" y="74" textAnchor="middle" className="grn-plan-score__max">
          / 100
        </text>
      </svg>
      <span className="grn-plan-score__label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
