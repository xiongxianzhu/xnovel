import { Button, Tooltip } from "antd";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import "./records.css";

export function RowAction({
  label,
  icon: Icon,
  to,
  onClick,
  danger = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const content =
    to && !disabled && !loading ? (
      <Link
        to={to}
        aria-label={label}
        className={`record-action${danger ? " record-action-danger" : ""}`}
      >
        <Icon aria-hidden size={16} />
      </Link>
    ) : (
      <Button
        className={`record-action${danger ? " record-action-danger" : ""}`}
        aria-label={label}
        type="text"
        icon={<Icon aria-hidden size={16} />}
        danger={danger}
        disabled={disabled}
        loading={loading}
        onClick={onClick}
      />
    );
  return (
    <Tooltip title={label} trigger={["hover", "focus"]}>
      {content}
    </Tooltip>
  );
}
