import { useState } from "react";
import { ChevronDown, Plus, Trash2, Edit, Building2 } from "lucide-react";
import { useActiveFactory } from "@/hooks/use-active-factory";
import { useI18n, pickName } from "@/hooks/use-i18n";
import { saveFactory, deleteFactory, listFactories } from "@/lib/local-api";
import { FACTORY_TYPES, type Factory, type FactoryType } from "@/lib/local-db";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TYPE_COLORS: Record<FactoryType, string> = {
  ice_cream: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  tissue: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  carton: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

const TYPE_LABELS: Record<FactoryType, { ar: string; en: string }> = {
  ice_cream: { ar: "آيس كريم", en: "Ice cream" },
  tissue: { ar: "مناديل", en: "Tissue" },
  carton: { ar: "كراتين", en: "Carton" },
};

export function FactorySwitcher() {
  const { t, lang } = useI18n();
  const { factory, factories, setFactory } = useActiveFactory();
  const [open, setOpen] = useState(false);
  const [showEditor, setShowEditor] = useState<Factory | null | "new">(null);

  if (!factory) {
    return (
      <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className="w-full px-4 py-3 border-b border-border flex items-center gap-2 hover:bg-surface-2/40 transition"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className="h-8 w-8 rounded-md grid place-items-center text-xs font-bold"
          style={{ backgroundColor: factory.color + "33", color: factory.color }}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 text-start">
          <div className="text-sm font-semibold truncate">{pickName(factory, lang)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
            {TYPE_LABELS[factory.type][lang]}
          </div>
        </div>
        <ChevronDown className={"h-4 w-4 transition " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="absolute top-full start-0 end-0 z-30 bg-surface border border-border rounded-md mt-1 mx-3 shadow-xl max-h-96 overflow-y-auto">
          {factories.map((f) => {
            const active = f.id === factory.id;
            return (
              <button
                key={f.id}
                className={
                  "w-full text-start px-3 py-2 flex items-center gap-2 transition border-b border-border/40 last:border-b-0 " +
                  (active ? "bg-primary/10 text-primary" : "hover:bg-surface-2")
                }
                onClick={() => { setFactory(f.id); setOpen(false); }}
              >
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{pickName(f, lang)}</div>
                  <div className={"text-[10px] inline-flex items-center rounded border px-1.5 py-0.5 " + TYPE_COLORS[f.type]}>
                    {TYPE_LABELS[f.type][lang]}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-2 text-muted-foreground"
                    onClick={(e) => { e.stopPropagation(); setShowEditor(f); setOpen(false); }}
                    title={t.edit_entity}
                  >
                    <Edit className="h-3 w-3" />
                  </button>
                  <button
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t.confirm_delete_msg)) {
                        if (factories.length <= 1) {
                          alert(lang === "ar" ? "لا يمكن حذف المصنع الأخير." : "Cannot delete the last factory.");
                          return;
                        }
                        deleteFactory({ id: f.id });
                      }
                    }}
                    title={t.delete_entity}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </button>
            );
          })}
          <button
            className="w-full text-start px-3 py-2 flex items-center gap-2 text-primary hover:bg-surface-2 border-t border-border"
            onClick={() => { setShowEditor("new"); setOpen(false); }}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">{lang === "ar" ? "إضافة مصنع" : "Add factory"}</span>
          </button>
        </div>
      )}

      {showEditor !== null && (
        <FactoryEditor
          factory={showEditor === "new" ? null : showEditor}
          onClose={() => setShowEditor(null)}
        />
      )}
    </div>
  );
}

function FactoryEditor({ factory, onClose }: { factory: Factory | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState(factory?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(factory?.name_en ?? "");
  const [type, setType] = useState<FactoryType>((factory?.type ?? "ice_cream") as FactoryType);
  const [color, setColor] = useState(factory?.color ?? "#60a5fa");
  const save = useMutation({
    mutationFn: () => saveFactory({
      id: factory?.id ?? undefined,
      name_ar: nameAr,
      name_en: nameEn,
      type,
      color,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factories"] });
      qc.invalidateQueries({ queryKey: ["active-factory"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-surface border-s border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold">
            {factory ? t.edit_entity : (lang === "ar" ? "مصنع جديد" : "New factory")}
          </h3>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-surface-2" onClick={onClose}>×</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="label-text">{lang === "ar" ? "الاسم بالعربية" : "Name (Arabic)"}</label>
            <input className="input-field" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </div>
          <div>
            <label className="label-text">{lang === "ar" ? "الاسم بالإنجليزية" : "Name (English)"}</label>
            <input className="input-field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          </div>
          <div>
            <label className="label-text">{lang === "ar" ? "النوع" : "Type"}</label>
            <select className="input-field" value={type} onChange={(e) => setType(e.target.value as FactoryType)}>
              {FACTORY_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t][lang]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">{lang === "ar" ? "اللون" : "Color"}</label>
            <input className="input-field h-10" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? t.saving : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
