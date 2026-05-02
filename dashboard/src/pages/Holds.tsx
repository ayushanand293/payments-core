import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  postHoldAuthorize,
  postHoldCapture,
  postHoldRelease,
  type AccountSummary,
  type HoldSummary,
} from "../api/client";
import { toUserMessage } from "../api/errors";
import { Badge, statusVariant } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";

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
  const [pendingAction, setPendingAction] = useState<{ type: "capture" | "release"; hold: HoldSummary } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const sortedHolds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...holds]
      .filter((hold) => {
        const account = accountMap.get(hold.account_id);
        const bySearch = !query || hold.id.toLowerCase().includes(query) || hold.status.toLowerCase().includes(query) || Boolean(account?.name.toLowerCase().includes(query));
        const byStatus = statusFilter === "ALL" || hold.status === statusFilter;
        return bySearch && byStatus;
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [accountMap, holds, search, statusFilter]);

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
      setError(toUserMessage(exception, "Authorize failed"));
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
      setError(toUserMessage(exception, "Capture failed"));
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
      setError(toUserMessage(exception, "Release failed"));
    } finally {
      setLoadingId(null);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }
    if (pendingAction.type === "capture") {
      await runCapture(pendingAction.hold);
    } else {
      await runRelease(pendingAction.hold);
    }
    setPendingAction(null);
  }

  const columns: TableColumn<HoldSummary>[] = [
    {
      key: "account",
      header: "Account",
      render: (hold) => {
        const account = accountMap.get(hold.account_id);
        return account?.name ?? hold.account_id;
      },
    },
    { key: "status", header: "Status", render: (hold) => <Badge variant={statusVariant(hold.status)}>{hold.status}</Badge> },
    { key: "currency", header: "Currency", render: (hold) => hold.currency_code },
    { key: "amount", header: "Amount", render: (hold) => formatMinor.format(hold.amount_minor) },
    {
      key: "expires",
      header: "Expires",
      render: (hold) => {
        const isExpired = new Date(hold.expires_at).getTime() < Date.now();
        return (
          <div>
            <div>{new Date(hold.expires_at).toLocaleString()}</div>
            {isExpired ? <Badge variant="danger">Expired</Badge> : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (hold) => {
        const isActive = hold.status === "AUTHORIZED";
        return (
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="secondary" disabled={!isActive || loadingId === hold.id} onClick={() => setPendingAction({ type: "capture", hold })}>Capture</Button>
            <Button variant="ghost" disabled={!isActive || loadingId === hold.id} onClick={() => setPendingAction({ type: "release", hold })}>Release</Button>
          </div>
        );
      },
    },
  ];

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <PageHeader
        eyebrow="holds"
        title="Funds reservation"
        description="Authorize, capture, and release holds while escrow movements stay visible."
      />

      <Card title="Authorize hold" subtitle="Default TTL is 900 seconds">
        <form className="ui-form-grid" onSubmit={(event) => void submitAuthorize(event)}>
          <Select label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} ({account.currency_code})</option>
            ))}
          </Select>
          <Input label="Amount (minor)" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} />
          <Input label="TTL seconds" value={ttlSeconds} onChange={(event) => setTtlSeconds(event.target.value)} />
          <Button variant="primary" type="submit">Authorize hold</Button>
        </form>
      </Card>

      {error ? <Notice variant="error">{error}</Notice> : null}
      {message ? <Notice variant="success">{message}</Notice> : null}

      <Card title="Holds" subtitle="Capture moves funds to escrow. Release frees availability.">
        <Table
          columns={columns}
          rows={sortedHolds}
          rowKey={(hold) => hold.id}
          emptyState="No holds match the current filters."
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search holds"
          actions={
            <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="CAPTURED">Captured</option>
              <option value="RELEASED">Released</option>
              <option value="EXPIRED">Expired</option>
            </Select>
          }
        />
      </Card>

      <Modal
        open={Boolean(pendingAction)}
        title={pendingAction ? `${pendingAction.type === "capture" ? "Capture" : "Release"} hold` : "Confirm action"}
        onClose={() => setPendingAction(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button variant={pendingAction?.type === "capture" ? "primary" : "danger"} onClick={() => void confirmPendingAction()}>Confirm</Button>
          </>
        }
      >
        <p>
          {pendingAction?.type === "capture"
            ? "Capturing this hold posts a hold-capture transaction and moves funds to escrow."
            : "Releasing this hold frees the reserved amount back to available balance."}
        </p>
      </Modal>
    </section>
  );
}
