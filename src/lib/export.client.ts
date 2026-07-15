// Client-side export helpers: CSV (built-in) + PDF (jspdf + autotable).
// jspdf and jspdf-autotable are dynamically imported so they don't bloat the SSR bundle.

export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  /** Optional formatter (e.g. for dates or percentages). */
  format?: (row: T) => string;
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: ColumnDef<T>[]): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const v = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
          return escapeCsv(v);
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend BOM so Excel detects UTF-8 (Arabic / em-dash)
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(filename, blob);
}

async function ensureJsPdf() {
  const mod = await import("jspdf");
  const auto = await import("jspdf-autotable");
  // jspdf-autotable augments the default export
  return { jsPDF: (mod as { jsPDF: new (opts?: object) => unknown }).jsPDF, autoTable: (auto as { default?: (doc: unknown, opts: object) => void }).default ?? (auto as unknown as (doc: unknown, opts: object) => void) };
}

export async function rowsToPdf<T>(
  filename: string,
  title: string,
  rows: T[],
  columns: ColumnDef<T>[],
  meta?: { subtitle?: string; orientation?: "portrait" | "landscape" },
) {
  const { jsPDF, autoTable } = await ensureJsPdf();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)({ orientation: meta?.orientation ?? "landscape", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (meta?.subtitle) doc.text(meta.subtitle, 40, 58);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString(), 40, meta?.subtitle ? 74 : 58);
  doc.text("AI-EOS", pageWidth - 40, 40, { align: "right" });

  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
      return v == null ? "" : String(v);
    }),
  );

  autoTable(doc, {
    head: [columns.map((c) => c.label)],
    body,
    startY: 90,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [50, 50, 60], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 247] },
  });

  doc.save(filename);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
