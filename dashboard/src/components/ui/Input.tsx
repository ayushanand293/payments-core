import type { InputHTMLAttributes } from "react";

type Props = {
  label?: string;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>;

export function Input({ label, hint, error, id, className = "", ...props }: Props) {
  const inputId = id || props.name || "input";
  return (
    <label className="ui-field" htmlFor={inputId}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <input id={inputId} {...props} className={["ui-input", error ? "has-error" : "", className].filter(Boolean).join(" ")} />
      {error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  );
}
