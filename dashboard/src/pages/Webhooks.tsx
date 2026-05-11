import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  postInjectFailure,
  postWebhookGateway,
  postWebhookReplay,
  type AccountSummary,
  type WebhookEventSummary,
} from "../api/client";
import { toUserMessage } from "../api/errors";
import { Badge, statusVariant } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { JsonViewer } from "../components/ui/JsonViewer";
import { Modal } from "../components/ui/Modal";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";

type Props = {
  accounts: AccountSummary[];
  events: WebhookEventSummary[];
  refresh: () => Promise<void>;
  readOnly?: boolean;
};

function randomEventId() {
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function WebhooksPage({ accounts, events, refresh, readOnly = false }: Props) {
  const [eventId, setEventId] = useState(randomEventId());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amountMinor, setAmountMinor] = useState("500");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [sortKey, setSortKey] = useState<"event_id" | "status" | "attempts" | "created_at">("created_at");
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEventSummary | null>(null);
  const [pendingInjectEventId, setPendingInjectEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const sortedEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const next = events.filter((event) => {
      return !query || event.event_id.toLowerCase().includes(query) || event.event_type.toLowerCase().includes(query) || event.status.toLowerCase().includes(query);
    });
    next.sort((a, b) => {
      let delta = 0;
      if (sortKey === "event_id") delta = a.event_id.localeCompare(b.event_id);
      if (sortKey === "status") delta = a.status.localeCompare(b.status);
      if (sortKey === "attempts") delta = a.attempts - b.attempts;
      if (sortKey === "created_at") delta = String(a.created_at).localeCompare(String(b.created_at));
      return sortDirection === "asc" ? delta : -delta;
    });
    return next;
  }, [events, search, sortDirection, sortKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventIdParam = params.get("eventId");
    if (!eventIdParam) {
      return;
    }
    const matched = events.find((event) => event.event_id === eventIdParam);
    if (matched) {
      setSelectedEvent(matched);
    }
  }, [events]);

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
      setError(toUserMessage(exception, "Webhook ingest failed"));
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
      setError(toUserMessage(exception, "Replay failed"));
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
      setError(toUserMessage(exception, "Inject failure failed"));
    } finally {
      setLoadingEventId(null);
    }
  }

  const columns: TableColumn<WebhookEventSummary>[] = [
    {
      key: "event_id",
      header: "Event id",
      sortable: true,
      render: (item) => (
        <button className="ui-button ui-button--ghost" type="button" onClick={() => setSelectedEvent(item)}>
          {item.event_id}
        </button>
      ),
    },
    { key: "type", header: "Type", render: (item) => item.event_type },
    { key: "status", header: "Status", sortable: true, render: (item) => <Badge variant={statusVariant(item.status)}>{item.status}</Badge> },
    { key: "attempts", header: "Attempts", sortable: true, render: (item) => item.attempts },
    { key: "created_at", header: "Received", sortable: true, render: (item) => (item.created_at ? new Date(item.created_at).toLocaleString() : "-") },
    {
      key: "actions",
      header: "Actions",
      render: (item) => {
        const replayable = item.status === "FAILED" || item.status === "DLQ";
        if (readOnly) {
          return <Badge variant="info">Read-only</Badge>;
        }
        return (
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="secondary" disabled={!replayable || loadingEventId === item.event_id} onClick={() => void replay(item.event_id)}>
              Replay
            </Button>
            <Button variant="danger" disabled={loadingEventId === item.event_id} onClick={() => setPendingInjectEventId(item.event_id)}>
              Inject fail-once
            </Button>
          </div>
        );
      },
    },
  ];

  function onSort(key: string) {
    if (key !== "event_id" && key !== "status" && key !== "attempts" && key !== "created_at") {
      return;
    }
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="webhooks"
        title="Webhook pipeline"
        description="Ingest, retry, replay, and inspect worker-backed gateway events."
      />

      {!readOnly ? (
        <Card title="Gateway ingest" subtitle="Creates a demo.fund webhook and queues worker processing.">
          <form className="ui-form-grid" onSubmit={(event) => void submitGatewayEvent(event)}>
            <Input label="Event id" value={eventId} onChange={(next) => setEventId(next.target.value)} />
            <Select label="Account" value={accountId} onChange={(next) => setAccountId(next.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>
              ))}
            </Select>
            <Input label="Amount (minor)" value={amountMinor} onChange={(next) => setAmountMinor(next.target.value)} />
            <Button variant="primary" type="submit">Send webhook</Button>
          </form>
        </Card>
      ) : null}

      {error ? <Notice variant="error">{error}</Notice> : null}
      {message ? <Notice variant="success">{message}</Notice> : null}

      <Card title="Webhook events" subtitle="Retry policy: 1, 2, 4, 8, 16 seconds then DLQ.">
        <Table
          columns={columns}
          rows={sortedEvents}
          rowKey={(row) => row.event_id}
          emptyState="No webhook events yet."
          onSort={onSort}
          sortKey={sortKey}
          sortDirection={sortDirection}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search events"
        />
      </Card>

      <Modal
        open={Boolean(selectedEvent)}
        title="Webhook event details"
        onClose={() => setSelectedEvent(null)}
        footer={<Button variant="ghost" onClick={() => setSelectedEvent(null)}>Close</Button>}
      >
        {selectedEvent ? <JsonViewer value={selectedEvent} /> : null}
      </Modal>

      <Modal
        open={Boolean(pendingInjectEventId)}
        title="Inject fail-once"
        onClose={() => setPendingInjectEventId(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingInjectEventId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => {
              const value = pendingInjectEventId;
              setPendingInjectEventId(null);
              if (value) {
                void injectFailure(value);
              }
            }}>Confirm inject</Button>
          </>
        }
      >
        <p>This marks the selected event to fail once on next processing attempt.</p>
      </Modal>
    </section>
  );
}
