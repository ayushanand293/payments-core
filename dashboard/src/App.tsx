import { useEffect, useMemo, useState } from "react";
import {
  getAccounts,
  getCurrencies,
  getDlqEvents,
  getHolds,
  getTransactions,
  getWebhookEvents,
  postTransfer,
  type AccountSummary,
  type CurrencySummary,
  type DlqEventSummary,
  type HoldSummary,
  type TransactionSummary,
  type WebhookEventSummary,
} from "./api/client";
import { AccountDetailPage } from "./pages/AccountDetail";
import { AccountsPage } from "./pages/Accounts";
import { DlqPage } from "./pages/Dlq";
import { HoldsPage } from "./pages/Holds";
import { OverviewPage } from "./pages/Overview";
import { TransactionsPage } from "./pages/Transactions";
import { WebhooksPage } from "./pages/Webhooks";

type RouteState = { page: "overview" | "accounts" | "holds" | "transactions" | "webhooks" | "dlq" | "account-detail"; accountId?: string };

function parseRoute(pathname: string): RouteState {
  if (pathname.startsWith("/accounts/") && pathname.length > "/accounts/".length) {
    return { page: "account-detail", accountId: pathname.slice("/accounts/".length) };
  }
  if (pathname === "/accounts") {
    return { page: "accounts" };
  }
  if (pathname === "/transactions") {
    return { page: "transactions" };
  }
  if (pathname === "/holds") {
    return { page: "holds" };
  }
  if (pathname === "/webhooks") {
    return { page: "webhooks" };
  }
  if (pathname === "/dlq") {
    return { page: "dlq" };
  }
  return { page: "overview" };
}

const pages: Array<{ key: RouteState["page"]; label: string; path: string }> = [
  { key: "overview", label: "Overview", path: "/" },
  { key: "accounts", label: "Accounts", path: "/accounts" },
  { key: "holds", label: "Holds", path: "/holds" },
  { key: "webhooks", label: "Webhooks", path: "/webhooks" },
  { key: "dlq", label: "DLQ", path: "/dlq" },
  { key: "transactions", label: "Transactions", path: "/transactions" },
];

export function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [holds, setHolds] = useState<HoldSummary[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventSummary[]>([]);
  const [dlqEvents, setDlqEvents] = useState<DlqEventSummary[]>([]);
  const [currencies, setCurrencies] = useState<CurrencySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function refreshData() {
    setIsLoading(true);
    setError(null);
    try {
      const [nextAccounts, nextTransactions, nextCurrencies, nextHolds, nextWebhookEvents, nextDlqEvents] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getCurrencies(),
        getHolds(),
        getWebhookEvents(),
        getDlqEvents(),
      ]);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
      setCurrencies(nextCurrencies);
      setHolds(nextHolds);
      setWebhookEvents(nextWebhookEvents);
      setDlqEvents(nextDlqEvents);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Unable to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
  }

  const metrics = useMemo(() => {
    const balancedTransactions = transactions.filter((transaction) => transaction.balanced).length;
    const totalAvailable = accounts.reduce((sum, account) => sum + account.available_balance_minor, 0);
    return {
      accounts: accounts.length,
      transactions: transactions.length,
      currencies: currencies.length,
      balancedTransactions,
      totalAvailable,
    };
  }, [accounts, transactions, currencies]);

  async function runSampleTransfer() {
    const source = accounts.find((account) => account.name === "INR Alice Wallet");
    const destination = accounts.find((account) => account.name === "INR Corner Shop");

    if (!source || !destination) {
      setActionMessage("Seeded INR demo accounts are not available yet.");
      return;
    }

    try {
      const result = await postTransfer(
        {
          from_account_id: source.id,
          to_account_id: destination.id,
          currency_code: "INR",
          amount_minor: 1250,
          description: "Demo transfer from the overview page",
        },
        "overview-demo-transfer",
      );
      setActionMessage(`Transfer posted: ${result.id}`);
      await refreshData();
    } catch (exception) {
      setActionMessage(exception instanceof Error ? exception.message : "Transfer failed");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-kicker">fintech demo</span>
          <h1>payments-core</h1>
          <p>Ledger-first payments backend with retry-safe flows.</p>
        </div>

        <nav className="nav-list">
          {pages.map((item) => (
            <button
              key={item.key}
              type="button"
              className={route.page === item.key || (item.key === "accounts" && route.page === "account-detail") ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="ghost-button" type="button" onClick={() => void refreshData()}>
            Refresh data
          </button>
          <button className="primary-button" type="button" onClick={() => void runSampleTransfer()}>
            Run sample transfer
          </button>
          <p className="helper-text">Webhooks and DLQ controls are now live for Week 3 reliability scenarios.</p>
        </div>
      </aside>

      <main className="content-panel">
        <header className="topbar">
          <div>
            <p className="section-label">Week 3 dashboard</p>
            <h2>Operational view for the payments core</h2>
          </div>
          <div className="status-pill">{isLoading ? "Syncing" : "Live"}</div>
        </header>

        {error ? <div className="alert-card">{error}</div> : null}
        {actionMessage ? <div className="alert-card soft">{actionMessage}</div> : null}

        <section className="kpi-grid">
          <article className="kpi-card">
            <span>Accounts</span>
            <strong>{metrics.accounts}</strong>
          </article>
          <article className="kpi-card">
            <span>Transactions</span>
            <strong>{metrics.transactions}</strong>
          </article>
          <article className="kpi-card">
            <span>Balanced tx</span>
            <strong>{metrics.balancedTransactions}</strong>
          </article>
          <article className="kpi-card">
            <span>Total available</span>
            <strong>{metrics.totalAvailable}</strong>
          </article>
        </section>

        {route.page === "overview" ? <OverviewPage accounts={accounts} transactions={transactions} /> : null}
        {route.page === "accounts" ? <AccountsPage accounts={accounts} refresh={refreshData} onOpenAccount={(accountId) => navigate(`/accounts/${accountId}`)} /> : null}
        {route.page === "holds" ? <HoldsPage accounts={accounts} holds={holds} refresh={refreshData} /> : null}
        {route.page === "webhooks" ? <WebhooksPage accounts={accounts} events={webhookEvents} refresh={refreshData} /> : null}
        {route.page === "dlq" ? <DlqPage events={dlqEvents} refresh={refreshData} /> : null}
        {route.page === "transactions" ? <TransactionsPage transactions={transactions} refresh={refreshData} /> : null}
        {route.page === "account-detail" && route.accountId ? <AccountDetailPage accountId={route.accountId} onBack={() => navigate("/accounts")} /> : null}
      </main>
    </div>
  );
}
