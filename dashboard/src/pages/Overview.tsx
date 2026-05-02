import type { AccountSummary, DemoStats, TransactionSummary } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, StatCard } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

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
      <PageHeader
        eyebrow="overview"
        title="Operational snapshot"
        description="A compact read on ledger volume, webhook health, holds, and reconciliation freshness."
      />

      <div className="ui-grid-6">
        {[{ label: "DLQ size", value: stats?.dlq_size ?? 0 }, { label: "Processed webhooks", value: stats?.processed_webhooks ?? 0 }, { label: "Deduped webhooks", value: stats?.deduped_webhooks ?? 0 }, { label: "Active holds", value: stats?.active_holds ?? 0 }, { label: "Idempotency replays", value: stats?.idempotency_replays ?? 0 }, { label: "Last reconcile", value: stats?.last_reconcile_at ? new Date(stats.last_reconcile_at).toLocaleString() : "Not run" }].map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <Card className="ui-warning-panel" title="Privileged demo controls" subtitle="Local-only operator shortcuts. Production mode disables /demo/* unless explicitly enabled.">
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
                <div key={account.id} className="ui-row-card">
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
                <div key={transaction.id} className="ui-row-card">
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
