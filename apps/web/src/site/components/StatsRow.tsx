import { useEffect, useState } from 'react';
import { okraMapUrl } from '../../okra/api';
import { manualImpactStats, manualImpactStatsAsOf } from '../community-content';
import './StatsRow.css';

type OkraStats = {
  total_pins: number;
  country_count: number;
  contributor_count: number;
  seed_packets_sent: number;
};

type Tile = {
  label: string;
  value: string;
  caption?: string;
};

const numberFormat = new Intl.NumberFormat('en-US');

function buildLiveTiles(stats: OkraStats | null): Tile[] {
  if (!stats) {
    return [];
  }

  const tiles: Tile[] = [];
  if (stats.seed_packets_sent > 0) {
    tiles.push({ label: 'Seed packets mailed', value: numberFormat.format(stats.seed_packets_sent) });
  }
  if (stats.contributor_count > 0) {
    tiles.push({ label: 'Growers on the Okra map', value: numberFormat.format(stats.contributor_count) });
  }
  if (stats.country_count > 0) {
    tiles.push({ label: 'Countries reached', value: numberFormat.format(stats.country_count) });
  }
  return tiles;
}

/**
 * StatsRow — small metrics band combining live numbers from the Okra map with
 * manually-tracked foundation figures. Live tiles are omitted while loading or
 * if they have no data yet, so the row never shows a zero or a spinner in place
 * of a real number.
 */
export function StatsRow({ className }: { className?: string }) {
  const [stats, setStats] = useState<OkraStats | null>(null);

  useEffect(() => {
    let active = true;

    fetch(okraMapUrl('/stats'))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OkraStats | null) => {
        if (active && data) {
          setStats(data);
        }
      })
      .catch(() => {
        // Live numbers are best-effort; manual tiles still render.
      });

    return () => {
      active = false;
    };
  }, []);

  const liveTiles = buildLiveTiles(stats);
  const manualTiles: Tile[] = manualImpactStats
    .filter((stat) => stat.value && stat.value !== '—')
    .map((stat) => ({
      label: stat.label,
      value: stat.value,
      caption: stat.note ?? `as of ${manualImpactStatsAsOf}`,
    }));

  const tiles = [...liveTiles, ...manualTiles];
  if (tiles.length === 0) {
    return null;
  }

  return (
    <dl className={['stats-row', className].filter(Boolean).join(' ')}>
      {tiles.map((tile) => (
        <div className="stats-row__tile" key={tile.label}>
          <dt className="stats-row__value">{tile.value}</dt>
          <dd className="stats-row__label">
            {tile.label}
            {tile.caption ? <span className="stats-row__caption">{tile.caption}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
