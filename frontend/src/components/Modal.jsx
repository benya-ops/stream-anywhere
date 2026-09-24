import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            data-testid="modal"
            className={`relative z-10 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-[#1E293B] bg-[#0F172A] shadow-2xl`}
          >
            <div className="flex items-start justify-between border-b border-[#1E293B] px-5 py-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-100">{title}</h3>
                {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
              </div>
              <button onClick={onClose} data-testid="modal-close" className="rounded-md p-1.5 text-slate-400 hover:bg-[#1E293B] hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-[#1E293B] px-5 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function TextField({ label, value, onChange, type = "text", placeholder, testid }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</label>
      <input
        data-testid={testid} type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? e.target.value : e.target.value)}
        className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 placeholder:text-slate-600"
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, testid }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</label>
      <select
        data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#1E293B] bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/50"
      >
        {options.map((o) => (
          <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value} className="bg-slate-900">
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PrimaryButton({ children, onClick, testid, type = "button", disabled }) {
  return (
    <button
      type={type} onClick={onClick} data-testid={testid} disabled={disabled}
      className="rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 font-display text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-transform hover:scale-[1.02] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, testid, className = "" }) {
  return (
    <button
      onClick={onClick} data-testid={testid}
      className={`rounded-lg border border-[#1E293B] bg-slate-950/40 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1E293B] ${className}`}
    >
      {children}
    </button>
  );
}
