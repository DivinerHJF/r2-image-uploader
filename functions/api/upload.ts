export interface Env {
  IMAGES: R2Bucket;
  PUBLIC_BASE_URL: string;
  ALLOWED_ORIGIN: string;
  UPLOAD_TOKEN: string;
}

type UploadResponse =
  | { ok: true; key: string; url: string }
  | { ok: false; error: string };

const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/gif"]);

function jsonResponse(body: UploadResponse, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN);
}

function validateAuthorization(request: Request, env: Env): boolean {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && Boolean(token) && Boolean(env.UPLOAD_TOKEN) && token === env.UPLOAD_TOKEN;
}

function validateKey(key: string): string | null {
  if (!key) return "缺少 key 字段。";
  if (key.startsWith("/")) return "key 不能以斜杠开头。";
  if (key.includes("..")) return "key 不能包含 .. 。";
  if (key.includes("\\")) return "key 不能包含反斜杠。";
  if (!key.endsWith(".webp")) return "key 必须以 .webp 结尾。";
  return null;
}

function buildPublicUrl(baseUrl: string, key: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${normalizedBaseUrl}/${encodedKey}`;
}

async function handlePost(context: EventContext<Env, string, Record<string, unknown>>): Promise<Response> {
  const headers = corsHeaders(context.env.ALLOWED_ORIGIN);

  if (!validateAuthorization(context.request, context.env)) {
    return jsonResponse({ ok: false, error: "上传 Token 无效。" }, 401, headers);
  }

  const requestContentType = context.request.headers.get("content-type") || "";
  if (!requestContentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse({ ok: false, error: "请求必须使用 multipart/form-data。" }, 400, headers);
  }

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return jsonResponse({ ok: false, error: "无法读取上传表单。" }, 400, headers);
  }

  const file = formData.get("file");
  const key = String(formData.get("key") || "");
  const contentType = String(formData.get("contentType") || "").toLowerCase();

  if (!(file instanceof File)) {
    return jsonResponse({ ok: false, error: "缺少图片文件。" }, 400, headers);
  }

  const keyError = validateKey(key);
  if (keyError) {
    return jsonResponse({ ok: false, error: keyError }, 400, headers);
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonResponse({ ok: false, error: "不支持的图片类型。" }, 415, headers);
  }

  if (file.size === 0) {
    return jsonResponse({ ok: false, error: "图片文件不能为空。" }, 400, headers);
  }

  if (!context.env.PUBLIC_BASE_URL) {
    return jsonResponse({ ok: false, error: "服务端缺少 PUBLIC_BASE_URL 配置。" }, 500, headers);
  }

  try {
    await context.env.IMAGES.put(key, file, {
      httpMetadata: {
        contentType,
      },
    });
  } catch {
    return jsonResponse({ ok: false, error: "写入 R2 失败。" }, 500, headers);
  }

  return jsonResponse(
    {
      ok: true,
      key,
      url: buildPublicUrl(context.env.PUBLIC_BASE_URL, key),
    },
    200,
    headers,
  );
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!isAllowedOrigin(context.request, context.env)) {
    return jsonResponse({ ok: false, error: "Origin 不被允许。" }, 403);
  }

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.env.ALLOWED_ORIGIN),
    });
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ ok: false, error: "仅支持 POST 请求。" }, 405, {
      ...corsHeaders(context.env.ALLOWED_ORIGIN),
      allow: "POST, OPTIONS",
    });
  }

  return handlePost(context);
};
