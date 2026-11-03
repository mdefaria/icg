import type { Author } from "@icg/shared";
import { usePanel } from "../context";
import { Checkbox, Row, Section, TextInput } from "../controls";
import { useSetting } from "../settings";
import { AvatarField } from "./AvatarField";

export const required = (v: string) => (v.trim() === "" ? "Required" : null);

export function CreatorSection() {
  const { settings } = usePanel();
  const [creator, setCreator] = useSetting(settings, "creator");
  const update = (patch: Partial<Author>) => setCreator({ ...creator, ...patch });
  return (
    <Section title="Creator">
      <Row>
        <TextInput
          label="Creator username"
          value={creator.username}
          validate={required}
          onCommit={(username) => update({ username })}
        />
        <TextInput
          label="Creator display name"
          value={creator.displayName}
          onCommit={(displayName) => update({ displayName })}
        />
      </Row>
      <AvatarField
        label="Creator Avatar"
        avatar={creator.avatar}
        onChange={(avatar) => update({ avatar })}
      />
      <Checkbox
        label="Creator verified"
        checked={creator.verified}
        onChange={(verified) => update({ verified })}
      />
    </Section>
  );
}
