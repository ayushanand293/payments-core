import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  postHoldAuthorize,
  postHoldCapture,
  postHoldRelease,
  type AccountSummary,
  type HoldSummary,
} from "../api/client";

type Props = {
  accounts: AccountSummary[];
  holds: HoldSummary[];
  refresh: () => Promise<void>;
};

const formatMinor = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function randomKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function HoldsPage({ accounts, holds, refresh }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amountMinor, setAmountMinor] = useState("1000");
  const [ttlSeconds, setTtlSeconds] = useState("900");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const sortedHolds = useMemo(() => [...holds].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [holds]);

  useEffect(() => {
    if (accounts.length > 0 && !accountMap.has(accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId, accountMap]);

  async function submitAuthorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const selected = accountMap.get(accountId);
    if (!selected) {
      setError("Choose an account first.");
      return;
    }

    const parsedAmount = Number(amountMinor);
    const parsedTtl = Number(ttlSeconds);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (!Number.isFinite(parsedTtl) || parsedTtl <= 0) {
      setError("TTL must be a positive number of seconds.");
      return;
    }

    try {
      await postHoldAuthorize(
        {
          account_id: selected.id,
          currency_code: selected.currency_code,
          amount_minor: Math.floor(parsedAmount),
          ttl_seconds: Math.floor(parsedTtl),
        },
        randomKey("hold-authorize"),
      );
      setMessage("Hold authorized.");
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Authorize failed");
    }
  }

  async function runCapture(hold: HoldSummary) {
    setLoadingId(hold.id);
    setError(null);
    setMessage(null);
    try {
      const response = await postHoldCapture(hold.id, hold.currency_code, randomKey(`hold-capture-${hold.id}`));
      setMessage(`Hold captured in tx ${response.transaction_id}`);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Capture failed");
    } finally {
      setLoadingId(null);
    }
  }

  async function runRelease(hold: HoldSummary) {
    setLoadingId(hold.id);
    setError(null);
    setMessage(null);
    try {
      await postHoldRelease(hold.id, hold.currency_code, randomKey(`hold-release-${hold.id}`));
      setMessage("Hold released.");
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Release failed");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <h3>Authorize hold</h3>
          <span>Default TTL is 900 seconds</span>
        </div>
        <form className="hold-form" onSubmit={(event) => void submitAuthorize(event)}>
          <label>
            <span>Account</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency_code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount (minor)</span>
            <input value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} />
          </label>
          <label>
            <span>TTL seconds</span>
            <input value={ttlSeconds} onChange={(event) => setTtlSeconds(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            Authorize hold
          </button>
        </form>
      </div>

      {error ? <div className="alert-card">{error}</div> : null}
      {message ? <div className="alert-card soft">{message}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h3>Holds</h3>
          <span>Capture moves funds to escrow. Release frees availability.</span>
        </div>
        <div className="table-card">
          {sortedHolds.map((hold) => {
            const account = accountMap.get(hold.account_id);
            const isActive = hold.status === "AUTHORIZED";
            return (
              <div key={hold.id} className="table-row static-row">
                <div>
                  <strong>{account?.name ?? hold.account_id}</strong>
                  <span>
                    {hold.currency_code} · {hold.status} · Expires {new Date(hold.expires_at).toLocaleString()}
                  </span>
                </div>
                <div className="row-actions">
                  <span className="mono-number">{formatMinor.format(hold.amount_minor)}</span>
                  <button className="inline-action-button" type="button" disabled={!isActive || loadingId === hold.id} onClick={() => void runCapture(hold)}>
                    Capture
                  </button>
                  <button className="inline-action-button" type="button" disabled={!isActive || loadingId === hold.id} onClick={() => void runRelease(hold)}>
                    Release
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
