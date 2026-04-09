import { useEffect, useState, type FormEvent } from "react";
import { getCurrencies, postAccount, type AccountSummary, type CurrencySummary } from "../api/client";

type Props = {
  accounts: AccountSummary[];
  refresh: () => Promise<void>;
  onOpenAccount: (accountId: string) => void;
};

export function AccountsPage({ accounts, refresh, onOpenAccount }: Props) {
  const [currencies, setCurrencies] = useState<CurrencySummary[]>([]);
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [type, setType] = useState<"USER" | "MERCHANT">("USER");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrencies() {
      try {
        const nextCurrencies = await getCurrencies();
        if (!cancelled) {
          setCurrencies(nextCurrencies);
          if (nextCurrencies.length > 0 && !nextCurrencies.some((entry) => entry.code === currencyCode)) {
            setCurrencyCode(nextCurrencies[0].code);
          }
        }
      } catch (exception) {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : "Unable to load currencies");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCurrencies();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await postAccount({ name, currency_code: currencyCode, type });
      setName("");
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Unable to create account");
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <h3>Create account</h3>
          <span>USER and MERCHANT only</span>
        </div>
        <form className="account-form" onSubmit={(event) => void submitAccount(event)}>
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="INR User A" />
          </label>
          <label>
            <span>Currency</span>
            <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
              {currencies.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as "USER" | "MERCHANT") }>
              <option value="USER">USER</option>
              <option value="MERCHANT">MERCHANT</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={loading || !name.trim()}>
            Create account
          </button>
        </form>
      </div>

      {error ? <div className="alert-card">{error}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h3>Accounts</h3>
          <span>Click to open the dedicated detail route</span>
        </div>
        <div className="table-card">
          {accounts.map((account) => (
            <button key={account.id} type="button" className="table-row" onClick={() => onOpenAccount(account.id)}>
              <div>
                <strong>{account.name}</strong>
                <span>{account.currency_code} · {account.type}</span>
              </div>
              <div className="row-stats">
                <span>Posted: {account.posted_balance_minor}</span>
                <span>Held: {account.held_balance_minor}</span>
                <span>Available: {account.available_balance_minor}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
