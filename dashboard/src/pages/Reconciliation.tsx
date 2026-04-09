import { useMemo, useState } from "react";
import { getReconcileLatest, postReconcileRun, type ReconcileReport } from "../api/client";
import { toUserMessage } from "../api/errors";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { JsonViewer } from "../components/ui/JsonViewer";
import { Notice } from "../components/ui/Notice";

type Props = {
  initialReport: ReconcileReport | null;
  refresh: () => Promise<void>;
};

function formatLabel(key: string): string {
  return key.split("_").join(" ");
}

export function ReconciliationPage({ initialReport, refresh }: Props) {
  const [report, setReport] = useState<ReconcileReport | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summaryEntries = useMemo(() => (report ? Object.entries(report.summary) : []), [report]);
  const detailEntries = useMemo(() => (report ? Object.entries(report.details) : []), [report]);

  async function runNow() {
    setLoading(true);
    setError(null);
    try {
      const next = await postReconcileRun();
      setReport(next);
      await refresh();
    } catch (exception) {
      setError(toUserMessage(exception, "Reconciliation run failed"));
    } finally {
      setLoading(false);
    }
  }

  async function loadLatest() {
    setLoading(true);
    setError(null);
    try {
      const next = await getReconcileLatest();
      setReport(next);
    } catch (exception) {
      setError(toUserMessage(exception, "Unable to load latest reconciliation report"));
    } finally {
      setLoading(false);
    }
  }

  async function copyDetails(value: unknown) {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  }

  function downloadDetails(key: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${key}-${report?.run_id ?? "latest"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <Card title="Reconciliation" subtitle={report ? `Last run ${new Date(report.ran_at).toLocaleString()}` : "No run yet"}>
        <div className="ui-toolbar">
          <Button variant="primary" type="button" onClick={() => void runNow()} disabled={loading}>
            Run reconciliation
          </Button>
          <Button variant="secondary" type="button" onClick={() => void loadLatest()} disabled={loading}>
            Load latest
          </Button>
        </div>
      </Card>

      {error ? <Notice variant="error">{error}</Notice> : null}

      {report ? (
        <>
          <div className="ui-grid-3">
            {summaryEntries.map(([key, value]) => (
              <Card key={key}>
                <div className="ui-stat">
                  <span className="ui-stat__label">{formatLabel(key)}</span>
                  <strong className="ui-stat__value">{value}</strong>
                </div>
              </Card>
            ))}
          </div>

          <Card title="Details" subtitle={`Run id: ${report.run_id}`}>
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {detailEntries.map(([key, value]) => (
                <details key={key} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                  <summary>{formatLabel(key)} ({value.length})</summary>
                  <div className="ui-toolbar" style={{ margin: "var(--space-2) 0" }}>
                    <Button variant="ghost" onClick={() => void copyDetails(value)}>Copy JSON</Button>
                    <Button variant="secondary" onClick={() => downloadDetails(key, value)}>Download JSON</Button>
                  </div>
                  <JsonViewer value={value} />
                </details>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <strong>No reconciliation runs yet</strong>
          <p className="ui-subtitle">Run reconciliation to persist and view the latest report.</p>
        </Card>
      )}
    </section>
  );
}
