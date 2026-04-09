import type { AccountSummary, DemoStats, TransactionSummary } from "../api/client";

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
    <section className="page-stack">
      <div className="panel card-grid">
        <article className="info-card highlight">
          <span>DLQ size</span>
          <strong>{stats?.dlq_size ?? 0}</strong>
          <p>Tracks unresolved webhook failures.</p>
        </article>
        <article className="info-card">
          <span>Processed webhooks</span>
          <strong>{stats?.processed_webhooks ?? 0}</strong>
          <p>Successful asynchronous processing count.</p>
        </article>
        <article className="info-card">
          <span>Deduped webhooks</span>
          <strong>{stats?.deduped_webhooks ?? 0}</strong>
          <p>Duplicate event submissions safely ignored.</p>
        </article>
        <article className="info-card">
          <span>Active holds</span>
          <strong>{stats?.active_holds ?? 0}</strong>
          <p>Currently authorized and unexpired holds.</p>
        </article>
        <article className="info-card">
          <span>Idempotency replays</span>
          <strong>{stats?.idempotency_replays ?? 0}</strong>
          <p>Replay responses served from stored records.</p>
        </article>
        <article className="info-card">
          <span>Last reconcile</span>
          <strong>{stats?.last_reconcile_at ? new Date(stats.last_reconcile_at).toLocaleString() : "Not run"}</strong>
          <p>Persisted run timestamp from reconcile_runs.</p>
        </article>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Demo control center</h3>
          <span>Fast reset and consistency checks</span>
        </div>
        <div className="row-actions">
          <button className="primary-button" type="button" onClick={() => void onResetDemo()}>
            Reset demo
          </button>
          <button className="ghost-button" type="button" onClick={() => void onRunReconciliation()}>
            Run reconciliation
          </button>
          <span className="helper-text">Accounts: {accounts.length} · Transactions: {transactions.length}</span>
        </div>
      </div>

      <div className="panel split-layout">
        <section>
          <div className="panel-header">
            <h3>Account snapshot</h3>
            <span>Posted, held, available</span>
          </div>
          <div className="mini-table">
            {sampleBalances.map((account) => (
              <div key={account.id} className="mini-row">
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.currency_code} · {account.type}</span>
                </div>
                <div className="mono-number">{currencyFormat.format(account.available_balance_minor)}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="panel-header">
            <h3>Recent transactions</h3>
            <span>Balanced status visible per tx</span>
          </div>
          <div className="mini-table">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="mini-row">
                <div>
                  <strong>{transaction.description ?? transaction.type}</strong>
                  <span>{transaction.currency_code} · {transaction.status}</span>
                </div>
                <div className={transaction.balanced ? "badge success" : "badge warning"}>{transaction.balanced ? "Balanced ✓" : "Check"}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
