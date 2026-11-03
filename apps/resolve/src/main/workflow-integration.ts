import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { HostStatus } from "../ipc/contract";
import type { HostInfo } from "@icg/shared";
import type { ResolveApi, WorkflowIntegrationModule } from "./resolve-types";
import { workflowIntegrationCandidates } from "./workflow-integration-paths";

export const PLUGIN_ID = "com.icg.resolve";

export type Connection =
  | {
      status: HostStatus & { state: "ready" };
      resolve: ResolveApi;
      module: WorkflowIntegrationModule;
    }
  | { status: Exclude<HostStatus, { state: "ready" }>; resolve: null; module: null };

const hostOs = (): HostInfo["os"] =>
  process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "other";

export async function connect(pluginDir: string): Promise<Connection> {
  const info: HostInfo = { kind: "resolve", version: "unknown", os: hostOs() };
  const candidates = workflowIntegrationCandidates({
    platform: process.platform,
    pluginDir,
    env: process.env,
  });
  const modulePath = candidates.find((candidate) => existsSync(candidate));
  if (!modulePath) {
    return {
      status: { state: "module-missing", info, triedPaths: candidates },
      resolve: null,
      module: null,
    };
  }

  let module: WorkflowIntegrationModule;
  try {
    module = createRequire(__filename)(modulePath) as WorkflowIntegrationModule;
  } catch (error) {
    return {
      status: { state: "module-failed", info, modulePath, message: describe(error) },
      resolve: null,
      module: null,
    };
  }

  try {
    if (!(await module.Initialize(PLUGIN_ID))) {
      return {
        status: { state: "init-failed", info, modulePath, message: "Initialize returned false" },
        resolve: null,
        module: null,
      };
    }
    const resolve = await module.GetResolve();
    if (!resolve) {
      return {
        status: { state: "init-failed", info, modulePath, message: "GetResolve returned nothing" },
        resolve: null,
        module: null,
      };
    }
    const productName = String(await resolve.GetProductName());
    const moduleInfo = module.GetInfo ? await module.GetInfo() : null;
    return {
      status: {
        state: "ready",
        info: { ...info, version: String(await resolve.GetVersionString()) },
        productName,
        isStudio: /studio/i.test(productName),
        modulePath,
        moduleVersion: moduleInfo?.version ?? null,
      },
      resolve,
      module,
    };
  } catch (error) {
    return {
      status: { state: "init-failed", info, modulePath, message: describe(error) },
      resolve: null,
      module: null,
    };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
