import { type ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";

export interface DrawerField {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}

export interface EntityDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  onSave: (data: T) => void;
  onDelete?: (id: string) => void;
  initial?: T | null;
  title: string;
  fields: DrawerField[];
  /** Map a record T → form values. If not provided, drawer treats T as Record<string, ...>. */
  toForm?: (record: T) => Record<string, string | number | boolean | null>;
  /** Map form values back into a partial T (for create/update payloads). */
  fromForm?: (form: Record<string, string | number | boolean | null>) => Partial<T>;
  saving?: boolean;
  deleting?: boolean;
}

export function EntityDrawer<T extends { id?: string | null }>(props: EntityDrawerProps<T>) {
  const { open, onClose, onSave, onDelete, initial, title, fields, toForm, fromForm, saving, deleting } = props;
  const [form, setForm] = useState<Record<string, string | number | boolean | null>>({});

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm(toForm ? toForm(initial) : (initial as unknown as Record<string, string | number | boolean | null>));
      } else {
        const empty: Record<string, string | number | boolean | null> = {};
        for (const f of fields) empty[f.key] = f.type === "number" ? 0 : "";
        setForm(empty);
      }
    }
  }, [open, initial, fields, toForm]);

  if (!open) return null;

  function setField(key: string, value: string | number | boolean | null) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = fromForm
      ? (fromForm(form) as T)
      : ({ ...form, id: initial?.id ?? undefined } as unknown as T);
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="w-full max-w-md bg-surface border-s border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {fields.map((f) => {
            const v = form[f.key];
            return (
              <div key={f.key}>
                <label className="label-text">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    className="input-field"
                    value={v == null ? "" : String(v)}
                    onChange={(e) => setField(f.key, e.target.value)}
                    required={f.required}
                  >
                    <option value="">—</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input-field tabular-nums"
                    type={f.type === "number" ? "number" : "text"}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={v == null ? "" : String(v)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setField(f.key, f.type === "number" ? (raw === "" ? 0 : Number(raw)) : raw);
                    }}
                    required={f.required}
                  />
                )}
                {f.hint && <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2">
            {onDelete && initial?.id ? (
              <button
                type="button"
                className="btn-ghost !text-destructive !border-destructive/40 hover:!bg-destructive/10"
                onClick={() => onDelete(initial.id as string)}
                disabled={deleting}
              >
                {deleting ? "..." : "Delete"}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}