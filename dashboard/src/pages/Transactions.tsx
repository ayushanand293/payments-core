import { useEffect, useMemo, useState } from "react";
import { getTransaction, postTransfer, type AccountSummary, type TransactionDetail, type TransactionSummary } from "../api/client";
import { toUserMessage } from "../api/errors";
import { Badge, statusVariant } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";

type Props = {
  transactions: TransactionSummary[];
  accounts: AccountSummary[];
  refresh: () => Promise<void>;
  readOnly?: boolean;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function TransactionsPage({ transactions, accounts, refresh, readOnly = false }: Props) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(transactions[0]?.id ?? null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amountMinor, setAmountMinor] = useState<string>("1000");
  const [description, setDescription] = useState<string>("Dashboard transfer");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"created_at" | "type" | "status">("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (accounts.length < 2) {
      return;
    }
    if (!fromAccountId || !accounts.some((account) => account.id === fromAccountId)) {
      setFromAccountId(accounts[0].id);
    }
    if (!toAccountId || !accounts.some((account) => account.id === toAccountId) || toAccountId === accounts[0].id) {
      const fallbackDestination = accounts.find((account) => account.id !== accounts[0].id);
      if (fallbackDestination) {
        setToAccountId(fallbackDestination.id);
      }
    }
  }, [accounts, fromAccountId, toAccountId]);

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions],
  );

  const detailBalanced = useMemo(() => {
    if (!detail) {
      return null;
    }
    const credits = detail.ledger_entries
      .filter((entry) => entry.direction === "CREDIT")
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    const debits = detail.ledger_entries
      .filter((entry) => entry.direction === "DEBIT")
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    return credits === debits;
  }, [detail]);

  async function loadDetail(transactionId: string) {
    setLoading(true);
    setError(null);
    try {
      setSelectedTransactionId(transactionId);
      setDetail(await getTransaction(transactionId));
    } catch (exception) {
      setError(toUserMessage(exception, "Unable to load transaction detail"));
    } finally {
      setLoading(false);
    }
  }

  async function submitTransfer() {
    setSubmitMessage(null);
    if (!fromAccountId || !toAccountId) {
      setSubmitMessage("Choose both source and destination accounts.");
      return;
    }
    if (fromAccountId === toAccountId) {
      setSubmitMessage("Source and destination must be different accounts.");
      return;
    }

    const fromAccount = accounts.find((account) => account.id === fromAccountId);
    const toAccount = accounts.find((account) => account.id === toAccountId);
    if (!fromAccount || !toAccount) {
      setSubmitMessage("Selected accounts are no longer available. Refresh and try again.");
      return;
    }
    if (fromAccount.currency_code !== toAccount.currency_code) {
      setSubmitMessage("Source and destination currencies must match.");
      return;
    }

    const parsedAmount = Number(amountMinor);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitMessage("Amount must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      const tx = await postTransfer(
        {
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
          currency_code: fromAccount.currency_code,
          amount_minor: Math.floor(parsedAmount),
          description: description.trim() ? description.trim() : undefined,
        },
        `dashboard-transfer-${Date.now()}`,
      );
      setSubmitMessage(`Transfer posted: ${tx.id}`);
      await refresh();
      setSelectedTransactionId(tx.id);
      setDetail(tx);
    } catch (exception) {
      setSubmitMessage(toUserMessage(exception, "Transfer failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const sortedTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const next = transactions.filter((transaction) => {
      return !query || transaction.id.toLowerCase().includes(query) || transaction.type.toLowerCase().includes(query) || transaction.status.toLowerCase().includes(query) || (transaction.description ?? "").toLowerCase().includes(query);
    });
    next.sort((a, b) => {
      let delta = 0;
      if (sortKey === "type") delta = a.type.localeCompare(b.type);
      if (sortKey === "status") delta = a.status.localeCompare(b.status);
      if (sortKey === "created_at") delta = String(a.created_at).localeCompare(String(b.created_at));
      return sortDirection === "asc" ? delta : -delta;
    });
    return next;
  }, [search, sortDirection, sortKey, transactions]);

  const columns: TableColumn<TransactionSummary>[] = [
    {
      key: "id",
      header: "Tx",
      render: (row) => (
        <button type="button" className="ui-button ui-button--ghost" onClick={() => void loadDetail(row.id)}>
          {row.id.slice(0, 8)}
        </button>
      ),
    },
    { key: "type", header: "Type", sortable: true, render: (row) => row.type },
    { key: "status", header: "Status", sortable: true, render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
    { key: "currency", header: "Currency", render: (row) => row.currency_code },
    { key: "balanced", header: "Balanced", render: (row) => <Badge variant={row.balanced ? "success" : "warning"}>{row.balanced ? "Yes" : "No"}</Badge> },
    { key: "created_at", header: "Created", sortable: true, render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  function onSort(key: string) {
    if (key !== "created_at" && key !== "type" && key !== "status") {
      return;
    }
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="ledger"
        title="Transactions"
        description="Create transfers and inspect the ledger entries that keep every transaction balanced."
      />

      {submitMessage ? <Notice variant="success">{submitMessage}</Notice> : null}

      {!readOnly ? (
        <Card title="Create transfer" subtitle="Post a transaction between any two accounts">
          <div className="ui-form-grid">
            <Select label="Source account" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
              <option value="">Select source</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>
              ))}
            </Select>
            <Select label="Destination account" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
              <option value="">Select destination</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>
              ))}
            </Select>
            <Input label="Amount (minor units)" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} placeholder="1000" />
            <Input label="Description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Dashboard transfer" />
            <Button variant="primary" type="button" onClick={() => void submitTransfer()} disabled={accounts.length < 2} loading={submitting}>
              Post transfer
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="ui-grid-2">
        <section>
          <Card title="Transactions" subtitle="Sortable table; click Tx id for detail">
            <Table
              columns={columns}
              rows={sortedTransactions}
              rowKey={(row) => row.id}
              emptyState="No transactions yet."
              onSort={onSort}
              sortKey={sortKey}
              sortDirection={sortDirection}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search transactions"
            />
          </Card>
        </section>

        <section>
          <Card title="Transaction detail" subtitle={loading ? "Loading..." : selectedTransaction?.id ?? "Select a transaction"}>
          {error ? <Notice variant="error">{error}</Notice> : null}
          {detail ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              <div style={{ display: "grid", gap: "var(--space-2)" }}>
                <strong>{detail.description ?? detail.type}</strong>
                <div className="ui-subtitle">{detail.currency_code} · {detail.status}</div>
                <Badge variant={detailBalanced ? "success" : "warning"}>{detailBalanced ? "Balanced" : "Unbalanced"}</Badge>
                <div className="ui-subtitle">
                  Debit: {formatMinor.format(detail.total_debit_minor ?? 0)} · Credit: {formatMinor.format(detail.total_credit_minor ?? 0)}
                </div>
              </div>
              <div style={{ display: "grid", gap: "var(--space-2)" }}>
                {detail.ledger_entries.map((entry) => (
                  <div key={entry.id} className="ui-row-card">
                    <div>
                      <strong>{entry.direction}</strong>
                      <div className="ui-subtitle">{new Date(entry.created_at).toLocaleString()}</div>
                    </div>
                    <div>{formatMinor.format(entry.amount_minor)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p>Select a transaction to inspect the ledger entries.</p>
              <Button variant="ghost" type="button" onClick={() => void refresh()}>
                Reload transactions
              </Button>
            </div>
          )}
          </Card>
        </section>
      </div>
    </section>
  );
}
