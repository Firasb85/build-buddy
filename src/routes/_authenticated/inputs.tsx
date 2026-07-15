import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listInputTemplates, listInputSubmissions, saveInputSubmission, deleteInputSubmission, saveInputBlob, getInputBlob } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { useActiveFactory } from "@/hooks/use-active-factory";
import { FileInput, Save, Trash2, Download, Paperclip, Plus, X } from "lucide-react";
import type { InputSubmission, InputFieldDef, InputKind, InputAttachment } from "@/lib/local-db";

export const Route = createFileRoute("/_authenticated/inputs")({
  component: InputsPage,
});

function InputsPage() {
  return <FormPage kind="input" />;
}

export function FormPage({ kind }: { kind: InputKind }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { factory } = useActiveFactory();

  const templates = useQuery({ queryKey: ["input-templates", factory?.id, kind], queryFn: () => listInputTemplates() });
  const submissions = useQuery({ queryKey: ["input-submissions", factory?.id, kind], queryFn: () => listInputSubmissions({ kind }) });

  const [templateId, setTemplateId] = useState<string>("");
  const [forDate, setForDate] = useState(new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string | number | null>>({});
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<InputAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => templates.data?.find((t) => t.id === templateId), [templates.data, templateId]);

  // When templates load, default-select the first one of this kind
  useMemo(() => {
    if (templates.data && templates.data.length && !templateId) {
      const first = templates.data.find((t) => t.kind === kind) ?? templates.data[0];
      if (first) setTemplateId(first.id);
    }
  }, [templates.data, kind, templateId]);

  function setField(key: string, v: string | number | null) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function clear() {
    setValues({});
    setNotes("");
    setAttachments([]);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    const newOnes: InputAttachment[] = [];
    for (const f of Array.from(files)) {
      newOnes.push({
        id: crypto.randomUUID(),
        filename: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
        blob: f,
        created_at: new Date().toISOString(),
      });
    }
    setAttachments((s) => [...s, ...newOnes]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((s) => s.filter((a) => a.id !== id));
  }

  async function downloadAttachment(att: InputAttachment) {
    const url = URL.createObjectURL(att.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error(t.form_no_template);
      // Save blobs first
      const blobIds: string[] = [];
      for (const att of attachments) {
        await saveInputBlob({ id: att.id, blob: att.blob, filename: att.filename, mime: att.mime });
        blobIds.push(att.id);
      }
      const row = await saveInputSubmission({
        kind: template.kind,
        for_date: forDate,
        values,
        notes: notes || null,
        attachment_ids: blobIds,
      });
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["input-submissions"] });
      clear();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteInputSubmission({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["input-submissions"] }),
  });

  if (!factory) {
    return <div className="card-panel p-8 text-center text-sm text-muted-foreground">{t.no_factory_selected}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileInput className="h-6 w-6 text-primary" />
          {kind === "input" ? t.inputs_title : t.outputs_title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {kind === "input" ? t.inputs_desc : t.outputs_desc}
        </p>
      </div>

      <div className="card-panel p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-text">{t.form_pick_template}</label>
            <select className="input-field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">—</option>
              {(templates.data ?? [])
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <option key={t.id} value={t.id}>{lang === "ar" ? t.name_ar : t.name_en}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="label-text">{t.form_for_date}</label>
            <input className="input-field" type="date" value={forDate} onChange={(e) => setForDate(e.target.value)} />
          </div>
        </div>

        {template ? (
          <DynamicForm
            fields={template.fields}
            values={values}
            onChange={setField}
            lang={lang}
            t={t}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">{t.form_no_template}</p>
        )}

        <div>
          <label className="label-text">{t.field_notes}</label>
          <textarea className="input-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Attachments */}
        <div>
          <label className="label-text flex items-center gap-2">
            <Paperclip className="h-3 w-3" />
            {t.form_attachments} ({attachments.length})
          </label>
          <p className="text-[11px] text-muted-foreground mb-2">{t.form_attachments_hint}</p>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
          <div className="rounded-md border-2 border-dashed border-border p-3 text-center cursor-pointer hover:bg-surface-2/40 transition" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onPickFiles(e.dataTransfer.files); }}>
            <Plus className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-1">{t.form_attachments_hint}</p>
          </div>
          {attachments.length > 0 && (
            <ul className="mt-3 space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1 truncate">{a.filename}</span>
                  <span className="text-muted-foreground tabular-nums">{(a.size / 1024).toFixed(1)} KB</span>
                  <button type="button" className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-2" onClick={() => downloadAttachment(a)} title={t.form_attachments_download}>
                    <Download className="h-3 w-3" />
                  </button>
                  <button type="button" className="grid h-6 w-6 place-items-center rounded-md hover:bg-destructive/10 text-destructive" onClick={() => removeAttachment(a.id)} title={t.form_attachments_remove}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button type="button" className="btn-ghost" onClick={clear}>{t.form_clear}</button>
          <button type="button" className="btn-primary" disabled={save.isPending || !template} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" />
            {save.isPending ? t.saving : t.form_save}
          </button>
        </div>
        {save.error && <p className="text-xs text-destructive">{(save.error as Error).message}</p>}
      </div>

      <div className="card-panel p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          {t.form_submissions}
          <span className="badge-chip">{(submissions.data ?? []).length}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-start py-2">{t.col_for_date}</th>
                <th className="text-start">{t.col_kind}</th>
                <th className="text-start">{t.col_submitted}</th>
                <th className="text-end">{t.col_attachments}</th>
                <th className="text-end px-4">{t.col_action}</th>
              </tr>
            </thead>
            <tbody>
              {((submissions.data ?? []) as InputSubmission[]).map((s) => (
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-2 tabular-nums">{s.for_date}</td>
                  <td className="text-xs">{s.kind === "input" ? (lang === "ar" ? "مدخلات" : "Input") : (lang === "ar" ? "مخرجات" : "Output")}</td>
                  <td className="text-xs text-muted-foreground tabular-nums">{new Date(s.submitted_at).toLocaleTimeString()}</td>
                  <td className="text-end tabular-nums text-xs">{s.attachment_ids.length}</td>
                  <td className="text-end px-4">
                    <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-destructive/10 text-destructive" onClick={() => { if (confirm(t.confirm_delete_msg)) remove.mutate(s.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {((submissions.data ?? []) as InputSubmission[]).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">{t.form_submissions_empty}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DynamicForm({ fields, values, onChange, lang, t }: {
  fields: InputFieldDef[];
  values: Record<string, string | number | null>;
  onChange: (key: string, v: string | number | null) => void;
  lang: "ar" | "en";
  t: Record<string, string>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.key];
        const label = lang === "ar" ? f.label_ar : f.label_en;
        const unit = lang === "ar" ? f.unit_ar : f.unit_en;
        return (
          <div key={f.key}>
            <label className="label-text">
              {label} {unit && <span className="text-muted-foreground">({unit})</span>} {f.required && <span className="text-destructive">*</span>}
            </label>
            {f.type === "select" ? (
              <select className="input-field" value={v == null ? "" : String(v)} onChange={(e) => onChange(f.key, e.target.value)} required={f.required}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{lang === "ar" ? o.label_ar : o.label_en}</option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea className="input-field" rows={3} value={v == null ? "" : String(v)} onChange={(e) => onChange(f.key, e.target.value)} required={f.required} />
            ) : (
              <input
                className="input-field tabular-nums"
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={v == null ? "" : String(v)}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange(f.key, f.type === "number" ? (raw === "" ? null : Number(raw)) : raw);
                }}
                required={f.required}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
