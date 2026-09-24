import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Radio, Cable, SlidersHorizontal, Film,
  BarChart3, Users, Settings, LogOut, Signal, Menu, X, Server, Activity,
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/", label: "Mission Control", icon: LayoutDashboard, end: true, testid: "nav-overview" },
  { to: "/engine", label: "Media Server", icon: Server, testid: "nav-engine" },
  { to: "/streams", label: "Live Streams", icon: Radio, testid: "nav-streams" },
  { to: "/sources", label: "Input Sources", icon: Cable, testid: "nav-sources" },
  { to: "/transcoding", label: "Transcoding", icon: SlidersHorizontal, testid: "nav-transcoding" },
  { to: "/media", label: "VOD & Playout", icon: Film, testid: "nav-media" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, testid: "nav-analytics" },
  { to: "/system", label: "System & Server", icon: Activity, testid: "nav-system" },
  { to: "/users", label: "Access Control", icon: Users, adminOnly: true, testid: "nav-users" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-[#1E293B] bg-[#070A0F]">
      <div className="flex h-16 items-center gap-2.5 border-b border-[#1E293B] px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/20">
          <Signal className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-bold tracking-tight text-slate-100">Stream Anywhere</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Broadcast Engine</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            data-testid={n.testid}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sky-500/10 text-sky-300 border border-sky-500/30"
                  : "text-slate-400 hover:bg-[#1E293B]/60 hover:text-slate-200 border border-transparent"
              )
            }
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-[#1E293B] p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 font-display text-sm font-bold text-slate-200">
            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{user?.name}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">{user?.role}</p>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); navigate("/login"); }}
            className="rounded-md p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="relative min-h-screen bg-[#090D14]">
      <div className="fixed left-0 top-0 z-40 hidden h-screen lg:block">{Sidebar}</div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#1E293B] bg-[#090D14]/90 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-slate-300" onClick={() => setOpen(!open)} data-testid="sidebar-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 live-dot" />
              <span className="font-mono text-xs font-semibold tracking-wider text-emerald-400">ENGINE ONLINE</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-slate-500 sm:block">
              {new Date().toLocaleDateString()} · v2.4.0
            </span>
          </div>
        </header>
        <main className="relative z-10 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
