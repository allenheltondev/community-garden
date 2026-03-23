import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PATHS, MATCH_SCORES } from './lib/config.mjs';
import { readJsonl, readHeaderlessCsv, appendJsonl, computeChecksum } from './lib/io.mjs';
import { normalizeToNull } from './lib/normalize.mjs';
import { searchPlant, searchPlantByCommonName, getCacheStats, updateManifest } from './lib/permapeople.mjs';
import { readProgress, writeProgress, verifyChecksum, resetProgress } from './lib/progress.mjs';

function cleanToken(value) {
  const v = normalizeToNull(value);
  if (!v) return null;
  return v
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×x]\s+/g, ' ')
    .replace(/[‘’'"`]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\b(var\.?|subsp\.?|ssp\.?|f\.?|forma|cv\.?|cultivar|group|agg\.?|cf\.?|aff\.?)\b/g, ' ')
    .replace(/\b[a-z]\./g, ' ')
    .replace(/\b[a-z]{1,2}\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normSci(name) {
  const cleaned = cleanToken(name);
  if (!cleaned) return null;
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length < 2) return tokens[0] || null;
  return tokens.slice(0, 2).join(' ');
}

function normCommon(name) {
  const cleaned = cleanToken(name);
  if (!cleaned) return null;
  return cleaned
    .replace(/\b(tree|plant|common|wild|garden)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function fuzzyPick(query, candidates, {
  threshold = 0.92,
  maxLengthDelta = 4,
  minQueryLength = 5,
  maxCandidatesToScore = 200,
} = {}) {
  if (!query || candidates.length === 0) return null;
  if (query.length < minQueryLength) return null;

  let best = null;
  let secondBest = null;
  let scoredCandidates = 0;

  for (const candidate of candidates.slice(0, maxCandidatesToScore)) {
    const lenDelta = Math.abs((candidate.normalized || '').length - query.length);
    if (lenDelta > maxLengthDelta) continue;

    const distance = editDistance(query, candidate.normalized);
    const maxDistance = Math.max(1, Math.floor(query.length * (1 - threshold)));
    if (distance > maxDistance) continue;

    const score = 1 - (distance / Math.max(query.length, candidate.normalized.length, 1));
    scoredCandidates += 1;
    if (!best || score > best.score) {
      secondBest = best;
      best = { ...candidate, score };
    } else if (!secondBest || score > secondBest.score) {
      secondBest = { ...candidate, score };
    }
  }

  if (!best || best.score < threshold) return null;

  if (secondBest && Math.abs(best.score - secondBest.score) < 0.03) {
    return {
      ambiguous: true,
      candidates: [best.canonical_id, secondBest.canonical_id],
      score: best.score,
      diagnostics: { query, threshold, scoredCandidates },
    };
  }

  return {
    ambiguous: false,
    canonical_id: best.canonical_id,
    score: best.score,
    diagnostics: { query, threshold, scoredCandidates },
  };
}

function stableSlug(value) {
  const cleaned = cleanToken(value);
  return cleaned ? cleaned.replace(/\s+/g, '-') : 'unknown';
}

function buildOpenFarmSourceId(row, index) {
  const sci = stableSlug(row.scientific_name);
  const common = stableSlug(row.common_name);
  return `openfarm:${sci}:${common}:${index}`;
}

function buildIndexes(canonicalRows) {
  const exact = new Map();
  const normalized = new Map();
  const synonym = new Map();
  const common = new Map();
  const fuzzyScientific = [];
  const fuzzyCommon = [];

  for (const c of canonicalRows) {
    if (c.accepted_scientific_name) exact.set(c.accepted_scientific_name, c.canonical_id);
    if (c.scientific_name_normalized) {
      normalized.set(c.scientific_name_normalized, c.canonical_id);
      fuzzyScientific.push({ normalized: c.scientific_name_normalized, canonical_id: c.canonical_id });
    }
    for (const s of c.synonyms || []) {
      const k = normSci(s);
      if (k) {
        synonym.set(k, c.canonical_id);
        fuzzyScientific.push({ normalized: k, canonical_id: c.canonical_id });
      }
    }
    for (const n of c.common_names || []) {
      const k = normCommon(n);
      if (!k) continue;
      if (!common.has(k)) common.set(k, []);
      common.get(k).push(c.canonical_id);
      fuzzyCommon.push({ normalized: k, canonical_id: c.canonical_id });
    }
  }
  return { exact, normalized, synonym, common, fuzzyScientific, fuzzyCommon };
}

export function matchRecord(record, indexes) {
  const scientificName = normalizeToNull(record.scientific_name);
  const commonName = normalizeToNull(record.common_name);
  const normalizedName = normSci(scientificName);
  const normalizedCommon = normCommon(commonName);
  const diagnostics = {
    scientific_name_input: scientificName,
    common_name_input: commonName,
    normalized_scientific: normalizedName,
    normalized_common: normalizedCommon,
  };

  if (scientificName && indexes.exact.has(scientificName)) {
    return { canonical_id: indexes.exact.get(scientificName), match_type: 'exact_scientific', match_score: MATCH_SCORES.exact_scientific, diagnostics };
  }
  if (normalizedName && indexes.normalized.has(normalizedName)) {
    return { canonical_id: indexes.normalized.get(normalizedName), match_type: 'normalized_scientific', match_score: MATCH_SCORES.normalized_scientific, diagnostics };
  }
  if (normalizedName && indexes.synonym.has(normalizedName)) {
    return { canonical_id: indexes.synonym.get(normalizedName), match_type: 'synonym_match', match_score: MATCH_SCORES.synonym_match, diagnostics };
  }
  if (normalizedCommon) {
    const candidates = indexes.common.get(normalizedCommon) || [];
    if (candidates.length === 1) {
      return { canonical_id: candidates[0], match_type: 'common_name_fallback', match_score: MATCH_SCORES.common_name_fallback, diagnostics };
    }
    if (candidates.length > 1) {
      return { canonical_id: null, match_type: 'ambiguous_common_name', match_score: MATCH_SCORES.ambiguous_common_name, ambiguous_candidates: candidates, diagnostics };
    }
  }

  const fuzzyScientific = fuzzyPick(normalizedName, indexes.fuzzyScientific || [], { threshold: 0.92, maxLengthDelta: 4, minQueryLength: 8, maxCandidatesToScore: 250 });
  if (fuzzyScientific) {
    if (fuzzyScientific.ambiguous) {
      return {
        canonical_id: null,
        match_type: 'ambiguous_common_name',
        match_score: MATCH_SCORES.ambiguous_common_name,
        ambiguous_candidates: fuzzyScientific.candidates,
        diagnostics: { ...diagnostics, fuzzy: { type: 'scientific', ...fuzzyScientific.diagnostics, score: fuzzyScientific.score } },
      };
    }
    return {
      canonical_id: fuzzyScientific.canonical_id,
      match_type: 'fuzzy_fallback',
      match_score: MATCH_SCORES.fuzzy_fallback,
      needs_review: true,
      diagnostics: { ...diagnostics, fuzzy: { type: 'scientific', ...fuzzyScientific.diagnostics, score: fuzzyScientific.score } },
    };
  }

  const fuzzyCommon = fuzzyPick(normalizedCommon, indexes.fuzzyCommon || [], { threshold: 0.82, maxLengthDelta: 3, minQueryLength: 6, maxCandidatesToScore: 250 });
  if (fuzzyCommon) {
    if (fuzzyCommon.ambiguous) {
      return {
        canonical_id: null,
        match_type: 'ambiguous_common_name',
        match_score: MATCH_SCORES.ambiguous_common_name,
        ambiguous_candidates: fuzzyCommon.candidates,
        diagnostics: { ...diagnostics, fuzzy: { type: 'common', ...fuzzyCommon.diagnostics, score: fuzzyCommon.score } },
      };
    }
    return {
      canonical_id: fuzzyCommon.canonical_id,
      match_type: 'fuzzy_fallback',
      match_score: MATCH_SCORES.fuzzy_fallback,
      needs_review: true,
      diagnostics: { ...diagnostics, fuzzy: { type: 'common', ...fuzzyCommon.diagnostics, score: fuzzyCommon.score } },
    };
  }

  return { canonical_id: null, match_type: 'unresolved', match_score: MATCH_SCORES.unresolved, diagnostics };
}

export async function runStep2({ reset = false, dryRun = false, limit = null } = {}) {
  if (!fs.existsSync(PATHS.step1)) throw new Error(`Missing required input from Step 1: ${PATHS.step1}`);
  if (!fs.existsSync(PATHS.openfarmCrops)) throw new Error(`Missing OpenFarm dataset: ${PATHS.openfarmCrops}`);

  if (reset) await resetProgress(2);
  const checksum = await computeChecksum(PATHS.step1);
  await verifyChecksum(2, checksum);

  const canonicalRows = [];
  for await (const r of readJsonl(PATHS.step1)) canonicalRows.push(r);
  const indexes = buildIndexes(canonicalRows);
  const canonicalById = new Map(canonicalRows.map((c) => [c.canonical_id, c]));

  const openfarm = await readHeaderlessCsv(PATHS.openfarmCrops, ['scientific_name', 'common_name']);
  const fetchLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
  const openfarmSlice = fetchLimit ? openfarm.slice(0, fetchLimit) : openfarm;

  // 1. Match OpenFarm records to USDA canonicals
  const openfarmRecords = openfarmSlice.map((r, i) => {
    const rec = {
      source_provider: 'openfarm',
      source_record_id: buildOpenFarmSourceId(r, i),
      scientific_name: r.scientific_name ?? null,
      common_name: r.common_name ?? null,
      raw_payload: r,
    };
    const m = matchRecord(rec, indexes);
    return { ...rec, match: m };
  });

  // 2. Query Permapeople for each unique matched canonical (OpenFarm-driven)
  const queriedCanonicals = new Set();
  const permapeopleRecords = [];

  for (const ofRec of openfarmRecords) {
    const cid = ofRec.match.canonical_id;
    if (cid && !queriedCanonicals.has(cid)) {
      queriedCanonicals.add(cid);
      const canonical = canonicalById.get(cid);
      const sci = canonical?.scientific_name_normalized || canonical?.accepted_scientific_name;
      if (sci) {
        const ppA = await searchPlant(sci);
        let hits = Array.isArray(ppA?.hits) ? ppA.hits : [];
        if (hits.length === 0 && canonical?.common_names?.[0]) {
          const ppB = await searchPlantByCommonName(canonical.common_names[0]);
          hits = Array.isArray(ppB?.hits) ? ppB.hits : [];
        }
        for (const hit of hits) {
          permapeopleRecords.push({
            source_provider: 'permapeople',
            source_record_id: String(hit.id ?? `${sci}:${Math.random().toString(16).slice(2, 8)}`),
            scientific_name: hit.scientific_name ?? null,
            common_name: hit.name ?? null,
            raw_payload: hit,
          });
        }
      }
    }
    // For unmatched records, try Permapeople by common name directly
    if (!cid && ofRec.common_name) {
      const key = `of_common:${normCommon(ofRec.common_name)}`;
      if (!queriedCanonicals.has(key)) {
        queriedCanonicals.add(key);
        const ppC = await searchPlantByCommonName(ofRec.common_name);
        const hits = Array.isArray(ppC?.hits) ? ppC.hits : [];
        for (const hit of hits) {
          permapeopleRecords.push({
            source_provider: 'permapeople',
            source_record_id: String(hit.id ?? `common:${ofRec.common_name}:${Math.random().toString(16).slice(2, 8)}`),
            scientific_name: hit.scientific_name ?? null,
            common_name: hit.name ?? null,
            raw_payload: hit,
          });
        }
      }
    }
  }

  // 3. Build output: OpenFarm + Permapeople records, all matched against USDA
  const allRecords = [...openfarmRecords.map((r) => ({
    source_provider: r.source_provider,
    source_record_id: r.source_record_id,
    scientific_name: r.scientific_name,
    common_name: r.common_name,
    raw_payload: r.raw_payload,
  })), ...permapeopleRecords];

  const progress = await readProgress(2);
  const startIndex = progress ? progress.lastProcessedIndex + 1 : 0;
  const slice = allRecords.slice(startIndex);

  const out = slice.map((r) => {
    const m = matchRecord(r, indexes);
    return {
      source_provider: r.source_provider,
      source_record_id: r.source_record_id,
      source_scientific_name: r.scientific_name ?? null,
      source_common_name: r.common_name ?? null,
      raw_payload: r.raw_payload ?? null,
      canonical_id: m.canonical_id,
      match_type: m.match_type,
      match_score: m.match_score,
      matched_at: new Date().toISOString(),
      ...(m.ambiguous_candidates ? { ambiguous_candidates: m.ambiguous_candidates } : {}),
      ...(m.needs_review ? { needs_review: true } : {}),
      ...(m.diagnostics ? { match_diagnostics: m.diagnostics } : {}),
    };
  });

  if (!dryRun) {
    await fsp.mkdir('data/catalog', { recursive: true });
    await appendJsonl(PATHS.step2, out);
    if (out.length > 0) await writeProgress(2, startIndex + out.length - 1, checksum);
    await updateManifest();
  }

  const stats = getCacheStats();
  return { processedThisRun: out.length, cacheHits: stats.hits, cacheMisses: stats.misses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStep2().then((s) => console.log(JSON.stringify(s, null, 2))).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
