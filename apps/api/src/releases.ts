import { Device } from "@icg/shared";
import { z } from "zod";

export const Host = Device.shape.host;
export type Host = z.infer<typeof Host>;

export interface Release {
  latest: string;
  artifact: string | null;
  notes: string;
}

export const RELEASES: Record<Host, Release> = {
  premiere: {
    latest: "0.1.0",
    artifact: "icg-premiere-0.1.0.zip",
    notes: "First Premiere Pro build: CEP panel, one Template, Insert at playhead.",
  },
  resolve: {
    latest: "0.1.0",
    artifact: "icg-resolve-0.1.0.zip",
    notes: "First DaVinci Resolve Studio build: Workflow Integration plugin shell.",
  },
  web: {
    latest: "0.1.0",
    artifact: null,
    notes: "Web app is served from the site; reload to update.",
  },
};

export const ARTIFACTS: Record<string, { contentType: string }> = {
  "icg-premiere-0.1.0.zip": { contentType: "application/zip" },
  "icg-resolve-0.1.0.zip": { contentType: "application/zip" },
};

export const VersionResponse = z.object({
  latest: z.string().min(1),
  url: z.url(),
  notes: z.string(),
});
export type VersionResponse = z.infer<typeof VersionResponse>;

export function versionFor(host: Host, apiOrigin: string, siteUrl: string): VersionResponse {
  const release = RELEASES[host];
  return {
    latest: release.latest,
    url: release.artifact ? `${apiOrigin}/download/${release.artifact}` : `${siteUrl}/app`,
    notes: release.notes,
  };
}
