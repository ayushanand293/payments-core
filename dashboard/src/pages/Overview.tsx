import type { AccountSummary, DemoStats, TransactionSummary } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type Props = {
  accounts: AccountSummary[];
  transactions: TransactionSummary[];
  stats: DemoStats | null;
  onResetDemo: () => Promise<void>;
  onRunReconciliation: () => Promise<void>;
};

const currencyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function OverviewPage({ accounts, transactions, stats, onResetDemo, onRunReconciliation }: Props) {
  const recentTransactions = transactions.slice(0, 5);
  const sampleBalances = accounts.slice(0, 3);

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <div className="ui-grid-6">
        {[{ label: "DLQ size", value: stats?.dlq_size ?? 0 }, { label: "Processed webhooks", value: stats?.processed_webhooks ?? 0 }, { label: "Deduped webhooks", value: stats?.deduped_webhooks ?? 0 }, { label: "Active holds", value: stats?.active_holds ?? 0 }, { label: "Idempotency replays", value: stats?.idempotency_replays ?? 0 }, { label: "Last reconcile", value: stats?.last_reconcile_at ? new Date(stats.last_reconcile_at).toLocaleString() : "Not run" }].map((item) => (
          <Card key={item.label}>
            <div className="ui-stat">
              <span className="ui-stat__label">{item.label}</span>
              <strong className="ui-stat__value">{item.value}</strong>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Demo control center" subtitle="Fast reset and consistency checks">
        <div className="ui-toolbar">
          <Button variant="danger" type="button" onClick={() => void onResetDemo()}>
            Reset demo
          </Button>
          <Button variant="primary" type="button" onClick={() => void onRunReconciliation()}>
            Run reconciliation
          </Button>
          <Badge variant="info">Accounts: {accounts.length} · Transactions: {transactions.length}</Badge>
          <Badge variant="neutral">Smoke: make smoke</Badge>
        </div>
      </Card>

      <div className="ui-grid-2">
        <section>
          <Card title="Account snapshot" subtitle="Posted, held, available">
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {sampleBalances.map((account) => (
                <div key={account.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                  <div>
                    <strong>{account.name}</strong>
                    <div className="ui-subtitle">{account.currency_code} · {account.type}</div>
                  </div>
                  <div>{currencyFormat.format(account.available_balance_minor)}</div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card title="Recent transactions" subtitle="Balanced status visible per tx">
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                  <div>
                    <strong>{transaction.description ?? transaction.type}</strong>
                    <div className="ui-subtitle">{transaction.currency_code} · {transaction.status}</div>
                  </div>
                  <Badge variant={transaction.balanced ? "success" : "warning"}>{transaction.balanced ? "Balanced" : "Check"}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </section>
  );
}
