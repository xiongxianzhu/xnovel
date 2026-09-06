import { Table, type TableProps, type TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";
import "./records.css";

export function RecordTable<T extends object>({
  columns,
  items,
  emptyText,
  rowKey = "id",
  pagination = false,
}: {
  columns: TableColumnsType<T>;
  items: readonly T[];
  emptyText?: string;
  rowKey?: string;
  pagination?: TableProps<T>["pagination"];
}) {
  const { t } = useTranslation("studio");
  const width = columns.reduce(
    (total, column) =>
      total + (typeof column.width === "number" ? column.width : 160),
    0,
  );
  return (
    <div className="record-table-shell">
      <Table<T>
        rowKey={rowKey}
        columns={columns}
        dataSource={[...items]}
        pagination={pagination}
        tableLayout="fixed"
        scroll={{ x: width }}
        locale={{ emptyText: emptyText ?? t("empty") }}
      />
    </div>
  );
}
