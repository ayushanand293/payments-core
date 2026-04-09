import { useMemo, useState } from "react";
import { getTransaction, type TransactionDetail, type TransactionSummary } from "../api/client";

type Props = {
  transactions: TransactionSummary[];
  refresh: () => Promise<void>;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function TransactionsPage({ transactions, refresh }: Props) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(transactions[0]?.id ?? null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(exception instanceof Error ? exception.message : "Unable to load transaction detail");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel split-layout">
        <section>
          <div className="panel-header">
            <h3>Transactions</h3>
            <span>Click a row for the ledger view</span>
          </div>
          <div className="table-card">
            {transactions.map((transaction) => (
              <button key={transaction.id} type="button" className={transaction.id === selectedTransactionId ? "table-row active" : "table-row"} onClick={() => void loadDetail(transaction.id)}>
                <div>
                  <strong>{transaction.description ?? transaction.type}</strong>
                  <span>{transaction.currency_code} · {transaction.status}</span>
                </div>
                <div className={transaction.balanced ? "badge success" : "badge warning"}>{transaction.balanced ? "Balanced ✓" : "Check"}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="panel-header">
            <h3>Transaction detail</h3>
            <span>{loading ? "Loading..." : selectedTransaction?.id ?? "Select a transaction"}</span>
          </div>
          {error ? <div className="alert-card">{error}</div> : null}
          {detail ? (
            <div className="statement-card">
              <div className="statement-summary">
                <strong>{detail.description ?? detail.type}</strong>
                <span>{detail.currency_code} · {detail.status}</span>
                <span className={detailBalanced ? "badge success" : "badge warning"}>{detailBalanced ? "Balanced" : "Unbalanced"}</span>
              </div>
              <div className="mini-table">
                {detail.ledger_entries.map((entry) => (
                  <div key={entry.id} className="mini-row">
                    <div>
                      <strong>{entry.direction}</strong>
                      <span>{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mono-number">{formatMinor.format(entry.amount_minor)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Select a transaction to inspect the ledger entries.</p>
              <button className="ghost-button" type="button" onClick={() => void refresh()}>
                Reload transactions
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
