import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCurrencies, postAccount, type AccountSummary, type CurrencySummary } from "../api/client";
import { toUserMessage } from "../api/errors";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Notice } from "../components/ui/Notice";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";

type Props = {
  accounts: AccountSummary[];
  refresh: () => Promise<void>;
  onOpenAccount: (accountId: string) => void;
};

export function AccountsPage({ accounts, refresh, onOpenAccount }: Props) {
  const [currencies, setCurrencies] = useState<CurrencySummary[]>([]);
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [type, setType] = useState<"USER" | "MERCHANT">("USER");
  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [sortKey, setSortKey] = useState<"name" | "available">("name");
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrencies() {
      try {
        const nextCurrencies = await getCurrencies();
        if (!cancelled) {
          setCurrencies(nextCurrencies);
          if (nextCurrencies.length > 0 && !nextCurrencies.some((entry) => entry.code === currencyCode)) {
            setCurrencyCode(nextCurrencies[0].code);
          }
        }
      } catch (exception) {
        if (!cancelled) {
          setError(toUserMessage(exception, "Unable to load currencies"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCurrencies();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!name.trim()) {
      setError("Account name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await postAccount({ name: name.trim(), currency_code: currencyCode, type });
      setName("");
      setCreateOpen(false);
      setMessage("Account created successfully.");
      await refresh();
    } catch (exception) {
      setError(toUserMessage(exception, "Unable to create account"));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredAccounts = useMemo(() => {
    const next = accounts.filter((account) => {
      const bySearch = !search.trim() || account.name.toLowerCase().includes(search.toLowerCase());
      const byCurrency = currencyFilter === "ALL" || account.currency_code === currencyFilter;
      return bySearch && byCurrency;
    });

    return next.sort((a, b) => {
      if (sortKey === "available") {
        const delta = a.available_balance_minor - b.available_balance_minor;
        return sortDirection === "asc" ? delta : -delta;
      }
      const delta = a.name.localeCompare(b.name);
      return sortDirection === "asc" ? delta : -delta;
    });
  }, [accounts, currencyFilter, search, sortDirection, sortKey]);

  const columns: TableColumn<AccountSummary>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <button type="button" className="ui-button ui-button--ghost" onClick={() => onOpenAccount(row.id)}>
          {row.name}
        </button>
      ),
    },
    { key: "type", header: "Type", render: (row) => row.type },
    { key: "currency", header: "Currency", render: (row) => row.currency_code },
    { key: "posted", header: "Posted", render: (row) => row.posted_balance_minor.toLocaleString() },
    { key: "held", header: "Held", render: (row) => row.held_balance_minor.toLocaleString() },
    {
      key: "available",
      header: "Available",
      sortable: true,
      render: (row) => row.available_balance_minor.toLocaleString(),
    },
  ];

  function onSort(column: string) {
    if (column !== "name" && column !== "available") {
      return;
    }
    if (sortKey === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection("asc");
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      {error ? <Notice variant="error">{error}</Notice> : null}
      {message ? <Notice variant="success">{message}</Notice> : null}

      <Card title="Accounts" subtitle="Browse, filter, and open account detail routes" actions={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create account</Button>}>
        <div className="ui-toolbar" style={{ marginBottom: "var(--space-3)" }}>
          <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by account name" />
          <Select label="Currency" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
            <option value="ALL">All</option>
            {currencies.map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.code}</option>
            ))}
          </Select>
        </div>

        <Table
          columns={columns}
          rows={filteredAccounts}
          rowKey={(row) => row.id}
          emptyState="No accounts match the current filters."
          onSort={onSort}
          sortKey={sortKey}
          sortDirection={sortDirection}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Create account"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={submitting} onClick={() => {
              const form = document.getElementById("create-account-form") as HTMLFormElement | null;
              form?.requestSubmit();
            }}>Create account</Button>
          </>
        }
      >
        <form id="create-account-form" className="ui-form-grid" onSubmit={(event) => void submitAccount(event)}>
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="INR User A" />
          <Select label="Currency" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
            {currencies.map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.code}</option>
            ))}
          </Select>
          <Select label="Type" value={type} onChange={(event) => setType(event.target.value as "USER" | "MERCHANT") }>
            <option value="USER">USER</option>
            <option value="MERCHANT">MERCHANT</option>
          </Select>
          <div />
        </form>
      </Modal>
    </section>
  );
}
