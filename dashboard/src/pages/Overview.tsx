import type { CSSProperties } from "react";
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
  const primaryAccount = sampleBalances[0];
  const secondaryAccount = sampleBalances[1];
  const processed = stats?.processed_webhooks ?? 0;
  const dlq = stats?.dlq_size ?? 0;
  const healthTotal = Math.max(processed + dlq, 1);
  const healthPercent = Math.round((processed / healthTotal) * 100);

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="overview"
        title="Operational snapshot"
        description="A compact read on ledger volume, webhook health, holds, and reconciliation freshness."
      />

      <div className="overview-showcase">
        <Card className="overview-card overview-card--wallet" title="Accounts" subtitle={`${accounts.length} active ledgers`}>
          <div className="mini-card-stack">
            <div className="mini-credit-card mini-credit-card--light">
              <span>Available</span>
              <strong>{primaryAccount ? currencyFormat.format(primaryAccount.available_balance_minor) : "0"}</strong>
              <small>{primaryAccount?.currency_code ?? "INR"} · {primaryAccount?.type ?? "USER"}</small>
            </div>
            <div className="mini-credit-card">
              <span>Escrow-safe</span>
              <strong>{secondaryAccount ? currencyFormat.format(secondaryAccount.available_balance_minor) : "0"}</strong>
              <small>{secondaryAccount?.currency_code ?? "INR"} · {secondaryAccount?.type ?? "MERCHANT"}</small>
            </div>
          </div>
        </Card>

        <Card className="overview-card overview-card--ring">
          <div className="ring-meter" style={{ "--ring-value": `${healthPercent}%` } as CSSProperties}>
            <div>
              <span>Webhook health</span>
              <strong>{healthPercent}%</strong>
            </div>
          </div>
          <div className="ring-caption">
            <span>Processed {processed}</span>
            <span>DLQ {dlq}</span>
          </div>
        </Card>

        <Card className="overview-card overview-card--home" title="Ledger home" subtitle="Main control state">
          <strong className="oversized-number">{currencyFormat.format(accounts.reduce((sum, account) => sum + account.available_balance_minor, 0))}</strong>
          <div className="compact-chip-grid">
            {sampleBalances.map((account) => (
              <div key={account.id} className="compact-chip">
                <span>{account.name.split(" ").slice(0, 2).join(" ")}</span>
                <strong>{currencyFormat.format(account.available_balance_minor)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overview-card overview-card--chart" title="Transaction flow" subtitle={`${transactions.length} total`}>
          <div className="sparkline" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} style={{ height: `${24 + ((index * 17 + transactions.length * 5) % 52)}%` }} />
            ))}
          </div>
          <div className="chart-footer">
            <strong>{transactions.length}</strong>
            <Badge variant="info">{transactions.filter((transaction) => transaction.balanced).length} balanced</Badge>
          </div>
        </Card>

        <Card className="overview-card overview-card--activity" title="Activity">
          <div className="activity-dot-grid" aria-hidden="true">
            {Array.from({ length: 42 }).map((_, index) => (
              <span key={index} className={(index + transactions.length) % 7 === 0 ? "is-hot" : ""} />
            ))}
          </div>
          <div className="activity-weekdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        </Card>

        <Card className="overview-card overview-card--billing" title="Billing & invoice">
          <div className="invoice-list">
            {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
              <div key={transaction.id} className="invoice-row">
                <span>{new Date(transaction.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <strong>{transaction.description ?? transaction.type}</strong>
                <Badge variant={transaction.balanced ? "info" : "warning"}>{transaction.balanced ? "Paid" : "Check"}</Badge>
              </div>
            )) : <p className="ui-subtitle">No posted transactions yet.</p>}
          </div>
        </Card>

        <Card className="overview-card overview-card--exchange" title="Exchange">
          <div className="exchange-box">
            <span>Your send</span>
            <strong>{currencyFormat.format(stats?.idempotency_replays ?? 0)}</strong>
            <small>replays</small>
          </div>
          <div className="exchange-box">
            <span>You received</span>
            <strong>{currencyFormat.format(stats?.deduped_webhooks ?? 0)}</strong>
            <small>dedupes</small>
          </div>
          <Button variant="primary" type="button" onClick={() => void onRunReconciliation()}>Reconcile</Button>
        </Card>
      </div>

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
