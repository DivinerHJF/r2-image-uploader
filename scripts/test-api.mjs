import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { readFileSync } from "node:fs";
import ts from "typescript";

if (!globalThis.File) globalThis.File = NodeFile;

const source = readFileSync(new URL("../functions/api/upload.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2023 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { onRequest } = await import(moduleUrl);

class MemoryBucket {
  constructor(keys = []) {
    this.keys = new Map(keys.map((key) => [key, { existing: true }]));
    this.headCalls = [];
    this.putCalls = [];
  }

  async head(key) {
    this.headCalls.push(key);
    return this.keys.get(key) || null;
  }

  async put(key, value, options) {
    this.putCalls.push({ key, value, options });
    this.keys.set(key, { value, options });
  }
}

function makeContext({
  bucket = new MemoryBucket(),
  origin = "https://img-admin.philohao.com",
  authorization = "Bearer test-token",
  method = "POST",
  key = "blog/2026/07/trip-01.webp",
  conflictPolicy = "rename",
  contentType = "image/webp",
} = {}) {
  const headers = new Headers({ origin });
  if (authorization) headers.set("authorization", authorization);
  let body;
  if (method === "POST") {
    body = new FormData();
    body.set("file", new File([new Uint8Array([82, 50])], "image.webp", { type: contentType }));
    body.set("key", key);
    body.set("contentType", contentType);
    body.set("conflictPolicy", conflictPolicy);
  }
  return {
    bucket,
    context: {
      request: new Request("https://img-admin.philohao.com/api/upload", { method, headers, body }),
      env: {
        IMAGES: bucket,
        PUBLIC_BASE_URL: "https://img.philohao.com/",
        ALLOWED_ORIGIN: "https://img-admin.philohao.com",
        UPLOAD_TOKEN: "test-token",
      },
      params: {},
      data: {},
      waitUntil() {},
      next() { throw new Error("next() should not be called"); },
    },
  };
}

async function invoke(options) {
  const setup = makeContext(options);
  const response = await onRequest(setup.context);
  const payload = response.status === 204 ? null : await response.json();
  return { ...setup, response, payload };
}

{
  const { response, bucket } = await invoke({ origin: "https://evil.example" });
  assert.equal(response.status, 403);
  assert.equal(bucket.putCalls.length, 0);
}

{
  const { response, bucket } = await invoke({ authorization: "" });
  assert.equal(response.status, 401);
  assert.equal(bucket.putCalls.length, 0);
}

{
  const key = "blog/2026/07/trip-01.webp";
  const bucket = new MemoryBucket([key, "blog/2026/07/trip-01-2.webp"]);
  const { response, payload } = await invoke({ bucket, key, conflictPolicy: "rename" });
  assert.equal(response.status, 200);
  assert.equal(payload.key, "blog/2026/07/trip-01-3.webp");
  assert.equal(payload.renamed, true);
  assert.deepEqual(bucket.headCalls, [key, "blog/2026/07/trip-01-2.webp", "blog/2026/07/trip-01-3.webp"]);
  assert.equal(bucket.putCalls[0].key, payload.key);
}

{
  const key = "blog/2026/07/trip-01.webp";
  const bucket = new MemoryBucket([key]);
  const { response, payload } = await invoke({ bucket, key, conflictPolicy: "cancel" });
  assert.equal(response.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(bucket.putCalls.length, 0);
}

{
  const key = "blog/2026/07/trip-01.webp";
  const bucket = new MemoryBucket([key]);
  const { response, payload } = await invoke({ bucket, key, conflictPolicy: "overwrite" });
  assert.equal(response.status, 200);
  assert.equal(payload.key, key);
  assert.equal(payload.renamed, false);
  assert.equal(bucket.headCalls.length, 0);
  assert.equal(bucket.putCalls[0].key, key);
}

{
  const { response } = await invoke({ key: "../invalid.webp" });
  assert.equal(response.status, 400);
}

console.log("Pages Function API tests passed (origin, auth, key validation, rename, cancel, overwrite).\n");
