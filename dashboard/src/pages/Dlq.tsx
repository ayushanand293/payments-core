import { useMemo, useState } from "react";
import { postDlqReplay, type DlqEventSummary } from "../api/client";

type Props = {
  events: DlqEventSummary[];
  refresh: () => Promise<void>;
};

export function DlqPage({ events, refresh }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))), [events]);

  async function replay(eventId: string) {
    setLoadingEventId(eventId);
    setMessage(null);
    setError(null);
    try {
      await postDlqReplay(eventId);
      setMessage(`Replay queued for ${eventId}`);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Replay failed");
    } finally {
      setLoadingEventId(null);
    }
  }

  return (
    <section className="page-stack">
      {error ? <div className="alert-card">{error}</div> : null}
      {message ? <div className="alert-card soft">{message}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h3>Dead letter queue</h3>
          <span>Events moved after 5 failed attempts.</span>
        </div>
        <div className="table-card">
          {sortedEvents.length === 0 ? (
            <div className="empty-state">
              <strong>No DLQ events</strong>
              <span>Failures that exceed retry limits appear here.</span>
            </div>
          ) : null}
          {sortedEvents.map((item) => (
            <div key={item.event_id} className="table-row static-row">
              <div>
                <strong>{item.event_id}</strong>
                <span>
                  {item.event_type} · attempts {item.attempts}
                </span>
                <span>{item.last_error}</span>
              </div>
              <div className="row-actions">
                <button
                  className="inline-action-button"
                  type="button"
                  disabled={loadingEventId === item.event_id}
                  onClick={() => void replay(item.event_id)}
                >
                  Replay
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
