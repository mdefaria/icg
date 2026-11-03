import { describe, expect, it } from "vitest";
import { workflowIntegrationCandidates } from "./workflow-integration-paths";

describe("workflowIntegrationCandidates", () => {
  it("prefers a local copy, then Resolve's Developer folder on macOS", () => {
    expect(
      workflowIntegrationCandidates({ platform: "darwin", pluginDir: "/plugins/com.icg", env: {} }),
    ).toEqual([
      "/plugins/com.icg/WorkflowIntegration.node",
      "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node",
      "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePromisePlugin/WorkflowIntegration.node",
      "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/CompatibleSamplePlugin/WorkflowIntegration.node",
    ]);
  });

  it("uses PROGRAMDATA and the Support folder on Windows", () => {
    const candidates = workflowIntegrationCandidates({
      platform: "win32",
      pluginDir: "D:\\plugins\\com.icg",
      env: { PROGRAMDATA: "C:\\ProgramData" },
    });
    expect(candidates[0]).toBe("D:\\plugins\\com.icg\\WorkflowIntegration.node");
    expect(candidates[1]).toBe(
      "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Workflow Integrations\\Examples\\SamplePlugin\\WorkflowIntegration.node",
    );
  });

  it("puts an environment override first", () => {
    const candidates = workflowIntegrationCandidates({
      platform: "darwin",
      pluginDir: "/p",
      env: { ICG_WORKFLOW_INTEGRATION_NODE: "/custom/WorkflowIntegration.node" },
    });
    expect(candidates[0]).toBe("/custom/WorkflowIntegration.node");
  });

  it("only offers the local copy on unsupported platforms", () => {
    expect(workflowIntegrationCandidates({ platform: "linux", pluginDir: "/p", env: {} })).toEqual([
      "/p/WorkflowIntegration.node",
    ]);
  });
});
