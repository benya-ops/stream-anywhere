import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loading, StatusBadge, CodecChip } from "@/components/common";
import Modal, { TextField, SelectField, PrimaryButton, GhostButton } from "@/components/Modal";
import { toast } from "sonner";
import { Plus, Trash2, Shield, Pencil, Crown } from "lucide-react";

const LABELS = {
  engine: "Media Server", streams: "Live Streams", sources: "Input Sources",
  transcoding: "Transcoding", media: "VOD & Playout", analytics: "Analytics", system: "System & Server",
};
const emptyCreate = { email: "", password: "", name: "", role: "user", permissions: [] };

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [modules, setModules] = useState([]);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(null); // user being edited
  const [form, setForm] = useState(emptyCreate);

  const load = async () => {
    const [u, m] = await Promise.all([api.get("/users"), api.get("/modules")]);
    setUsers(u.data); setModules(m.data.modules);
  };
  useEffect(() => { load(); }, []);

  const toggle = (obj, key) => obj.includes(key) ? obj.filter((x) => x !== key) : [...obj, key];

  const doCreate = async () => {
    try {
      await api.post("/users", form);
      toast.success("User created"); setCreate(false); setForm(emptyCreate); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const doEdit = async () => {
    try {
      await api.put(`/users/${edit.id}`, {
        name: edit.name, role: edit.role, permissions: edit.permissions,
        password: edit.password || undefined,
      });
      toast.success("User updated"); setEdit(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async (id) => {
    try { await api.delete(`/users/${id}`); toast.success("User removed"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!users) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Access Control" subtitle="Create users and grant each of them access to specific services / blocks.">
        <PrimaryButton testid="new-user-btn" onClick={() => { setForm(emptyCreate); setCreate(true); }}>
          <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add User</span>
        </PrimaryButton>
      </PageHeader>

      <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
        <table className="w-full text-left text-sm" data-testid="users-table">
          <thead>
            <tr className="bg-[#141E33] font-mono text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Access</th><th className="px-4 py-3 text-right"></th>
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
                    {u.superadmin && <Crown className="h-3.5 w-3.5 text-amber-400" title="Super Admin" />}
                  </div>
                  <span className="ml-10 font-mono text-[11px] text-slate-500">{u.email}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={u.role === "admin" ? "live" : "standby"} label={u.superadmin ? "SUPER ADMIN" : u.role.toUpperCase()} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.role === "admin" ? <CodecChip>ALL SERVICES</CodecChip>
                      : (u.permissions?.length ? u.permissions.map((p) => <CodecChip key={p}>{LABELS[p] || p}</CodecChip>) : <span className="font-mono text-[11px] text-slate-500">overview only</span>)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {!u.superadmin && (
                      <button data-testid={`edit-user-${u.id}`} onClick={() => setEdit({ ...u, password: "" })} className="rounded-md p-1.5 text-sky-400 hover:bg-sky-500/10" title="Edit"><Pencil className="h-4 w-4" /></button>
                    )}
                    {!u.superadmin && u.id !== user.id && (
                      <button data-testid={`delete-user-${u.id}`} onClick={() => remove(u.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create */}
      <Modal open={create} onClose={() => setCreate(false)} title="Add User" subtitle="Create an account and choose what they can access."
        footer={<><GhostButton testid="cancel-user" onClick={() => setCreate(false)}>Cancel</GhostButton><PrimaryButton testid="save-user" onClick={doCreate}>Create User</PrimaryButton></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Name" testid="user-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Jane Operator" />
          <SelectField label="Role" testid="user-role" value={form.role} onChange={(v) => setForm({ ...form, role: v })}
            options={[{ value: "user", label: "User (limited access)" }, { value: "admin", label: "Admin (full access)" }]} />
          <TextField label="Email" testid="user-email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="jane@company.tv" />
          <TextField label="Password" testid="user-password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="min 6 chars" />
        </div>
        {form.role === "user" && (
          <PermissionPicker modules={modules} value={form.permissions} onToggle={(k) => setForm({ ...form, permissions: toggle(form.permissions, k) })} />
        )}
      </Modal>

      {/* Edit */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit User" subtitle={edit?.email}
        footer={<><GhostButton testid="cancel-edit" onClick={() => setEdit(null)}>Cancel</GhostButton><PrimaryButton testid="save-edit" onClick={doEdit}>Save Changes</PrimaryButton></>}>
        {edit && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Name" testid="edit-name" value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
              <SelectField label="Role" testid="edit-role" value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })}
                options={[{ value: "user", label: "User (limited access)" }, { value: "admin", label: "Admin (full access)" }]} />
              <div className="sm:col-span-2"><TextField label="New Password (optional)" testid="edit-password" type="password" value={edit.password} onChange={(v) => setEdit({ ...edit, password: v })} placeholder="leave blank to keep" /></div>
            </div>
            {edit.role === "user" && (
              <PermissionPicker modules={modules} value={edit.permissions || []} onToggle={(k) => setEdit({ ...edit, permissions: toggle(edit.permissions || [], k) })} />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function PermissionPicker({ modules, value, onToggle }) {
  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400"><Shield className="h-3.5 w-3.5" /> Service Access</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {modules.map((m) => (
          <label key={m} data-testid={`perm-${m}`} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#1E293B] bg-slate-950/40 px-3 py-2 hover:border-sky-500/40">
            <input type="checkbox" checked={value.includes(m)} onChange={() => onToggle(m)} className="h-4 w-4 accent-sky-500" />
            <span className="text-sm text-slate-200">{LABELS[m] || m}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-slate-500">Mission Control (overview) is always available. Access Control is admin-only.</p>
    </div>
  );
}
