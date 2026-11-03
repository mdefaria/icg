import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import css from "./controls.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export function Field({
  label,
  htmlFor,
  action,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string | undefined;
  action?: ReactNode;
  hint?: string | undefined;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={css.field}>
      <div className={css.labelRow}>
        {htmlFor ? (
          <label className={css.label} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className={css.label}>{label}</span>
        )}
        {action}
      </div>
      {children}
      {error ? (
        <div className={css.error} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className={css.hint}>{hint}</div>
      ) : null}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={css.row}>{children}</div>;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      {title ? <h3 className={css.sectionTitle}>{title}</h3> : null}
      {children}
    </section>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className={css.actions}>{children}</div>;
}

export function Notice({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={cx(css.notice, error && css.noticeError)} role={error ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Button({
  kind = "secondary",
  small,
  grow,
  children,
  ...rest
}: {
  kind?: "primary" | "secondary" | "ghost";
  small?: boolean;
  grow?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type="button"
      className={cx(
        css.button,
        kind === "primary" && css.primary,
        kind === "ghost" && css.ghost,
        small && css.small,
        grow && css.grow,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <div className={css.segmented} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx(css.segment, option.value === value && css.segmentOn)}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Chips<T extends string>({
  label,
  values,
  options,
  onChange,
  hint,
}: {
  label: string;
  values: T[];
  options: { value: T; label: string }[];
  onChange: (values: T[]) => void;
  hint?: string | undefined;
}) {
  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return (
    <Field label={label} hint={hint}>
      <div className={css.chips} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx(css.chip, values.includes(option.value) && css.chipOn)}
            aria-pressed={values.includes(option.value)}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className={css.input}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={css.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Checks({ children }: { children: ReactNode }) {
  return <div className={css.checks}>{children}</div>;
}

export function TextInput({
  label,
  value,
  onCommit,
  validate,
  multiline,
  action,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => string | null;
  multiline?: boolean;
  action?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = validate ? validate(draft) : null;
  const change = (next: string) => {
    setDraft(next);
    if (!validate || validate(next) === null) onCommit(next);
  };
  const props = {
    id,
    value: draft,
    placeholder,
    "aria-invalid": error ? true : undefined,
    className: cx(css.input, multiline && css.textarea, error && css.inputInvalid),
  };
  return (
    <Field label={label} htmlFor={id} action={action} error={error}>
      {multiline ? (
        <textarea {...props} rows={3} onChange={(e) => change(e.target.value)} />
      ) : (
        <input {...props} type="text" onChange={(e) => change(e.target.value)} />
      )}
    </Field>
  );
}

export function NumberInput({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  integer,
  action,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max?: number;
  step?: number;
  integer?: boolean;
  action?: ReactNode;
  hint?: string | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const check = (text: string): string | null => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return "Enter a number";
    if (integer && !Number.isInteger(n)) return "Enter a whole number";
    if (n < min) return `At least ${min}`;
    if (max !== undefined && n > max) return `At most ${max}`;
    return null;
  };
  const error = check(draft);
  return (
    <Field label={label} htmlFor={id} action={action} error={error} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        className={cx(css.input, error && css.inputInvalid)}
        aria-invalid={error ? true : undefined}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          if (check(e.target.value) === null) onCommit(Number(e.target.value));
        }}
      />
    </Field>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} action={<span className={css.label}>{format(value)}</span>}>
      <input
        id={id}
        className={css.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
