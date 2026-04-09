import { useEffect, useMemo, useState } from "react";
import { getTransaction, postTransfer, type AccountSummary, type TransactionDetail, type TransactionSummary } from "../api/client";

type Props = {
  transactions: TransactionSummary[];
  accounts: AccountSummary[];
  refresh: () => Promise<void>;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function TransactionsPage({ transactions, accounts, refresh }: Props) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(transactions[0]?.id ?? null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amountMinor, setAmountMinor] = useState<string>("1000");
  const [description, setDescription] = useState<string>("Dashboard transfer");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError(exception instanceof Error ? exception.message : "Unable to load transaction detail");
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
      setSubmitMessage(exception instanceof Error ? exception.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <h3>Create transfer</h3>
          <span>Post a transaction between any two accounts</span>
        </div>
        <div className="account-form">
          <label>
            <span>Source account</span>
            <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
              <option value="">Select source</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency_code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Destination account</span>
            <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
              <option value="">Select destination</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency_code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount (minor units)</span>
            <input value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} placeholder="1000" />
          </label>
          <label>
            <span>Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Dashboard transfer" />
          </label>
          <button className="primary-button" type="button" onClick={() => void submitTransfer()} disabled={submitting || accounts.length < 2}>
            {submitting ? "Posting..." : "Post transfer"}
          </button>
        </div>
        {submitMessage ? <div className="alert-card soft">{submitMessage}</div> : null}
      </div>

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
                <span>
                  Debit: {formatMinor.format(detail.total_debit_minor ?? 0)} · Credit: {formatMinor.format(detail.total_credit_minor ?? 0)}
                </span>
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
