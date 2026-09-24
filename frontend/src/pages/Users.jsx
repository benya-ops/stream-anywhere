import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loading, StatusBadge } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, Trash2, Shield, ShieldOff } from "lucide-react";

const empty = { email: "", password: "", name: "", role: "viewer" };
const roleBadge = { admin: "live", operator: "connected", viewer: "standby" };

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/users").then((r) => setUsers(r.data)).catch((e) => {
    if (e.response?.status === 403) setDenied(true); else toast.error(formatApiError(e.response?.data?.detail));
  });
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post("/users", form); toast.success("User created"); setOpen(false); setForm(empty); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/users/${id}`); toast.success("User removed"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (denied) return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
      <ShieldOff className="h-10 w-10 text-red-400" />
      <p className="font-mono text-sm">Access denied — administrator role required.</p>
    </div>
  );
  if (!users) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Access Control" subtitle="Team members, roles and permissions for the broadcast platform.">
        <PrimaryButton testid="new-user-btn" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add User</span>
        </PrimaryButton>
      </PageHeader>

      <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
        <table className="w-full text-left text-sm" data-testid="users-table">
          <thead>
            <tr className="bg-[#141E33] font-mono text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">User</th><th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.id}`} className="border-t border-[#1E293B]/60 text-slate-300 hover:bg-[#1E293B]/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 font-display text-xs font-bold text-slate-200">
                      {(u.name || u.email).slice(0, 1).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-100">{u.name}</span>
                    {u.role === "admin" && <Shield className="h-3.5 w-3.5 text-sky-400" />}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.email}</td>
                <td className="px-4 py-3"><StatusBadge status={roleBadge[u.role] || "standby"} label={u.role.toUpperCase()} /></td>
                <td className="px-4 py-3 text-right">
                  {u.id !== user.id && (
                    <button data-testid={`delete-user-${u.id}`} onClick={() => remove(u.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add User" subtitle="Create a new team member account."
        footer={<><GhostButton testid="cancel-user" onClick={() => setOpen(false)}>Cancel</GhostButton><PrimaryButton testid="save-user" onClick={create}>Create User</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Name" testid="user-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Jane Operator" />
          <SelectField label="Role" testid="user-role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={["viewer", "operator", "admin"]} />
          <TextField label="Email" testid="user-email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="jane@broadcast.tv" />
          <TextField label="Password" testid="user-password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="min 6 chars" />
        </div>
      </Modal>
    </div>
  );
}
