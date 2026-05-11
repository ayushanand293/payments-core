import type { AccountSummary, Capabilities, DemoStats, TransactionSummary } from "../api/client";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, StatCard } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

type Props = {
  accounts: AccountSummary[];
  transactions: TransactionSummary[];
  stats: DemoStats | null;
  capabilities: Capabilities | null;
  onResetDemo: () => Promise<void>;
  onRunReconciliation: () => Promise<void>;
};

const currencyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function OverviewPage({ accounts, transactions, stats, capabilities, onResetDemo, onRunReconciliation }: Props) {
  const recentTransactions = transactions.slice(0, 5);
  const sampleBalances = accounts.slice(0, 3);
  const processed = stats?.processed_webhooks ?? 0;
  const dlq = stats?.dlq_size ?? 0;
  const healthTotal = Math.max(processed + dlq, 1);
  const healthPercent = Math.round((processed / healthTotal) * 100);
  const totalPosted = accounts.reduce((sum, account) => sum + account.posted_balance_minor, 0);
  const totalHeld = accounts.reduce((sum, account) => sum + account.held_balance_minor, 0);
  const totalAvailable = accounts.reduce((sum, account) => sum + account.available_balance_minor, 0);
  const escrowAccounts = accounts.filter((account) => account.type === "ESCROW");
  const escrowBalance = escrowAccounts.reduce((sum, account) => sum + account.posted_balance_minor, 0);
  const balancedCount = transactions.filter((transaction) => transaction.balanced).length;
  const reconcileLabel = stats?.last_reconcile_at ? new Date(stats.last_reconcile_at).toLocaleString() : "Not run";

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="overview"
        title="Operational snapshot"
        description="A compact read on ledger volume, webhook health, holds, and reconciliation freshness."
      />

      <div className="overview-showcase">
        <Card className="overview-card" title="Ledger balances" subtitle={`${accounts.length} accounts across currencies`}>
          <strong className="overview-card-number">{currencyFormat.format(totalAvailable)}</strong>
          <div className="overview-metric-list">
            <div><span>Posted</span><strong>{currencyFormat.format(totalPosted)}</strong></div>
            <div><span>Held</span><strong>{currencyFormat.format(totalHeld)}</strong></div>
            <div><span>Available</span><strong>{currencyFormat.format(totalAvailable)}</strong></div>
          </div>
        </Card>

        <Card className="overview-card" title="Holds & escrow" subtitle="Funds reserved and captured by currency">
          <strong className="overview-card-number">{currencyFormat.format(escrowBalance)}</strong>
          <div className="overview-metric-list">
            <div><span>Active holds</span><strong>{stats?.active_holds ?? 0}</strong></div>
            <div><span>Escrow accounts</span><strong>{escrowAccounts.length}</strong></div>
            <div><span>Held funds</span><strong>{currencyFormat.format(totalHeld)}</strong></div>
          </div>
        </Card>

        <Card className="overview-card" title="Webhook pipeline" subtitle="Async ingest, retry, DLQ, replay">
          <div className="pipeline-meter">
            <div className="pipeline-meter__bar"><span style={{ width: `${healthPercent}%` }} /></div>
            <strong>{healthPercent}% processed</strong>
          </div>
          <div className="overview-metric-list">
            <div><span>Processed</span><strong>{processed}</strong></div>
            <div><span>Deduped</span><strong>{stats?.deduped_webhooks ?? 0}</strong></div>
            <div><span>DLQ</span><strong>{dlq}</strong></div>
          </div>
        </Card>

        <Card className="overview-card" title="Transaction flow" subtitle={`${transactions.length} immutable transactions`}>
          <div className="sparkline" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} style={{ height: `${24 + ((index * 17 + transactions.length * 5) % 52)}%` }} />
            ))}
          </div>
          <div className="chart-footer">
            <strong>{transactions.length}</strong>
            <Badge variant="info">{balancedCount} balanced</Badge>
          </div>
        </Card>

        <Card className="overview-card" title="Reconciliation" subtitle="Persisted consistency checks">
          <strong className="overview-card-number">{reconcileLabel}</strong>
          <div className="overview-metric-list">
            <div><span>Runs</span><strong>{stats?.reconcile_runs_total ?? 0}</strong></div>
            <div><span>Latest</span><strong>{stats?.last_reconcile_at ? "Stored" : "Pending"}</strong></div>
          </div>
          {!capabilities?.read_only ? <Button variant="primary" type="button" onClick={() => void onRunReconciliation()}>Run reconciliation</Button> : <Badge variant="info">Read-only public demo</Badge>}
        </Card>

        <Card className="overview-card" title="Idempotency safety" subtitle="Replay-safe writes and webhook dedupe">
          <strong className="overview-card-number">{stats?.idempotency_replays ?? 0}</strong>
          <div className="overview-metric-list">
            <div><span>API replays</span><strong>{stats?.idempotency_replays ?? 0}</strong></div>
            <div><span>Webhook dedupe</span><strong>{stats?.deduped_webhooks ?? 0}</strong></div>
          </div>
          <Badge variant="info">Duplicate-safe control plane</Badge>
        </Card>

        <Card className="overview-card overview-card--wide" title="Recent ledger events" subtitle="Latest posted activity">
          <div className="invoice-list">
            {recentTransactions.length > 0 ? recentTransactions.slice(0, 4).map((transaction) => (
              <div key={transaction.id} className="invoice-row">
                <span>{new Date(transaction.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <strong>{transaction.description ?? transaction.type}</strong>
                <Badge variant={transaction.balanced ? "success" : "warning"}>{transaction.balanced ? "Balanced" : "Check"}</Badge>
              </div>
            )) : <p className="ui-subtitle">No posted transactions yet.</p>}
          </div>
        </Card>

        <Card className="overview-card overview-card--wide" title="Currency accounts" subtitle="Sample balances by operational role">
          <div className="account-strip">
            {sampleBalances.map((account) => (
              <div key={account.id} className="compact-chip">
                <span>{account.name}</span>
                <strong>{currencyFormat.format(account.available_balance_minor)}</strong>
                <small>{account.currency_code} · {account.type}</small>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="ui-grid-6">
        {[{ label: "DLQ size", value: stats?.dlq_size ?? 0 }, { label: "Processed webhooks", value: stats?.processed_webhooks ?? 0 }, { label: "Deduped webhooks", value: stats?.deduped_webhooks ?? 0 }, { label: "Active holds", value: stats?.active_holds ?? 0 }, { label: "Idempotency replays", value: stats?.idempotency_replays ?? 0 }, { label: "Last reconcile", value: stats?.last_reconcile_at ? new Date(stats.last_reconcile_at).toLocaleString() : "Not run" }].map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {!capabilities?.read_only ? (
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
      ) : (
        <Card title="Public demo mode" subtitle="This deployment is read-only. Browse live seeded data without mutating the ledger or worker pipeline.">
          <Badge variant="info">Writes, replay, reset, funding, and reconcile-run controls are hidden.</Badge>
        </Card>
      )}

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
