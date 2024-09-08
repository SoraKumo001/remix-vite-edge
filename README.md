# remix-vite-edge

Sample of Remix running on Edge-runtime.

## vitePlugin/index.ts

```ts
import { once } from "node:events";
import { Readable } from "node:stream";
import path from "path";
import { AppLoadContext } from "@remix-run/cloudflare";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { Connect, Plugin as VitePlugin, createViteRuntime } from "vite";
import { PlatformProxy } from "wrangler";
import { EdgeRunner } from "./runner";
import type { ServerResponse } from "node:http";

const exclude = [
  /.*\.css$/,
  /.*\.ts$/,
  /.*\.tsx$/,
  /^\/@.+$/,
  /\?t=\d+$/,
  /^\/favicon\.ico$/,
  /^\/static\/.+/,
  /^\/node_modules\/.*/,
];

type CfProperties = Record<string, unknown>;
type LoadContext<Env, Cf extends CfProperties> = {
  cloudflare: Omit<PlatformProxy<Env, Cf>, "dispose">;
};

type GetLoadContext<Env, Cf extends CfProperties> = (args: {
  request: Request;
  context: LoadContext<Env, Cf>;
}) => AppLoadContext | Promise<AppLoadContext>;

export function devServer<Env, Cf extends CfProperties>(opt?: {
  getLoadContext?: GetLoadContext<Env, Cf> | undefined;
}): VitePlugin {
  const { getLoadContext, ...options } = opt || {};
  const plugin: VitePlugin = {
    name: "edge-dev-server",
    configureServer: async (viteDevServer) => {
      const { getPlatformProxy } = await import("wrangler");
      const cloudflare = await getPlatformProxy<Env, Cf>(options);

      const context = { cloudflare };
      const runner = new EdgeRunner();
      const runtime = await createViteRuntime(viteDevServer, { runner });

      if (!viteDevServer.config.server.middlewareMode) {
        viteDevServer.middlewares.use(async (req, nodeRes, next) => {
          try {
            for (const pattern of exclude) {
              if (req.url) {
                if (pattern instanceof RegExp) {
                  if (pattern.test(req.url)) {
                    next();
                    return;
                  }
                }
              }
            }

            const appModule = await runtime.executeEntrypoint(
              path.resolve(__dirname, "server.ts")
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const app: any = appModule["default"];
            const request = toRequest(req);

            const loadContext = getLoadContext
              ? await getLoadContext({ request: request.clone(), context })
              : context;

            const res: Response = await app(request, loadContext);
            if (res.status === 404) {
              next();
              return;
            }
            await toResponse(res, nodeRes);
          } catch (error) {
            next(error);
          }
        });
      }

      return () => {
        return null;
      };
    },

    config: () => {
      return {
        ssr: {
          resolve: {
            externalConditions: ["workerd", "worker"],
          },
        },
      };
    },
  };
  return plugin;
}

export function toRequest(nodeReq: Connect.IncomingMessage): Request {
  const origin =
    nodeReq.headers.origin && "null" !== nodeReq.headers.origin
      ? nodeReq.headers.origin
      : `http://${nodeReq.headers.host}`;
  const url = new URL(nodeReq.originalUrl!, origin);

  const headers = Object.entries(nodeReq.headers).reduce(
    (headers, [key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else if (typeof value === "string") {
        headers.append(key, value);
      }
      return headers;
    },
    new Headers()
  );

  const init: RequestInit = {
    method: nodeReq.method,
    headers,
  };

  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    init.body = createReadableStreamFromReadable(nodeReq);
    (init as { duplex: "half" }).duplex = "half";
  }

  return new Request(url.href, init);
}

export async function toResponse(res: Response, nodeRes: ServerResponse) {
  nodeRes.statusCode = res.status;
  nodeRes.statusMessage = res.statusText;
  nodeRes.writeHead(res.status, Array.from(res.headers.entries()));
  if (res.body) {
    const readable = Readable.from(
      res.body as unknown as AsyncIterable<Uint8Array>
    );
    readable.pipe(nodeRes);
    await once(readable, "end");
  } else {
    nodeRes.end();
  }
}
```

## vitePlugin/runner.ts

```ts
import { EdgeVM } from "@edge-runtime/vm";
import {
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/runtime";
import type { ViteModuleRunner, ViteRuntimeModuleContext } from "vite/runtime";

export class EdgeRunner implements ViteModuleRunner {
  constructor(private vm = new EdgeVM()) {}
  runViteModule(context: ViteRuntimeModuleContext, code: string) {
    const run = this.vm.evaluate(
      `(async(${ssrExportAllKey},${ssrModuleExportsKey},${ssrImportMetaKey},${ssrImportKey},${ssrDynamicImportKey})=>{${code}})`
    );
    return run(
      context[ssrExportAllKey],
      context[ssrModuleExportsKey],
      context[ssrImportMetaKey],
      context[ssrImportKey],
      context[ssrDynamicImportKey]
    );
  }

  runExternalModule(filepath: string) {
    return import(filepath);
  }
}
```

## vitePlugin/server.ts

```ts
import { createRequestHandler } from "@remix-run/cloudflare";
import type { AppLoadContext } from "@remix-run/cloudflare";

const app = async (req: Request, context: AppLoadContext) => {
  // @ts-expect-error it's not typed
  // eslint-disable-next-line import/no-unresolved
  const build = await import("virtual:remix/server-build");
  const handler = createRequestHandler(build);
  return handler(req, context);
};

export default app;
```
