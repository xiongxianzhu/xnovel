import { Button, Dropdown } from "antd";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import "./records.css";
export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const Arrow = open ? ChevronUp : ChevronDown;
  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={["click"]}
      transitionName=""
      placement="bottomLeft"
      classNames={{ root: "ui-filter-popup" }}
      menu={{
        selectable: true,
        selectedKeys: [value],
        onClick: ({ key }) => {
          onChange(key);
          setOpen(false);
        },
        items: options.map((option) => ({
          key: option.value,
          label: (
            <span className="ui-filter-option">
              <span className="ui-filter-check">
                {value === option.value ? (
                  <Check aria-hidden size={16} />
                ) : null}
              </span>
              {option.label}
            </span>
          ),
        })),
      }}
    >
      <Button
        className="ui-filter-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{options.find((option) => option.value === value)?.label}</span>
        <Arrow aria-hidden size={14} />
      </Button>
    </Dropdown>
  );
}
