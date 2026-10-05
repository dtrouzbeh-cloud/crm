import { StrictMode, lazy, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Redirect } from "wouter";
import "./styles/app.css";
import "./styles/extra.css";
import { I18nProvider } from "./lib/i18n.tsx";
import { useMe } from "./lib/auth.ts";
import { Toasts, ConfirmHost, Spinner } from "./components/ui.tsx";
import { Shell } from "./components/Shell.tsx";
import { Login, Signup, InviteAccept, Forgot, Reset } from "./pages/Auth.tsx";

const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Leads = lazy(() => import("./pages/Leads.tsx"));
const LeadDetail = lazy(() => import("./pages/LeadDetail.tsx"));
const Tasks = lazy(() => import("./pages/Tasks.tsx"));
const Cases = lazy(() => import("./pages/Cases.tsx"));
const CaseWorkspace = lazy(() => import("./pages/case/CaseWorkspace.tsx"));
const Quotes = lazy(() => import("./pages/Quotes.tsx"));
const PatientQuote = lazy(() => import("./pages/PatientQuote.tsx"));
const Catalog = lazy(() => import("./pages/Catalog.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Deals = lazy(() => import("./pages/Deals.tsx"));
const Soon = lazy(() => import("./pages/Soon.tsx"));
const Reception = lazy(() => import("./pages/Reception.tsx"));
const Trips = lazy(() => import("./pages/Trips.tsx"));

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: true } } });

function Authed({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();
  if (isLoading) return <Spinner />;
  if (!data?.user) return <Redirect to="/login" />;
  if (!data.clinic) return <div className="empty">Klinik üyeliği bulunamadı.</div>;
  return <Shell><Suspense fallback={<Spinner />}>{children}</Suspense></Shell>;
}

function App() {
  return <Switch>
    <Route path="/login" component={Login} />
    <Route path="/signup" component={Signup} />
    <Route path="/forgot" component={Forgot} />
    <Route path="/reset" component={Reset} />
    <Route path="/invite/:token" component={InviteAccept} />
    <Route path="/q/:token">{() => <Suspense fallback={<Spinner />}><PatientQuote /></Suspense>}</Route>
    <Route>{() => <Authed><Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/leads/:id" component={LeadDetail} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/cases" component={Cases} />
      <Route path="/cases/:id/:step?" component={CaseWorkspace} />
      <Route path="/quotes/:id?" component={Quotes} />
      <Route path="/deals/:id?" component={Deals} />
      <Route path="/catalog/:tab?" component={Catalog} />
      <Route path="/settings/:tab?" component={Settings} />
      <Route path="/profile" component={Profile} />
      <Route path="/reception" component={Reception} />
      <Route path="/trips" component={Trips} />
      <Route>{() => <Soon />}</Route>
    </Switch></Authed>}</Route>
  </Switch>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={qc}><I18nProvider><App /><Toasts /><ConfirmHost /></I18nProvider></QueryClientProvider></StrictMode>);
