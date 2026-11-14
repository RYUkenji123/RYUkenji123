import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api, type User } from "./api";
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
  const link = (to: string, label: string, icon: ReactNode) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="/favicon.svg" alt="" /> DrawLab
        </div>
        {link("/", "Dashboard", <Icon.home />)}
        {link("/studio", "Breakdown Studio", <Icon.studio />)}
        <div className="nav-section">Learn</div>
        {link("/perspective", "Perspective Academy", <Icon.cube />)}
        {link("/light", "Light & Shadow", <Icon.sun />)}
        {link("/exercises", "Daily Exercises", <Icon.timer />)}
        <div className="nav-section">You</div>
        {link("/progress", "Progress", <Icon.chart />)}
        {link("/tutor", "AI Tutor", <Icon.chat />)}
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
  const [state, setState] = useState<{ user: User | null; ai: boolean; loading: boolean }>({ user: null, ai: false, loading: true });
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User; ai: boolean }>("/me");
      setState({ user: r.user, ai: r.ai, loading: false });
    } catch {
      setState({ user: null, ai: false, loading: false });
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
