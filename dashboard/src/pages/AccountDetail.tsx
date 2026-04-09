import { useEffect, useState } from "react";
import { getAccount, getAccountStatement, getHolds, postDemoFund, type AccountSummary, type AccountStatement, type HoldSummary } from "../api/client";
import { toUserMessage } from "../api/errors";
import { Badge, statusVariant } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Notice } from "../components/ui/Notice";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";

type Props = {
  accountId: string;
  onBack: () => void;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function AccountDetailPage({ accountId, onBack }: Props) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [holds, setHolds] = useState<HoldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"statement" | "holds">("statement");
  const [limit, setLimit] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("1000");
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const parsedLimit = Number(limit);
        const statementLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;
        const [nextAccount, nextStatement, nextHolds] = await Promise.all([getAccount(accountId), getAccountStatement(accountId, statementLimit), getHolds()]);
        if (!cancelled) {
          setAccount(nextAccount);
          setStatement(nextStatement);
          setHolds(nextHolds.filter((hold) => hold.account_id === accountId));
        }
      } catch (exception) {
        if (!cancelled) {
          setError(toUserMessage(exception, "Unable to load account detail"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, limit]);

  async function runFund() {
    if (!account) {
      return;
    }

    setFundMessage(null);
    try {
      const amount = Number(fundAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFundMessage("Funding amount must be a positive number.");
        return;
      }

      await postDemoFund(account.id, Math.floor(amount), account.currency_code);
      const parsedLimit = Number(limit);
      const statementLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;
      const [nextAccount, nextStatement, nextHolds] = await Promise.all([getAccount(account.id), getAccountStatement(account.id, statementLimit), getHolds()]);
      setAccount(nextAccount);
      setStatement(nextStatement);
      setHolds(nextHolds.filter((hold) => hold.account_id === account.id));
      setFundMessage("Account funded successfully.");
    } catch (exception) {
      setFundMessage(toUserMessage(exception, "Funding failed"));
    }
  }

  const statementColumns: TableColumn<AccountStatement["ledger_entries"][number]>[] = [
    { key: "direction", header: "Direction", render: (entry) => entry.direction },
    { key: "amount", header: "Amount", render: (entry) => formatMinor.format(entry.amount_minor) },
    { key: "currency", header: "Currency", render: (entry) => entry.currency_code },
    { key: "created", header: "Created", render: (entry) => new Date(entry.created_at).toLocaleString() },
  ];

  const holdColumns: TableColumn<HoldSummary>[] = [
    { key: "id", header: "Hold id", render: (hold) => hold.id.slice(0, 8) },
    { key: "status", header: "Status", render: (hold) => <Badge variant={statusVariant(hold.status)}>{hold.status}</Badge> },
    { key: "amount", header: "Amount", render: (hold) => formatMinor.format(hold.amount_minor) },
    { key: "expiry", header: "Expires", render: (hold) => new Date(hold.expires_at).toLocaleString() },
  ];

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <Card
        title={account ? `${account.name} (${account.currency_code})` : "Account detail"}
        subtitle={account ? `Type: ${account.type}` : "Dedicated route view with statement history"}
        actions={
          <Button type="button" variant="ghost" onClick={onBack}>
            Back to accounts
          </Button>
        }
      >
        <div className="ui-grid-3" style={{ marginBottom: "var(--space-4)" }}>
          <Card><div className="ui-stat"><span className="ui-stat__label">Posted</span><strong className="ui-stat__value">{account ? formatMinor.format(account.posted_balance_minor) : "-"}</strong></div></Card>
          <Card><div className="ui-stat"><span className="ui-stat__label">Held</span><strong className="ui-stat__value">{account ? formatMinor.format(account.held_balance_minor) : "-"}</strong></div></Card>
          <Card><div className="ui-stat"><span className="ui-stat__label">Available</span><strong className="ui-stat__value">{account ? formatMinor.format(account.available_balance_minor) : "-"}</strong></div></Card>
        </div>

        {account ? (
          <div className="ui-form-grid" style={{ marginBottom: "var(--space-3)" }}>
            <Input label="Fund amount (minor)" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} placeholder="1000" />
            <Button type="button" variant="primary" onClick={() => void runFund()}>
              Fund account
            </Button>
            <Select label="Statement limit" value={limit} onChange={(event) => setLimit(event.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end" }}>
              <Button variant={tab === "statement" ? "primary" : "secondary"} onClick={() => setTab("statement")}>Statement</Button>
              <Button variant={tab === "holds" ? "primary" : "secondary"} onClick={() => setTab("holds")}>Holds</Button>
            </div>
          </div>
        ) : null}
        {fundMessage ? <Notice variant="success">{fundMessage}</Notice> : null}
        {loading ? <Notice variant="info">Loading account...</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}

        {tab === "statement" && statement ? (
          <Table
            columns={statementColumns}
            rows={statement.ledger_entries}
            rowKey={(entry) => entry.id}
            emptyState="No statement rows for this account yet."
          />
        ) : null}

        {tab === "holds" ? (
          <Table columns={holdColumns} rows={holds} rowKey={(hold) => hold.id} emptyState="No holds for this account." />
        ) : null}
      </Card>
    </section>
  );
}
