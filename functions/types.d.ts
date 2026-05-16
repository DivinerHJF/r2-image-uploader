type R2PutValue = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob;

interface R2Bucket {
  put(
    key: string,
    value: R2PutValue,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    },
  ): Promise<unknown>;
}

interface EventContext<Env = unknown, Params extends string = string, Data = Record<string, unknown>> {
  request: Request;
  env: Env;
  params: Record<Params, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data: Data;
}

type PagesFunction<Env = unknown> = (
  context: EventContext<Env, string, Record<string, unknown>>,
) => Response | Promise<Response>;
