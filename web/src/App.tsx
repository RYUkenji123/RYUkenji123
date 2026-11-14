import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api, ApiError, type User } from "./api";
import { Icon } from "./components/Icons";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import StudioList from "./pages/StudioList";
import Workspace from "./pages/Workspace";
import PerspectiveAcademy from "./pages/PerspectiveAcademy";
import LightAcademy from "./pages/LightAcademy";
import Exercises from "./pages/Exercises";
import Progress from "./pages/Progress";
import Tutor from "./pages/Tutor";

interface Session {
  user: User;
  ai: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx)!;

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const link = (to: string, label: string, icon: ReactNode, short = label) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} aria-label={label}>
      {icon}
      <span className="nav-full">{label}</span>
      <span className="nav-short">{short}</span>
    </NavLink>
  );
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="/favicon.svg" alt="" /> DrawLab
        </div>
        {link("/", "Dashboard", <Icon.home />, "Home")}
        {link("/studio", "Breakdown Studio", <Icon.studio />, "Studio")}
        <div className="nav-section">Learn</div>
        {link("/perspective", "Perspective Academy", <Icon.cube />, "Persp.")}
        {link("/light", "Light & Shadow", <Icon.sun />, "Light")}
        {link("/exercises", "Daily Exercises", <Icon.timer />, "Practice")}
        <div className="nav-section">You</div>
        {link("/progress", "Progress", <Icon.chart />, "Progress")}
        {link("/tutor", "AI Tutor", <Icon.chat />, "Tutor")}
        <div className="sidebar-foot">
          <div className="small">{user.name}</div>
          <div className="faint small" style={{ textTransform: "capitalize", marginBottom: 8 }}>{user.skill_level}</div>
          <button className="ghost sm" onClick={logout}><Icon.logout /> Sign out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<{ user: User | null; ai: boolean; loading: boolean; offline?: boolean }>({ user: null, ai: false, loading: true });
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User; ai: boolean }>("/me");
      setState({ user: r.user, ai: r.ai, loading: false });
    } catch (e) {
      // a network failure (no ApiError status) means we can't reach the server, not that you're signed out
      setState({ user: null, ai: false, loading: false, offline: !(e instanceof ApiError) });
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setState({ user: null, ai: false, loading: false });
  }, []);

  if (state.loading) return <div className="empty"><span className="spinner" /></div>;
  if (state.offline)
    return (
      <div className="empty stack" style={{ alignItems: "center", paddingTop: "30vh" }}>
        <img src="/icon-192.png" alt="" width={64} height={64} style={{ borderRadius: 14 }} />
        <h2 style={{ color: "var(--text)" }}>Can't reach DrawLab</h2>
        <p style={{ maxWidth: 320 }}>You're offline, or the DrawLab server isn't running. Your work is saved on the server and will be here when you reconnect.</p>
        <button className="primary" onClick={() => { setState((s) => ({ ...s, loading: true })); refresh(); }}>Try again</button>
      </div>
    );
  if (!state.user) return <AuthPage onDone={refresh} />;

  return (
    <SessionCtx.Provider value={{ user: state.user, ai: state.ai, refresh, logout }}>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/studio" element={<StudioList />} />
            <Route path="/studio/:id" element={<Workspace />} />
            <Route path="/perspective" element={<PerspectiveAcademy />} />
            <Route path="/light" element={<LightAcademy />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/tutor" element={<Tutor />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </SessionCtx.Provider>
  );
}
