import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Database,
  GitBranch,
  LayoutDashboard,
  Menu,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import {
  getAccounts,
  getCurrencies,
  getDemoStats,
  getDlqEvents,
  getHolds,
  getReconcileLatest,
  getTransactions,
  getWebhookEvents,
  postDemoReset,
  postReconcileRun,
  postTransfer,
  type AccountSummary,
  type CurrencySummary,
  type DemoStats,
  type DlqEventSummary,
  type HoldSummary,
  type ReconcileReport,
  type TransactionSummary,
  type WebhookEventSummary,
} from "./api/client";
import { toUserMessage } from "./api/errors";
import { Button } from "./components/ui/Button";
import { Card, StatCard } from "./components/ui/Card";
import { Toast } from "./components/ui/Notice";
import { Skeleton } from "./components/ui/Spinner";
import { usePolling } from "./hooks/usePolling";
import { AccountDetailPage } from "./pages/AccountDetail";
import { AccountsPage } from "./pages/Accounts";
import { DlqPage } from "./pages/Dlq";
import { HoldsPage } from "./pages/Holds";
import { OverviewPage } from "./pages/Overview";
import { ReconciliationPage } from "./pages/Reconciliation";
import { TransactionsPage } from "./pages/Transactions";
import { WebhooksPage } from "./pages/Webhooks";

type RouteState = { page: "overview" | "accounts" | "holds" | "transactions" | "webhooks" | "dlq" | "reconciliation" | "account-detail"; accountId?: string };

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
  if (pathname === "/reconciliation") {
    return { page: "reconciliation" };
  }
  return { page: "overview" };
}

const pages: Array<{ key: RouteState["page"]; label: string; path: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Overview", path: "/", icon: LayoutDashboard },
  { key: "accounts", label: "Accounts", path: "/accounts", icon: WalletCards },
  { key: "holds", label: "Holds", path: "/holds", icon: CreditCard },
  { key: "webhooks", label: "Webhooks", path: "/webhooks", icon: GitBranch },
  { key: "dlq", label: "DLQ", path: "/dlq", icon: ShieldAlert },
  { key: "reconciliation", label: "Reconciliation", path: "/reconciliation", icon: BarChart3 },
  { key: "transactions", label: "Transactions", path: "/transactions", icon: Banknote },
];

export function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [holds, setHolds] = useState<HoldSummary[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventSummary[]>([]);
  const [dlqEvents, setDlqEvents] = useState<DlqEventSummary[]>([]);
  const [demoStats, setDemoStats] = useState<DemoStats | null>(null);
  const [latestReconcile, setLatestReconcile] = useState<ReconcileReport | null>(null);
  const [currencies, setCurrencies] = useState<CurrencySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refreshData = useCallback(async (reason: "manual" | "background" | "action" = "background") => {
    setIsRefreshing(true);
    if (reason === "manual") {
      setIsManualRefreshing(true);
    }
    try {
      const [nextAccounts, nextTransactions, nextCurrencies, nextHolds, nextWebhookEvents, nextDlqEvents, nextDemoStats] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getCurrencies(),
        getHolds(),
        getWebhookEvents(),
        getDlqEvents(),
        getDemoStats(),
      ]);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
      setCurrencies(nextCurrencies);
      setHolds(nextHolds);
      setWebhookEvents(nextWebhookEvents);
      setDlqEvents(nextDlqEvents);
      setDemoStats(nextDemoStats);

      try {
        const report = await getReconcileLatest();
        setLatestReconcile(report);
      } catch {
        setLatestReconcile(null);
      }
      setLastUpdatedAt(new Date());
    } catch (exception) {
      setError(toUserMessage(exception, "Unable to load dashboard data"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      if (reason === "manual") {
        setIsManualRefreshing(false);
      }
    }
  }, []);

  const pollEnabled = useMemo(() => {
    return ["overview", "webhooks", "dlq", "reconciliation"].includes(route.page);
  }, [route.page]);

  usePolling(
    async () => {
      await refreshData();
    },
    2500,
    pollEnabled,
  );

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setError(null);
      await refreshData("background");
    };
    void run();
  }, [refreshData]);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }
    const timeoutId = window.setTimeout(() => setActionMessage(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [actionMessage]);

  useEffect(() => {
    setActionMessage(null);
  }, [route.page]);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    setMobileNavOpen(false);
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
          description: "Demo transfer from control center",
        },
        "overview-demo-transfer",
      );
      setActionMessage(`Transfer posted: ${result.id}`);
      await refreshData("action");
    } catch (exception) {
      setActionMessage(toUserMessage(exception, "Transfer failed"));
    }
  }

  async function resetDemoData() {
    try {
      await postDemoReset();
      setActionMessage("Demo reset complete.");
      await refreshData("action");
    } catch (exception) {
      setActionMessage(toUserMessage(exception, "Demo reset failed"));
    }
  }

  async function runReconciliation() {
    try {
      const report = await postReconcileRun();
      setLatestReconcile(report);
      setActionMessage(`Reconciliation run ${report.run_id} completed.`);
      await refreshData("action");
    } catch (exception) {
      setActionMessage(toUserMessage(exception, "Reconciliation failed"));
    }
  }

  return (
    <div className={sidebarCollapsed ? "ui-app is-sidebar-collapsed" : "ui-app"}>
      <aside className={mobileNavOpen ? "ui-sidebar is-open" : "ui-sidebar"}>
        <div className="ui-brand">
          <div className="ui-brand-mark"><Database size={18} /></div>
          <div className="ui-brand-copy">
            <span className="ui-kicker">fintech demo</span>
            <h1>payments-core</h1>
            <p>Ledger, webhooks, and reconciliation control plane.</p>
          </div>
        </div>

        <nav className="ui-nav">
          {pages.map((item) => {
            const Icon = item.icon;
            return (
            <button
              key={item.key}
              type="button"
              className={route.page === item.key || (item.key === "accounts" && route.page === "account-detail") ? "ui-nav-item active" : "ui-nav-item"}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
            );
          })}
        </nav>

        <Card
          title="Quick actions"
          subtitle="Safe operator shortcuts"
          className="ui-card"
        >
          <div className="ui-toolbar">
            <Button variant="ghost" onClick={() => void refreshData("manual")} loading={isManualRefreshing}>
              <RefreshCw size={15} />
              Refresh data
            </Button>
            <Button variant="secondary" onClick={() => void runSampleTransfer()}>
              Run sample transfer
            </Button>
            <Button variant="danger" onClick={() => void resetDemoData()}>
              Reset demo
            </Button>
            <Button variant="primary" onClick={() => void runReconciliation()}>
              Run reconciliation
            </Button>
          </div>
        </Card>

        <div className="ui-footer">
          <div>API: {import.meta.env.VITE_API_URL ?? "http://localhost:18000"}</div>
          <div>{lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString()}` : "Waiting for first sync"}</div>
        </div>
      </aside>

      <main className="ui-main">
        <div className="ui-mobile-scrim" onClick={() => setMobileNavOpen(false)} />
        <header className="ui-header">
          <Button variant="ghost" className="ui-mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation">
            <Menu size={17} />
          </Button>
          <div>
            <span className="ui-kicker">payments ops</span>
            <h2>Payments operations console</h2>
            <p className="ui-subtitle">Quiet, live visibility across balances, holds, webhooks, and reconciliation.</p>
          </div>
          <div className="ui-header__actions">
            <Button variant="ghost" className="ui-collapse-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label="Collapse sidebar">
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>
            <Button variant="ghost" loading={isRefreshing}>
              <Activity size={15} />
              {isRefreshing ? "Syncing" : "Live"}
            </Button>
          </div>
        </header>

        <div className="ui-toast-region">
          {error ? <Toast variant="error">{error}</Toast> : null}
          {actionMessage ? <Toast variant="success">{actionMessage}</Toast> : null}
        </div>

        <section className="ui-grid-4">
          {[
            { label: "Accounts", value: metrics.accounts, icon: <WalletCards size={16} /> },
            { label: "Transactions", value: metrics.transactions, icon: <Banknote size={16} /> },
            { label: "Balanced tx", value: metrics.balancedTransactions, icon: <GitBranch size={16} /> },
            { label: "Total available", value: metrics.totalAvailable, icon: <Clock3 size={16} /> },
          ].map((item) => (isLoading ? <Card key={item.label}><Skeleton height={72} /></Card> : <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} />))}
        </section>

        <div className="ui-page-fade" key={route.page}>
          {route.page === "overview" ? <OverviewPage accounts={accounts} transactions={transactions} stats={demoStats} onResetDemo={resetDemoData} onRunReconciliation={runReconciliation} /> : null}
          {route.page === "accounts" ? <AccountsPage accounts={accounts} refresh={refreshData} onOpenAccount={(accountId) => navigate(`/accounts/${accountId}`)} /> : null}
          {route.page === "holds" ? <HoldsPage accounts={accounts} holds={holds} refresh={refreshData} /> : null}
          {route.page === "webhooks" ? <WebhooksPage accounts={accounts} events={webhookEvents} refresh={refreshData} /> : null}
          {route.page === "dlq" ? <DlqPage events={dlqEvents} refresh={refreshData} /> : null}
          {route.page === "reconciliation" ? <ReconciliationPage initialReport={latestReconcile} refresh={refreshData} /> : null}
          {route.page === "transactions" ? <TransactionsPage transactions={transactions} accounts={accounts} refresh={refreshData} /> : null}
          {route.page === "account-detail" && route.accountId ? <AccountDetailPage accountId={route.accountId} onBack={() => navigate("/accounts")} /> : null}
        </div>
      </main>
    </div>
  );
}
