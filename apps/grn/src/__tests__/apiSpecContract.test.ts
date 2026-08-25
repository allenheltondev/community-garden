import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

/**
 * The generated reference records only top-level schema names, so nested
 * property names are invisible to the page-level tests. These read the spec
 * directly and pin the field names a client actually has to use — the class of
 * drift this whole reference exists to prevent.
 */
const specDir = resolve(__dirname, '../../../../services/grn-api/openapi/schemas');

interface SchemaNode {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

function loadSchema(file: string): Record<string, SchemaNode> {
  return yaml.load(readFileSync(resolve(specDir, file), 'utf-8')) as Record<string, SchemaNode>;
}

describe('published spec matches the handler wire format', () => {
  it('names the upload header Content-Type, not contentType', () => {
    // PhotoUploadHeaders carries #[serde(rename = "Content-Type")], which
    // overrides the struct's rename_all = "camelCase". This object tells the
    // caller which header to set on the presigned PUT, so a client reading
    // headers.contentType would find nothing and send no content type.
    const intent = loadSchema('journal.yaml').PhotoUploadIntent;
    const headers = intent.properties?.headers as SchemaNode;

    expect(Object.keys(headers.properties ?? {})).toEqual(['Content-Type']);
    expect(headers.required).toEqual(['Content-Type']);
    expect(headers.properties).not.toHaveProperty('contentType');
  });

  it('keeps photoKey on the upload intent, since notes attach by that key', () => {
    const intent = loadSchema('journal.yaml').PhotoUploadIntent;

    expect(intent.required).toContain('photoKey');
    expect(intent.required).toContain('expiresInSeconds');
  });
});
