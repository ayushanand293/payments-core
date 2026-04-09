import { useMemo, useState, type FormEvent } from "react";
import {
  postInjectFailure,
  postWebhookGateway,
  postWebhookReplay,
  type AccountSummary,
  type WebhookEventSummary,
} from "../api/client";

type Props = {
  accounts: AccountSummary[];
  events: WebhookEventSummary[];
  refresh: () => Promise<void>;
};

function randomEventId() {
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function WebhooksPage({ accounts, events, refresh }: Props) {
  const [eventId, setEventId] = useState(randomEventId());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amountMinor, setAmountMinor] = useState("500");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [events]);

  async function submitGatewayEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const selected = accountMap.get(accountId);
    if (!selected) {
      setError("Choose an account first.");
      return;
    }

    const parsedAmount = Number(amountMinor);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    try {
      const response = await postWebhookGateway({
        event_id: eventId,
        event_type: "demo.fund",
        occurred_at: new Date().toISOString(),
        payload: {
          account_id: selected.id,
          currency_code: selected.currency_code,
          amount_minor: Math.floor(parsedAmount),
        },
      });
      setMessage(response.deduplicated ? `Deduplicated webhook ${response.event_id}` : `Queued webhook ${response.event_id}`);
      setEventId(randomEventId());
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Webhook ingest failed");
    }
  }

  async function replay(eventIdValue: string) {
    setLoadingEventId(eventIdValue);
    setMessage(null);
    setError(null);
    try {
      await postWebhookReplay(eventIdValue);
      setMessage(`Replay queued for ${eventIdValue}`);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Replay failed");
    } finally {
      setLoadingEventId(null);
    }
  }

  async function injectFailure(eventIdValue: string) {
    setLoadingEventId(eventIdValue);
    setMessage(null);
    setError(null);
    try {
      await postInjectFailure(eventIdValue);
      setMessage(`Fail-once injected for ${eventIdValue}`);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Inject failure failed");
    } finally {
      setLoadingEventId(null);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <h3>Gateway ingest</h3>
          <span>Creates a demo.fund webhook and queues worker processing.</span>
        </div>
        <form className="hold-form" onSubmit={(event) => void submitGatewayEvent(event)}>
          <label>
            <span>Event id</span>
            <input value={eventId} onChange={(next) => setEventId(next.target.value)} />
          </label>
          <label>
            <span>Account</span>
            <select value={accountId} onChange={(next) => setAccountId(next.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency_code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount (minor)</span>
            <input value={amountMinor} onChange={(next) => setAmountMinor(next.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            Send webhook
          </button>
        </form>
      </div>

      {error ? <div className="alert-card">{error}</div> : null}
      {message ? <div className="alert-card soft">{message}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h3>Webhook events</h3>
          <span>Retry policy: 1, 2, 4, 8, 16 seconds then DLQ.</span>
        </div>
        <div className="table-card">
          {sortedEvents.map((item) => {
            const replayable = item.status === "FAILED" || item.status === "DLQ";
            return (
              <div key={item.event_id} className="table-row static-row">
                <div>
                  <strong>{item.event_id}</strong>
                  <span>
                    {item.event_type} · {item.status} · attempts {item.attempts}
                  </span>
                  {item.last_error ? <span>{item.last_error}</span> : null}
                </div>
                <div className="row-actions">
                  <button
                    className="inline-action-button"
                    type="button"
                    disabled={!replayable || loadingEventId === item.event_id}
                    onClick={() => void replay(item.event_id)}
                  >
                    Replay
                  </button>
                  <button
                    className="inline-action-button"
                    type="button"
                    disabled={loadingEventId === item.event_id}
                    onClick={() => void injectFailure(item.event_id)}
                  >
                    Inject fail-once
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
