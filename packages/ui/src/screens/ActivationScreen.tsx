import { ActivationResult } from "@icg/shared";
import { useState } from "react";
import type { ActivationClient, ActivationStatus } from "../activation";
import { errorMessage } from "../cards";
import { Actions, Button, Notice, TextInput } from "../controls";
import css from "./screens.module.css";

type Outcome = { kind: "result"; result: ActivationResult } | { kind: "error"; message: string };

const STATUS_TEXT: Record<ActivationStatus, string> = {
  unknown: "Checking Activation on this Device.",
  active: "ICG is activated on this Device and works offline.",
  inactive: "ICG is not activated on this Device yet.",
};

export function ActivationScreen({
  client,
  onDone,
  onStatus,
}: {
  client: ActivationClient;
  onDone: () => void;
  onStatus: (status: ActivationStatus) => void;
}) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<ActivationStatus>(() => client.status());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const activate = async () => {
    setBusy(true);
    try {
      const result = ActivationResult.parse(await client.activate(key.trim()));
      setOutcome({ kind: "result", result });
    } catch (e) {
      setOutcome({ kind: "error", message: errorMessage(e) });
    }
    const next = client.status();
    setStatus(next);
    onStatus(next);
    setBusy(false);
  };

  return (
    <div>
      <h2 className={css.title}>Activation</h2>
      <Notice>{STATUS_TEXT[status]}</Notice>
      <p className={css.paragraph}>
        Paste the Key from your purchase email. Activation needs a connection once; after that ICG
        works offline.
      </p>
      <TextInput label="Key" value={key} multiline placeholder="ICG1-..." onCommit={setKey} />
      <Actions>
        <Button kind="primary" disabled={busy || key.trim() === ""} onClick={() => void activate()}>
          {busy ? "Activating" : "Activate"}
        </Button>
        <Button onClick={onDone}>Back</Button>
      </Actions>
      {outcome ? <OutcomeNotice outcome={outcome} /> : null}
    </div>
  );
}

function OutcomeNotice({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "error") {
    return <Notice error>Could not activate: {outcome.message}</Notice>;
  }
  const { result } = outcome;
  switch (result.status) {
    case "activated":
      return <Notice>Activated. This Device is now counted against your Key.</Notice>;
    case "invalid-key":
      return <Notice error>This Key is not valid. Check it was pasted in full.</Notice>;
    case "device-limit":
      return (
        <Notice error>
          This Key is already active on {result.devices.length} Devices
          {result.devices.length > 0 ? `: ${result.devices.map((d) => d.name).join(", ")}` : ""}.
          Remove one on the Device page, then try again.
        </Notice>
      );
  }
}
