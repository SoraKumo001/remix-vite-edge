import { EdgeVM } from "@edge-runtime/vm";

import {
  ModuleRunner,
  ModuleRunnerContext,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/module-runner";

import { fetchModule, ViteDevServer } from "vite";

export class EdgeRunner extends ModuleRunner {
  vm: EdgeVM;
  constructor(viteDevServer: ViteDevServer) {
    const vm = new EdgeVM({ initialCode: `` });
    super(
      {
        root: "/",
        transport: {
          fetchModule: async (id, importer, option) => {
            return fetchModule(
              viteDevServer.environments.ssr,
              id,
              importer,
              option
            );
          },
        },
      },
      {
        runInlinedModule(context: ModuleRunnerContext, code: string) {
          const run = vm.evaluate(
            `'use strict';(async(${ssrExportAllKey},${ssrModuleExportsKey},${ssrImportMetaKey},${ssrImportKey},${ssrDynamicImportKey})=>{${code}})`
          );
          return run(
            context[ssrExportAllKey],
            context[ssrModuleExportsKey],
            context[ssrImportMetaKey],
            context[ssrImportKey],
            context[ssrDynamicImportKey]
          );
        },
        runExternalModule: (file: string) => {
          return import(file);
        },
      }
    );
    this.vm = new EdgeVM();
  }
}
