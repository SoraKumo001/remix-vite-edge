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
