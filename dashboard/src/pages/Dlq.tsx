import { useMemo, useState } from "react";
import { postDlqReplay, type DlqEventSummary } from "../api/client";
import { toUserMessage } from "../api/errors";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Table, type TableColumn } from "../components/ui/Table";

type Props = {
  events: DlqEventSummary[];
  refresh: () => Promise<void>;
  readOnly?: boolean;
};

export function DlqPage({ events, refresh, readOnly = false }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const sortedEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...events]
      .filter((event) => !query || event.event_id.toLowerCase().includes(query) || event.event_type.toLowerCase().includes(query) || (event.last_error ?? "").toLowerCase().includes(query))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }, [events, search]);

  async function replay(eventId: string) {
    setLoadingEventId(eventId);
    setMessage(null);
    setError(null);
    try {
      await postDlqReplay(eventId);
      setMessage(`Replay queued for ${eventId}`);
      await refresh();
    } catch (exception) {
      setError(toUserMessage(exception, "Replay failed"));
    } finally {
      setLoadingEventId(null);
    }
  }

  const columns: TableColumn<DlqEventSummary>[] = [
    { key: "event_id", header: "Event id", render: (item) => item.event_id },
    { key: "event_type", header: "Type", render: (item) => item.event_type },
    { key: "attempts", header: "Attempts", render: (item) => item.attempts },
    { key: "last_error", header: "Last error", render: (item) => item.last_error },
    { key: "created", header: "Created", render: (item) => (item.created_at ? new Date(item.created_at).toLocaleString() : "-") },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {readOnly ? (
            <Badge variant="info">Read-only</Badge>
          ) : (
            <Button variant="secondary" disabled={loadingEventId === item.event_id} onClick={() => void replay(item.event_id)}>
              Replay
            </Button>
          )}
          <a href={`/webhooks?eventId=${encodeURIComponent(item.event_id)}`} style={{ alignSelf: "center", fontSize: 13 }}>
            Open webhook
          </a>
        </div>
      ),
    },
  ];

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="recovery"
        title="Dead letter queue"
        description="Events that exhausted retry policy and need operator attention."
      />

      {error ? <Notice variant="error">{error}</Notice> : null}
      {message ? <Notice variant="success">{message}</Notice> : null}

      <Card>
        <Table
          columns={columns}
          rows={sortedEvents}
          rowKey={(row) => row.event_id}
          emptyState="No DLQ events. Failures exceeding retry policy appear here."
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search DLQ events"
        />
      </Card>
    </section>
  );
}
