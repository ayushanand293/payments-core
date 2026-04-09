import { useMemo, useState } from "react";
import { getReconcileLatest, postReconcileRun, type ReconcileReport } from "../api/client";

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
      setError(exception instanceof Error ? exception.message : "Reconciliation run failed");
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
      setError(exception instanceof Error ? exception.message : "Unable to load latest reconciliation report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <h3>Reconciliation</h3>
          <span>{report ? `Last run ${new Date(report.ran_at).toLocaleString()}` : "No run yet"}</span>
        </div>
        <div className="row-actions">
          <button className="primary-button" type="button" onClick={() => void runNow()} disabled={loading}>
            Run reconciliation
          </button>
          <button className="ghost-button" type="button" onClick={() => void loadLatest()} disabled={loading}>
            Load latest
          </button>
        </div>
      </div>

      {error ? <div className="alert-card">{error}</div> : null}

      {report ? (
        <>
          <div className="panel card-grid">
            {summaryEntries.map(([key, value]) => (
              <article key={key} className="info-card">
                <span>{formatLabel(key)}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Details</h3>
              <span>Run id: {report.run_id}</span>
            </div>
            <div className="mini-table">
              {detailEntries.map(([key, value]) => (
                <details key={key} className="details-block">
                  <summary>{formatLabel(key)} ({value.length})</summary>
                  <pre className="details-json">{JSON.stringify(value, null, 2)}</pre>
                </details>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>No reconciliation runs yet</strong>
          <span>Run reconciliation to persist and view the latest report.</span>
        </div>
      )}
    </section>
  );
}
