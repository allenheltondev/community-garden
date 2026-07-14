import crypto from 'node:crypto';
import { createHttpClient } from './integration/http-client.mjs';
import { createReporter } from './integration/reporter.mjs';

// --- Environment variable validation ---

const REQUIRED_ENV_VARS = ['GRN_API_BASE_URL', 'GROWER_TOKEN'];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('All of the following must be set:');
    for (const name of REQUIRED_ENV_VARS) {
      console.error(`  ${name}=${process.env[name] ? '✓ set' : '✗ MISSING'}`);
    }
    console.error('\nProvision tokens with the ci-auth-seed Lambda (services/grn-api/functions/ci-auth-seed.mjs).');
    process.exit(1);
  }
}

// --- Helpers ---

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GARDEN_BED_FIELDS = [
  'id',
  'user_id',
  'name',
  'description',
  'sun_exposure',
  'soil_type',
  'length_inches',
  'width_inches',
  'location_notes',
  'sort_order',
  'bed_type',
  'shape',
  'position_x',
  'position_y',
  'rotation_deg',
  'points',
  'color',
  'created_at',
  'updated_at'
];

const GARDEN_ANNOTATION_FIELDS = [
  'id',
  'user_id',
  'label',
  'icon',
  'shape',
  'position_x',
  'position_y',
  'length_inches',
  'width_inches',
  'rotation_deg',
  'points',
  'color',
  'sort_order',
  'created_at',
  'updated_at'
];

const GARDEN_CANVAS_FIELDS = [
  'id',
  'user_id',
  'width_inches',
  'height_inches',
  'background_image_key',
  'background_opacity',
  'north_offset_deg',
  'created_at',
  'updated_at'
];

function missingFields(item, fields) {
  return fields.filter((f) => !(f in item));
}

// --- Main runner ---

async function run() {
  validateEnv();

  const runPrefix = `ci-${crypto.randomUUID().slice(0, 8)}`;
  console.log(`\nRun_Prefix: ${runPrefix}\n`);

  const apiBase = process.env.GRN_API_BASE_URL;
  const growerToken = process.env.GROWER_TOKEN;

  const noAuthApi = createHttpClient(apiBase);
  const badTokenApi = createHttpClient(apiBase, {
    Authorization: 'Bearer invalid-token-value'
  });
  const growerApi = createHttpClient(apiBase, {
    Authorization: `Bearer ${growerToken}`
  });

  const reporter = createReporter(runPrefix);
  const createdBedIds = [];
  const createdAnnotationIds = [];

  // --- Auth Boundary ---
  console.log('\n=== Auth Boundary ===');
  {
    const dummyId = '00000000-0000-4000-8000-000000000000';
    {
      const res = await noAuthApi.request('/beds');
      reporter.assert('auth-boundary', res.status === 401, `GET /beds without auth returns 401 (got ${res.status})`, res.json);
    }
    {
      const res = await noAuthApi.request('/beds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'should fail' })
      });
      reporter.assert('auth-boundary', res.status === 401, `POST /beds without auth returns 401 (got ${res.status})`, res.json);
    }
    {
      const res = await noAuthApi.request(`/beds/${dummyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'should fail' })
      });
      reporter.assert('auth-boundary', res.status === 401, `PUT /beds/:id without auth returns 401 (got ${res.status})`, res.json);
    }
    {
      const res = await noAuthApi.request('/garden');
      reporter.assert('auth-boundary', res.status === 401, `GET /garden without auth returns 401 (got ${res.status})`, res.json);
    }
    {
      const res = await badTokenApi.request('/beds');
      reporter.assert('auth-boundary',
        res.status === 401 || res.status === 403,
        `GET /beds with invalid token returns 401/403 (got ${res.status})`, res.json);
    }
    {
      const res = await badTokenApi.request('/garden');
      reporter.assert('auth-boundary',
        res.status === 401 || res.status === 403,
        `GET /garden with invalid token returns 401/403 (got ${res.status})`, res.json);
    }
    {
      const res = await noAuthApi.request('/annotations');
      reporter.assert('auth-boundary', res.status === 401, `GET /annotations without auth returns 401 (got ${res.status})`, res.json);
    }
    {
      const res = await noAuthApi.request('/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'should fail' })
      });
      reporter.assert('auth-boundary', res.status === 401, `POST /annotations without auth returns 401 (got ${res.status})`, res.json);
    }
  }


  // --- Bed validation ---
  console.log('\n=== Bed validation ===');
  {
    const cases = [
      {
        label: 'blank name',
        body: { name: '   ', shape: 'rect', bedType: 'raised' }
      },
      {
        label: 'unknown bedType',
        body: { name: 'bad bedType', bedType: 'hydroponic' }
      },
      {
        label: 'unknown shape',
        body: { name: 'bad shape', shape: 'octagon' }
      },
      {
        label: 'polygon without points',
        body: { name: 'no points', shape: 'polygon' }
      },
      {
        label: 'polygon with too few points',
        body: {
          name: 'two points',
          shape: 'polygon',
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }]
        }
      },
      {
        label: 'point missing y',
        body: {
          name: 'bad point',
          shape: 'polygon',
          points: [{ x: 0, y: 0 }, { x: 10 }, { x: 5, y: 10 }]
        }
      },
      {
        label: 'rotation out of range',
        body: { name: 'spin', rotationDeg: 720 }
      },
      {
        label: 'invalid color',
        body: { name: 'colorful', color: 'green' }
      },
      {
        label: 'negative length',
        body: { name: 'tiny', lengthInches: -1 }
      },
      {
        label: 'unknown sunExposure',
        body: { name: 'rainforest bed', sunExposure: 'rainforest' }
      }
    ];

    for (const { label, body } of cases) {
      const res = await growerApi.request('/beds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      reporter.assert('bed-validation', res.status === 400,
        `POST /beds (${label}) returns 400 (got ${res.status})`, res.json);
    }

    // Empty body / not-a-uuid path param.
    {
      const res = await growerApi.request('/beds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });
      reporter.assert('bed-validation', res.status === 400,
        `POST /beds with empty body returns 400 (got ${res.status})`, res.json);
    }
    {
      const res = await growerApi.request('/beds/not-a-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'whatever' })
      });
      reporter.assert('bed-validation', res.status === 400,
        `PUT /beds/not-a-uuid returns 400 (got ${res.status})`, res.json);
    }
  }

  // --- Bed CRUD ---
  console.log('\n=== Bed CRUD ===');
  try {
    // Create a polygon bed with the full set of new fields.
    const polygonName = `${runPrefix}-polygon-bed`;
    const polygonPayload = {
      name: polygonName,
      bedType: 'in_ground',
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 96, y: 0 },
        { x: 96, y: 48 },
        { x: 0, y: 48 }
      ],
      positionX: 12,
      positionY: 24,
      rotationDeg: 15,
      color: '#4f8a3b',
      lengthInches: 96,
      widthInches: 48,
      sunExposure: 'partial_sun',
      soilType: 'sandy_loam',
      locationNotes: 'south fence line',
      sortOrder: 1
    };
    const createRes = await growerApi.request('/beds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(polygonPayload)
    });
    reporter.assert('bed-crud', createRes.status === 201, `POST /beds returns 201 (got ${createRes.status})`, createRes.json);
    const created = createRes.json;
    if (created?.id) createdBedIds.push(created.id);

    const fieldGap = missingFields(created ?? {}, GARDEN_BED_FIELDS);
    reporter.assert('bed-crud', fieldGap.length === 0,
      fieldGap.length === 0
        ? 'created bed has all expected fields'
        : `created bed missing fields: ${fieldGap.join(', ')}`,
      created);
    reporter.assert('bed-crud', UUID_PATTERN.test(created?.id ?? ''), `created bed id is a UUID (got ${created?.id})`, created);
    reporter.assert('bed-crud', created?.bed_type === 'in_ground', `bed_type roundtrips as in_ground (got ${created?.bed_type})`, created);
    reporter.assert('bed-crud', created?.shape === 'polygon', `shape roundtrips as polygon (got ${created?.shape})`, created);
    reporter.assert('bed-crud', Array.isArray(created?.points) && created.points.length === 4,
      `points roundtrip as 4-entry array (got ${created?.points?.length})`, created);
    reporter.assert('bed-crud', created?.position_x === 12 && created?.position_y === 24,
      `position roundtrips (got ${created?.position_x}, ${created?.position_y})`, created);
    reporter.assert('bed-crud', created?.rotation_deg === 15, `rotation_deg roundtrips (got ${created?.rotation_deg})`, created);
    reporter.assert('bed-crud', created?.color === '#4f8a3b', `color roundtrips (got ${created?.color})`, created);

    // Update: flip to a rect, drop the polygon points, change position.
    if (created?.id) {
      const updatePayload = {
        ...polygonPayload,
        name: `${polygonName}-renamed`,
        shape: 'rect',
        points: null,
        positionX: 60,
        positionY: 60,
        rotationDeg: 0
      };
      const updateRes = await growerApi.request(`/beds/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      reporter.assert('bed-crud', updateRes.status === 200, `PUT /beds/:id returns 200 (got ${updateRes.status})`, updateRes.json);
      reporter.assert('bed-crud', updateRes.json?.shape === 'rect', `shape updates to rect (got ${updateRes.json?.shape})`, updateRes.json);
      reporter.assert('bed-crud', updateRes.json?.points === null, `points cleared on shape change (got ${updateRes.json?.points})`, updateRes.json);
      reporter.assert('bed-crud', updateRes.json?.position_x === 60 && updateRes.json?.position_y === 60,
        `position updates (got ${updateRes.json?.position_x}, ${updateRes.json?.position_y})`, updateRes.json);
    }

    // List shows the bed.
    {
      const listRes = await growerApi.request('/beds');
      reporter.assert('bed-crud', listRes.status === 200, `GET /beds returns 200 (got ${listRes.status})`, listRes.json);
      const found = Array.isArray(listRes.json) && listRes.json.some((b) => b.id === created?.id);
      reporter.assert('bed-crud', found, 'created bed appears in list', listRes.json);
    }

    // Delete (soft) → not in list.
    if (created?.id) {
      const deleteRes = await growerApi.request(`/beds/${created.id}`, { method: 'DELETE' });
      reporter.assert('bed-crud', deleteRes.status === 204, `DELETE /beds/:id returns 204 (got ${deleteRes.status})`, deleteRes.json);
      const listAfter = await growerApi.request('/beds');
      const stillThere = Array.isArray(listAfter.json) && listAfter.json.some((b) => b.id === created.id);
      reporter.assert('bed-crud', !stillThere, 'archived bed is filtered from list', listAfter.json);
      // Tracked-id list mirrors the soft-delete; clear it so cleanup doesn't double-delete.
      const idx = createdBedIds.indexOf(created.id);
      if (idx >= 0) createdBedIds.splice(idx, 1);
    }

    // Delete on unknown id → 404.
    {
      const dummyId = '00000000-0000-4000-8000-000000000000';
      const res = await growerApi.request(`/beds/${dummyId}`, { method: 'DELETE' });
      reporter.assert('bed-crud', res.status === 404, `DELETE /beds/:unknown returns 404 (got ${res.status})`, res.json);
    }
  } catch (err) {
    reporter.fail('bed-crud', `Bed CRUD error: ${err.message}`);
  }

  // --- Garden canvas ---
  console.log('\n=== Garden canvas ===');
  try {
    // GET auto-creates with defaults.
    const getRes = await growerApi.request('/garden');
    reporter.assert('garden-canvas', getRes.status === 200, `GET /garden returns 200 (got ${getRes.status})`, getRes.json);
    const canvas = getRes.json;
    const fieldGap = missingFields(canvas ?? {}, GARDEN_CANVAS_FIELDS);
    reporter.assert('garden-canvas', fieldGap.length === 0,
      fieldGap.length === 0
        ? 'canvas has all expected fields'
        : `canvas missing fields: ${fieldGap.join(', ')}`,
      canvas);
    reporter.assert('garden-canvas', UUID_PATTERN.test(canvas?.id ?? ''), `canvas id is a UUID (got ${canvas?.id})`, canvas);
    reporter.assert('garden-canvas', typeof canvas?.width_inches === 'number' && canvas.width_inches > 0,
      `width_inches is positive (got ${canvas?.width_inches})`, canvas);
    reporter.assert('garden-canvas', typeof canvas?.height_inches === 'number' && canvas.height_inches > 0,
      `height_inches is positive (got ${canvas?.height_inches})`, canvas);

    // PUT updates dimensions and opacity.
    {
      const updateRes = await growerApi.request('/garden', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widthInches: 480,
          heightInches: 300,
          backgroundOpacity: 40,
          backgroundImageKey: null,
          northOffsetDeg: 12
        })
      });
      reporter.assert('garden-canvas', updateRes.status === 200, `PUT /garden returns 200 (got ${updateRes.status})`, updateRes.json);
      reporter.assert('garden-canvas', updateRes.json?.width_inches === 480, `width updates (got ${updateRes.json?.width_inches})`, updateRes.json);
      reporter.assert('garden-canvas', updateRes.json?.height_inches === 300, `height updates (got ${updateRes.json?.height_inches})`, updateRes.json);
      reporter.assert('garden-canvas', updateRes.json?.background_opacity === 40, `opacity updates (got ${updateRes.json?.background_opacity})`, updateRes.json);
      reporter.assert('garden-canvas', updateRes.json?.north_offset_deg === 12, `north offset updates (got ${updateRes.json?.north_offset_deg})`, updateRes.json);
      reporter.assert('garden-canvas', updateRes.json?.background_image_key === null, 'background_image_key persists as null', updateRes.json);
    }

    // Validation failures.
    const badCases = [
      { label: 'opacity > 100', body: { backgroundOpacity: 250 } },
      { label: 'opacity < 0', body: { backgroundOpacity: -5 } },
      { label: 'width too small', body: { widthInches: 1 } },
      { label: 'width too large', body: { widthInches: 999_999 } },
      { label: 'north offset out of range', body: { northOffsetDeg: 9_999 } },
      { label: 'background key outside prefix', body: { backgroundImageKey: 'other-prefix/foo.jpg' } },
      { label: 'background key with traversal', body: { backgroundImageKey: 'garden-backgrounds/../etc' } }
    ];
    for (const { label, body } of badCases) {
      const res = await growerApi.request('/garden', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      reporter.assert('garden-canvas', res.status === 400,
        `PUT /garden (${label}) returns 400 (got ${res.status})`, res.json);
    }
  } catch (err) {
    reporter.fail('garden-canvas', `Garden canvas error: ${err.message}`);
  }

  // --- Annotation validation ---
  console.log('\n=== Annotation validation ===');
  {
    const cases = [
      { label: 'blank label', body: { label: '   ' } },
      { label: 'unknown shape', body: { label: 'bad', shape: 'octagon' } },
      { label: 'polygon without points', body: { label: 'pond', shape: 'polygon' } },
      { label: 'line with one point', body: { label: 'path', shape: 'line', points: [{ x: 0, y: 0 }] } },
      { label: 'polygon with 2 points', body: { label: 'pond', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } },
      { label: 'invalid color', body: { label: 'tree', color: 'green' } },
      { label: 'rotation out of range', body: { label: 'spin', rotationDeg: 720 } },
      { label: 'negative dimensions', body: { label: 'tiny', lengthInches: -1 } },
      { label: 'long label', body: { label: 'x'.repeat(200) } }
    ];
    for (const { label, body } of cases) {
      const res = await growerApi.request('/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      reporter.assert('annotation-validation', res.status === 400,
        `POST /annotations (${label}) returns 400 (got ${res.status})`, res.json);
    }
    {
      const res = await growerApi.request('/annotations/not-a-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'whatever' })
      });
      reporter.assert('annotation-validation', res.status === 400,
        `PUT /annotations/not-a-uuid returns 400 (got ${res.status})`, res.json);
    }
  }

  // --- Annotation CRUD ---
  console.log('\n=== Annotation CRUD ===');
  try {
    const lineLabel = `${runPrefix}-path`;
    const linePayload = {
      label: lineLabel,
      icon: '🛤️',
      shape: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 240, y: 0 },
        { x: 360, y: 60 }
      ],
      positionX: 12,
      positionY: 60,
      rotationDeg: 0,
      color: '#8a6230',
      sortOrder: 1
    };
    const createRes = await growerApi.request('/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(linePayload)
    });
    reporter.assert('annotation-crud', createRes.status === 201, `POST /annotations returns 201 (got ${createRes.status})`, createRes.json);
    const created = createRes.json;
    if (created?.id) createdAnnotationIds.push(created.id);
    const fieldGap = missingFields(created ?? {}, GARDEN_ANNOTATION_FIELDS);
    reporter.assert('annotation-crud', fieldGap.length === 0,
      fieldGap.length === 0
        ? 'created annotation has all expected fields'
        : `created annotation missing fields: ${fieldGap.join(', ')}`,
      created);
    reporter.assert('annotation-crud', UUID_PATTERN.test(created?.id ?? ''), `created annotation id is a UUID (got ${created?.id})`, created);
    reporter.assert('annotation-crud', created?.shape === 'line', `shape roundtrips as line (got ${created?.shape})`, created);
    reporter.assert('annotation-crud', Array.isArray(created?.points) && created.points.length === 3,
      `points roundtrip as 3-entry array (got ${created?.points?.length})`, created);
    reporter.assert('annotation-crud', created?.icon === '🛤️', `icon roundtrips (got ${created?.icon})`, created);
    reporter.assert('annotation-crud', created?.color === '#8a6230', `color roundtrips (got ${created?.color})`, created);

    if (created?.id) {
      const updateRes = await growerApi.request(`/annotations/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...linePayload,
          label: `${lineLabel}-renamed`,
          shape: 'rect',
          points: null,
          positionX: 100,
          positionY: 100
        })
      });
      reporter.assert('annotation-crud', updateRes.status === 200, `PUT /annotations/:id returns 200 (got ${updateRes.status})`, updateRes.json);
      reporter.assert('annotation-crud', updateRes.json?.shape === 'rect', `shape updates to rect (got ${updateRes.json?.shape})`, updateRes.json);
      reporter.assert('annotation-crud', updateRes.json?.points === null, `points cleared on shape change (got ${updateRes.json?.points})`, updateRes.json);
    }

    {
      const listRes = await growerApi.request('/annotations');
      reporter.assert('annotation-crud', listRes.status === 200, `GET /annotations returns 200 (got ${listRes.status})`, listRes.json);
      const found = Array.isArray(listRes.json) && listRes.json.some((a) => a.id === created?.id);
      reporter.assert('annotation-crud', found, 'created annotation appears in list', listRes.json);
    }

    if (created?.id) {
      const deleteRes = await growerApi.request(`/annotations/${created.id}`, { method: 'DELETE' });
      reporter.assert('annotation-crud', deleteRes.status === 204, `DELETE /annotations/:id returns 204 (got ${deleteRes.status})`, deleteRes.json);
      const idx = createdAnnotationIds.indexOf(created.id);
      if (idx >= 0) createdAnnotationIds.splice(idx, 1);
    }

    {
      const dummyId = '00000000-0000-4000-8000-000000000000';
      const res = await growerApi.request(`/annotations/${dummyId}`, { method: 'DELETE' });
      reporter.assert('annotation-crud', res.status === 404, `DELETE /annotations/:unknown returns 404 (got ${res.status})`, res.json);
    }
  } catch (err) {
    reporter.fail('annotation-crud', `Annotation CRUD error: ${err.message}`);
  }

  // --- Background upload URL ---
  console.log('\n=== Background upload URL ===');
  try {
    {
      const res = await growerApi.request('/garden/background-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', contentLength: 1024 })
      });
      // 503 is acceptable in environments where MEDIA_BUCKET_NAME isn't wired
      // (the env passes the validation step before failing on missing config),
      // so accept either 201 (success) or 503 (config gap).
      const acceptable = res.status === 201 || res.status === 503;
      reporter.assert('background-upload-url', acceptable,
        `POST /garden/background-upload-url returns 201 or 503 (got ${res.status})`, res.json);
      if (res.status === 201) {
        reporter.assert('background-upload-url', typeof res.json?.upload_url === 'string' && res.json.upload_url.startsWith('https://'),
          'response includes https upload_url', res.json);
        reporter.assert('background-upload-url', typeof res.json?.s3_key === 'string' && res.json.s3_key.startsWith('garden-backgrounds/'),
          'response s3_key sits under garden-backgrounds/', res.json);
        reporter.assert('background-upload-url', res.json?.method === 'PUT', `method is PUT (got ${res.json?.method})`, res.json);
        reporter.assert('background-upload-url', res.json?.headers?.['Content-Type'] === 'image/jpeg',
          'response headers include Content-Type: image/jpeg', res.json);
        reporter.assert('background-upload-url', typeof res.json?.expires_in_seconds === 'number' && res.json.expires_in_seconds > 0,
          `expires_in_seconds is positive (got ${res.json?.expires_in_seconds})`, res.json);
      } else {
        reporter.skip('background-upload-url', 'MEDIA_BUCKET_NAME not configured in this environment; presigning skipped');
      }
    }

    // Bad content-type → 400.
    {
      const res = await growerApi.request('/garden/background-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'text/plain', contentLength: 1024 })
      });
      reporter.assert('background-upload-url', res.status === 400, `POST with bad content type returns 400 (got ${res.status})`, res.json);
    }

    // Oversize content-length → 400.
    {
      const res = await growerApi.request('/garden/background-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/png', contentLength: 50 * 1024 * 1024 })
      });
      reporter.assert('background-upload-url', res.status === 400, `POST with oversize length returns 400 (got ${res.status})`, res.json);
    }
  } catch (err) {
    reporter.fail('background-upload-url', `Background upload URL error: ${err.message}`);
  }

  // --- Cleanup any beds/annotations that survived the CRUD scenario ---
  for (const bedId of createdBedIds) {
    try {
      await growerApi.request(`/beds/${bedId}`, { method: 'DELETE' });
    } catch (err) {
      console.error(`Cleanup failed for bed ${bedId}: ${err.message}`);
    }
  }
  for (const annotationId of createdAnnotationIds) {
    try {
      await growerApi.request(`/annotations/${annotationId}`, { method: 'DELETE' });
    } catch (err) {
      console.error(`Cleanup failed for annotation ${annotationId}: ${err.message}`);
    }
  }

  const exitCode = reporter.summary();
  process.exit(exitCode);
}

run().catch((err) => {
  console.error('Fatal error in grn-api integration test runner:', err.message);
  process.exit(1);
});
