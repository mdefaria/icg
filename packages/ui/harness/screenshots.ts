import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createServer } from "vite";

type Locator = {
  click(): Promise<void>;
  first(): Locator;
  waitFor(options?: { state?: string; timeout?: number }): Promise<void>;
  screenshot(options: { path: string }): Promise<void>;
  count(): Promise<number>;
};
type Page = {
  goto(url: string): Promise<unknown>;
  getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator;
  getByTestId(id: string): Locator;
  locator(selector: string): Locator;
  waitForFunction(fn: string, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
  on(
    event: "pageerror" | "console",
    listener: (value: { message?: string; text?: () => string; type?: () => string }) => void,
  ): void;
  evaluate(fn: string): Promise<unknown>;
};
type Browser = {
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
};

const { chromium } = createRequire(import.meta.url)("playwright") as {
  chromium: { launch(): Promise<Browser> };
};

const harness = import.meta.dirname;
const out = join(harness, "screenshots");
mkdirSync(out, { recursive: true });

const server = await createServer({
  configFile: join(harness, "vite.config.ts"),
  logLevel: "warn",
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("vite did not report a URL");

const PREVIEWS_DONE =
  "document.querySelectorAll('[data-testid=card-skeleton]').length === 0 && !document.querySelector('[aria-busy=true]')";

const OVERFLOW =
  "(() => { const p = document.querySelector('[data-testid=icg-panel]'); return p.scrollWidth - p.clientWidth; })()";
const INSERT_DONE =
  "[...document.querySelectorAll('[data-testid^=insert-status-]')].every(e => /Inserted|Failed|Downloaded|No sequence/.test(e.textContent))";

const browser = await chromium.launch();
const errors: string[] = [];

async function open(query: string, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: width + 40, height: 1400 } });
  page.on("pageerror", (e) => errors.push(`${query}: ${e.message}`));
  await page.goto(`${base}?${query}`);
  await page.getByRole("button", { name: "Generate", exact: true }).waitFor({ timeout: 20000 });
  return page;
}

async function walk(page: Page, label: string, shot: (name: string) => Promise<void>) {
  const step = async (name: string) => {
    const overflow = (await page.evaluate(OVERFLOW)) as number;
    if (overflow > 0) errors.push(`${label}/${name}: ${overflow}px horizontal overflow`);
    await shot(name);
  };
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForFunction(PREVIEWS_DONE, undefined, { timeout: 20000 });
  await step("generate");

  await page.getByRole("button", { name: "Edit Comment 1" }).click();
  await page.waitForFunction(PREVIEWS_DONE, undefined, { timeout: 20000 });
  await step("edit");

  await page.getByRole("tab", { name: "Placement" }).click();
  await page.waitForFunction(PREVIEWS_DONE, undefined, { timeout: 20000 });
  await step("placement");

  await page.getByRole("tab", { name: /Insert/ }).click();
  await page.getByRole("button", { name: /Insert at playhead|Download PNG/ }).click();
  await page.waitForFunction(INSERT_DONE, undefined, { timeout: 20000 });
  await step("insert");

  await page.getByRole("button", { name: "Enter Key" }).click();
  await step("activation");
}

try {
  for (const width of [360, 480]) {
    for (const theme of ["dark", "light"] as const) {
      const page = await open(`theme=${theme}&width=${width}&update=true`, width);
      const panel = page.locator("#panel");
      await walk(page, `${width}/${theme}`, (name) =>
        panel.screenshot({ path: join(out, `${name}-${width}-${theme}.png`) }),
      );
    }
  }

  const narrow = await open("theme=dark&width=320&update=true", 320);
  await walk(narrow, "320/dark", async () => {});

  const variant = await open("theme=dark&width=360", 360);
  await variant.getByRole("button", { name: "Instagram", exact: true }).click();
  await variant.getByRole("button", { name: "Creator reply", exact: true }).click();
  await variant.getByRole("button", { name: "ES", exact: true }).click();
  await variant.getByRole("button", { name: "Generate", exact: true }).click();
  await variant.waitForFunction(PREVIEWS_DONE, undefined, { timeout: 20000 });
  await variant
    .locator("[aria-label=Comments]")
    .screenshot({ path: join(out, "generate-instagram-creator-reply-360-dark.png") });

  const wide = await open("theme=light&width=360&sequence=landscape&canInsert=false", 360);
  await wide.getByRole("button", { name: "X", exact: true }).click();
  await walk(wide, "360/landscape", async (name) => {
    if (name === "placement" || name === "insert")
      await wide
        .locator("#panel")
        .screenshot({ path: join(out, `${name}-x-landscape-360-light.png`) });
  });
} finally {
  await browser.close();
  await server.close();
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`screenshots written to ${out}`);
}
