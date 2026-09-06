import { Select } from "antd";
import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import "./records.css";

type OptionProps = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
};
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<OptionProps>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join("");
}
export function SelectField({
  children,
  value,
  onValueChange,
  id,
  name,
  disabled,
  required,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  value?: string | number;
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { t } = useTranslation("studio");
  const generatedId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [invalid, setInvalid] = useState(false);
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<OptionProps>(child)
      ? [
          {
            value: String(child.props.value ?? textOf(child.props.children)),
            label: textOf(child.props.children),
            disabled: child.props.disabled,
          },
        ]
      : [],
  );
  const selected = value === undefined ? "" : String(value);
  return (
    <span className={`ui-select-field ${className ?? ""}`} ref={root}>
      <Select
        id={id}
        aria-label={ariaLabel}
        aria-required={required}
        aria-invalid={invalid && !selected}
        aria-describedby={invalid && !selected ? generatedId : undefined}
        value={selected}
        options={options}
        disabled={disabled}
        status={invalid && !selected ? "error" : undefined}
        showSearch={options.length > 10}
        optionFilterProp="label"
        onChange={(next) => {
          setInvalid(false);
          onValueChange(next);
        }}
      />
      {required || name ? (
        <input
          className="ui-select-validation"
          type="text"
          aria-hidden="true"
          tabIndex={-1}
          required={required}
          disabled={disabled}
          name={name}
          value={selected}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            root.current
              ?.querySelector<HTMLInputElement>(".ant-select input")
              ?.focus();
          }}
        />
      ) : null}
      {invalid && !selected ? (
        <span id={generatedId} role="alert" className="ui-control-error">
          {t("inputRequired")}
        </span>
      ) : null}
    </span>
  );
}
