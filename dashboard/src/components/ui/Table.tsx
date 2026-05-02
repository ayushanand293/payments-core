import { Search } from "lucide-react";
import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyState?: ReactNode;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
};

export function EmptyState({ title = "No rows", description }: { title?: ReactNode; description?: ReactNode }) {
  return (
    <div className="ui-empty-state">
      <div className="ui-empty-state__mark" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function Table<T>({ columns, rows, rowKey, emptyState, sortKey, sortDirection, onSort, searchValue, onSearchChange, searchPlaceholder = "Search", actions }: Props<T>) {
  return (
    <div className="ui-data-table">
      {onSearchChange || actions ? (
        <div className="ui-table-toolbar">
          {onSearchChange ? (
            <label className="ui-search-field">
              <Search size={15} aria-hidden="true" />
              <input value={searchValue ?? ""} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} />
            </label>
          ) : <span />}
          {actions ? <div className="ui-table-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                {column.sortable && onSort ? (
                  <button type="button" className="ui-table__sort" onClick={() => onSort(column.key)}>
                    {column.header}
                    {sortKey === column.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && emptyState ? <div className="ui-table__empty">{typeof emptyState === "string" ? <EmptyState title={emptyState} /> : emptyState}</div> : null}
      </div>
    </div>
  );
}

export const DataTable = Table;
