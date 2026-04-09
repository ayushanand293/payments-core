import type { SelectHTMLAttributes } from "react";

type Props = {
  label?: string;
  hint?: string;
  error?: string | null;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ label, hint, error, id, className = "", children, ...props }: Props) {
  const inputId = id || props.name || "select";
  return (
    <label className="ui-field" htmlFor={inputId}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <select id={inputId} {...props} className={["ui-input", error ? "has-error" : "", className].filter(Boolean).join(" ")}>
        {children}
      </select>
      {error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  );
}
