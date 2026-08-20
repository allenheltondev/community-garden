#!/usr/bin/env node
/**
 * Turns the GRN OpenAPI spec into the JSON the in-app API reference renders.
 *
 * The reference is generated rather than written by hand so it cannot drift
 * from the contract the API actually serves. `npm run api-reference:check`
 * fails when the committed output no longer matches the spec, which is what
 * keeps a spec change from silently shipping stale docs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../..');
const SPEC_PATH = resolvePath(repoRoot, 'services/grn-api/openapi.yaml');
const OUTPUT_PATH = resolvePath(here, '../src/generated/apiReference.json');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const fileCache = new Map();

function loadYaml(absolutePath) {
  if (!fileCache.has(absolutePath)) {
    fileCache.set(absolutePath, yaml.load(readFileSync(absolutePath, 'utf-8')));
  }
  return fileCache.get(absolutePath);
}

/** JSON-pointer segments escape `/` as `~1` and `~` as `~0`. */
function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function followPointer(document, pointer) {
  if (!pointer || pointer === '/') return document;
  return pointer
    .replace(/^#?\//, '')
    .split('/')
    .filter(Boolean)
    .reduce((node, rawSegment) => {
      if (node === undefined || node === null) return undefined;
      return node[decodePointerSegment(rawSegment)];
    }, document);
}

/**
 * Resolve a single `$ref` relative to the file that contains it. Refs are
 * followed a bounded number of times so a spec that accidentally points at
 * itself fails loudly here instead of hanging the build.
 */
function resolveRef(ref, containingFile, depth = 0) {
  if (depth > 10) {
    throw new Error(`$ref nested too deeply, starting at ${ref} in ${containingFile}`);
  }

  const [filePart, pointerPart = ''] = ref.split('#');
  const targetFile = filePart
    ? resolvePath(dirname(containingFile), filePart)
    : containingFile;
  const resolved = followPointer(loadYaml(targetFile), pointerPart);

  if (resolved && typeof resolved === 'object' && typeof resolved.$ref === 'string') {
    return resolveRef(resolved.$ref, targetFile, depth + 1);
  }

  return { value: resolved, file: targetFile };
}

function deref(node, containingFile) {
  if (node && typeof node === 'object' && typeof node.$ref === 'string') {
    return resolveRef(node.$ref, containingFile);
  }
  return { value: node, file: containingFile };
}

function describeSchema(schema, containingFile) {
  const { value } = deref(schema, containingFile);
  if (!value || typeof value !== 'object') return undefined;
  if (value.type === 'array') {
    const item = deref(value.items, containingFile).value;
    const itemType = item?.title ?? item?.type ?? 'object';
    return `array of ${itemType}`;
  }
  return value.title ?? value.type ?? 'object';
}

function collectParameters(rawParameters, containingFile) {
  if (!Array.isArray(rawParameters)) return [];
  return rawParameters.map((rawParameter) => {
    const { value: parameter, file } = deref(rawParameter, containingFile);
    const schema = deref(parameter.schema ?? {}, file).value ?? {};
    return {
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required),
      type: schema.format ? `${schema.type} (${schema.format})` : schema.type ?? 'string',
      description: parameter.description ?? null,
    };
  });
}

function collectResponses(rawResponses, containingFile) {
  if (!rawResponses || typeof rawResponses !== 'object') return [];
  return Object.entries(rawResponses).map(([status, rawResponse]) => {
    const { value: response, file } = deref(rawResponse, containingFile);
    const content = response?.content ?? {};
    const [contentType] = Object.keys(content);
    return {
      status,
      description: response?.description ?? null,
      shape: contentType ? describeSchema(content[contentType]?.schema, file) ?? null : null,
    };
  });
}

function collectRequestBody(rawBody, containingFile) {
  if (!rawBody) return null;
  const { value: body, file } = deref(rawBody, containingFile);
  if (!body) return null;
  const content = body.content ?? {};
  const [contentType] = Object.keys(content);
  return {
    required: Boolean(body.required),
    contentType: contentType ?? 'application/json',
    shape: contentType ? describeSchema(content[contentType]?.schema, file) ?? null : null,
  };
}

function build() {
  const spec = loadYaml(SPEC_PATH);
  const operations = [];

  for (const [path, rawPathItem] of Object.entries(spec.paths ?? {})) {
    const { value: pathItem, file: pathFile } = deref(rawPathItem, SPEC_PATH);
    // A $ref that resolves to nothing means a typo in the spec. Skipping it
    // would drop the endpoint from the docs without anything going red, so
    // stop instead: silently incomplete documentation is worse than none.
    if (!pathItem) {
      throw new Error(
        `${path} could not be resolved. Check its $ref in services/grn-api/openapi.yaml.`
      );
    }

    const methodsOnPath = METHODS.filter((method) => pathItem[method]);
    if (methodsOnPath.length === 0) {
      throw new Error(`${path} resolved but declares no HTTP methods.`);
    }

    // Parameters declared on the path apply to every method under it.
    const sharedParameters = collectParameters(pathItem.parameters, pathFile);

    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      operations.push({
        path,
        method: method.toUpperCase(),
        operationId: operation.operationId ?? null,
        summary: operation.summary ?? null,
        description: operation.description ?? null,
        tags: operation.tags ?? [],
        // An operation opts out of the spec-wide bearer requirement with an
        // empty security array; anything else inherits it.
        requiresAuth: !(Array.isArray(operation.security) && operation.security.length === 0),
        parameters: [...sharedParameters, ...collectParameters(operation.parameters, pathFile)],
        requestBody: collectRequestBody(operation.requestBody, pathFile),
        responses: collectResponses(operation.responses, pathFile),
      });
    }
  }

  operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return {
    title: spec.info?.title ?? 'API',
    version: spec.info?.version ?? null,
    description: spec.info?.description?.trim() ?? null,
    source: 'services/grn-api/openapi.yaml',
    tags: (spec.tags ?? []).map((tag) => ({
      name: tag.name,
      description: tag.description ?? null,
    })),
    operations,
  };
}

const reference = build();
const serialised = `${JSON.stringify(reference, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = readFileSync(OUTPUT_PATH, 'utf-8');
  if (existing !== serialised) {
    console.error(
      'apiReference.json is out of date with services/grn-api/openapi.yaml.\n' +
        'Run `npm run api-reference --workspace apps/grn` and commit the result.'
    );
    process.exit(1);
  }
  console.log(`API reference is in sync (${reference.operations.length} operations).`);
} else {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialised);
  console.log(`Wrote ${reference.operations.length} operations to src/generated/apiReference.json`);
}
