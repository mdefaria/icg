export const MODULE_FILE = "WorkflowIntegration.node";
export const MODULE_PATH_ENV = "ICG_WORKFLOW_INTEGRATION_NODE";

export type PathContext = {
  platform: NodeJS.Platform;
  pluginDir: string;
  env: Record<string, string | undefined>;
};

export function resolveSupportRoot(ctx: PathContext): string | null {
  if (ctx.platform === "darwin") {
    return "/Library/Application Support/Blackmagic Design/DaVinci Resolve";
  }
  if (ctx.platform === "win32") {
    const programData = ctx.env.PROGRAMDATA ?? "C:\\ProgramData";
    return `${programData}\\Blackmagic Design\\DaVinci Resolve\\Support`;
  }
  return null;
}

export function workflowIntegrationCandidates(ctx: PathContext): string[] {
  const separator = ctx.platform === "win32" ? "\\" : "/";
  const join = (...parts: string[]) => parts.join(separator);
  const candidates: string[] = [];
  const override = ctx.env[MODULE_PATH_ENV];
  if (override) candidates.push(override);
  candidates.push(join(ctx.pluginDir, MODULE_FILE));
  const root = resolveSupportRoot(ctx);
  if (root) {
    const developer = join(root, "Developer", "Workflow Integrations", "Examples");
    candidates.push(join(developer, "SamplePlugin", MODULE_FILE));
    candidates.push(join(developer, "SamplePromisePlugin", MODULE_FILE));
    candidates.push(join(developer, "CompatibleSamplePlugin", MODULE_FILE));
  }
  return candidates;
}
