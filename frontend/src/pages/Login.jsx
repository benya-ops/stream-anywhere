import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Signal, Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@streamanywhere.io");
  const [password, setPassword] = useState("Broadcast2026!");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090D14] p-4">
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage: "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.15), transparent 40%), radial-gradient(circle at 80% 60%, rgba(99,102,241,0.15), transparent 45%)",
      }} />
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(30,41,59,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(30,41,59,0.4) 1px, transparent 1px)",
        backgroundSize: "44px 44px", maskImage: "radial-gradient(circle at center, black, transparent 75%)",
      }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/30">
            <Signal className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">Stream Anywhere</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">Broadcast Control Panel</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#0F172A]/80 p-6 backdrop-blur-xl shadow-2xl">
          <div className="mb-5 flex rounded-lg border border-[#1E293B] p-1">
            {["login", "register"].map((m) => (
              <button
                key={m}
                data-testid={`tab-${m}`}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === m ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <Field label="Name" testid="input-name" value={name} onChange={setName} placeholder="Jane Operator" />
            )}
            <Field label="Email" testid="input-email" value={email} onChange={setEmail} type="email" placeholder="you@broadcast.tv" />
            <Field label="Password" testid="input-password" value={password} onChange={setPassword} type="password" placeholder="••••••••" />

            {error && (
              <p data-testid="auth-error" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              data-testid="submit-btn"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 py-2.5 font-display font-semibold text-white shadow-lg shadow-sky-500/20 transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Enter Control Room" : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center font-mono text-[11px] text-slate-500">
            Demo admin: admin@streamanywhere.io / Broadcast2026!
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, testid }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</label>
      <input
        data-testid={testid}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30"
      />
    </div>
  );
}
