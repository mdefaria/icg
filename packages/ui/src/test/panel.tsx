import { FakeHostAdapter, type FakeHostOptions } from "@icg/host-sdk";
import type { Overlay, OverlaySpec } from "@icg/shared";
import { render as mount, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ActivationClient } from "../activation";
import { FakeEngine } from "../fakes";
import { IcgPanel } from "../IcgPanel";
import { createMemorySettings } from "../settings";

export const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function setup(
  options: {
    host?: FakeHostOptions;
    settings?: Record<string, unknown>;
    activation?: ActivationClient;
  } = {},
) {
  const host = new FakeHostAdapter(options.host);
  const engine = new FakeEngine({ seed: "test", avatarIds: ["a-01", "a-02"] });
  const settings = createMemorySettings(options.settings);
  const render = vi.fn(async (spec: OverlaySpec): Promise<Overlay> => ({
    png: PNG,
    frame: spec.frame,
    spec,
  }));
  const user = userEvent.setup();
  const view = mount(
    <IcgPanel
      engine={engine}
      host={host}
      render={render}
      settings={settings}
      {...(options.activation ? { activation: options.activation } : {})}
    />,
  );
  return { host, engine, settings, render, user, view };
}

export const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
export const button = (name: string | RegExp) => screen.getByRole("button", { name });
