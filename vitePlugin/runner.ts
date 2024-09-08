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
