import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The Entitlement Matrix is the only place that proves free-tier callers are
// locked out of premium endpoints, and it is only meaningful if those requests
// actually carry the free-tier token.
//
// The collection sets bearer auth from `{{authToken}}`, which CI fills with the
// *pro* token. A request that expresses its token as a manual Authorization
// header is therefore at the mercy of header-versus-auth precedence in whatever
// Postman CLI version CI installed that day: when collection auth wins, every
// "free tier is blocked" assertion silently runs as pro. Declaring request-level
// auth removes the ambiguity, and this test keeps it that way.

const here = path.dirname(fileURLToPath(import.meta.url));
const matrixDir = path.resolve(
  here,
  "../../../../postman/collections/Good Roots Network API - Utility Tests/Entitlement Matrix"
);

const freeRequests = readdirSync(matrixDir).filter(
  (name) => name.startsWith("Free - ") && name.endsWith(".request.yaml")
);

test("the entitlement matrix still has free-tier requests to check", () => {
  assert.ok(freeRequests.length > 0, "expected at least one Free - *.request.yaml");
});

for (const name of freeRequests) {
  test(`${name} sends the free-tier token as request auth`, () => {
    const contents = readFileSync(path.join(matrixDir, name), "utf-8");

    assert.match(
      contents,
      /^auth:\n {2}type: bearer\n {2}credentials:\n {4}- key: token\n {6}value: '\{\{freeAuthToken\}\}'$/m,
      "must declare request-level bearer auth using {{freeAuthToken}}"
    );

    assert.doesNotMatch(
      contents,
      /key: Authorization/,
      "must not set Authorization manually; collection-level auth can override it"
    );
  });
}
