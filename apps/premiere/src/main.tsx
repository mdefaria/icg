import { FakeHostAdapter } from "@icg/host-sdk";
import { createRoot } from "react-dom/client";
import { PremiereHostAdapter } from "./adapter/PremiereHostAdapter";
import { App } from "./App";
import { createNodeBinaryLoader, fetchBinaryLoader } from "./cep/assets";
import { SYSTEM_PATH_EXTENSION, cepNode, createCSInterface } from "./cep/globals";

const premiere = PremiereHostAdapter.fromCep();
const host =
  premiere ?? new FakeHostAdapter({ info: { kind: "premiere", version: "browser", os: "other" } });
const cs = createCSInterface();
const node = cepNode();
const loader =
  cs && node
    ? createNodeBinaryLoader(node, cs.getSystemPath(SYSTEM_PATH_EXTENSION))
    : fetchBinaryLoader;

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");
createRoot(container).render(
  <App
    host={host}
    files={premiere?.files ?? null}
    loader={loader}
    ping={premiere ? () => premiere.ping() : null}
  />,
);
