import { useEffect, useState } from "react";
import { getAccount, getAccountStatement, postDemoFund, type AccountDetail, type AccountStatement } from "../api/client";

type Props = {
  accountId: string;
  onBack: () => void;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function AccountDetailPage({ accountId, onBack }: Props) {
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("1000");
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextAccount, nextStatement] = await Promise.all([getAccount(accountId), getAccountStatement(accountId)]);
        if (!cancelled) {
          setAccount(nextAccount);
          setStatement(nextStatement);
        }
      } catch (exception) {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : "Unable to load account detail");
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
  }, [accountId]);

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
      const [nextAccount, nextStatement] = await Promise.all([getAccount(account.id), getAccountStatement(account.id)]);
      setAccount(nextAccount);
      setStatement(nextStatement);
      setFundMessage("Account funded successfully.");
    } catch (exception) {
      setFundMessage(exception instanceof Error ? exception.message : "Funding failed");
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Account detail</h3>
            <span>Dedicated route view with statement history</span>
          </div>
          <button type="button" className="ghost-button" onClick={onBack}>
            Back to accounts
          </button>
        </div>

        {account ? (
          <div className="fund-row">
            <input value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} placeholder="Amount in minor units" />
            <button type="button" className="primary-button" onClick={() => void runFund()}>
              Fund account
            </button>
          </div>
        ) : null}
        {fundMessage ? <div className="alert-card soft">{fundMessage}</div> : null}

        {loading ? <div className="alert-card soft">Loading account...</div> : null}
        {error ? <div className="alert-card">{error}</div> : null}

        {account && statement ? (
          <div className="statement-card">
            <div className="statement-summary">
              <strong>{account.name}</strong>
              <span>{account.currency_code} · {account.type}</span>
              <span>Posted: {formatMinor.format(account.posted_balance_minor)}</span>
              <span>Available: {formatMinor.format(account.available_balance_minor)}</span>
            </div>
            <div className="mini-table">
              {statement.ledger_entries.map((entry) => (
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
        ) : null}
      </div>
    </section>
  );
}
