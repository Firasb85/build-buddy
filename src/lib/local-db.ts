// Local Dexie (IndexedDB) database for the AI-EOS app.
// Replaces Supabase. Schema mirrors the previous Supabase tables but
// adds multi-tenant support: every data row is scoped to a "factory".

import Dexie, { type Table } from "dexie";

// ============ Factory (multi-tenant root) ============
export type FactoryType = "ice_cream" | "tissue" | "carton";
export const FACTORY_TYPES: FactoryType[] = ["ice_cream", "tissue", "carton"];
export const ACTIVE_FACTORY_KEY = "ai-eos:active-factory";

export interface Factory {
  id: string;
  name_ar: string;
  name_en: string;
  type: FactoryType;
  color: string;
  created_at: string;
}

// ============ Table row types ============

export interface Material {
  id: string;
  factory_id: string;
  name_ar: string;
  name_en: string;
  unit: string;
  stock_qty: number;
  reorder_point: number;
  unit_cost: number;
  lead_time_days: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionLine {
  id: string;
  factory_id: string;
  name_ar: string;
  name_en: string;
  capacity_per_hour: number;
  status: "running" | "setup" | "idle" | "broken" | "maintenance";
  quality_factor: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  factory_id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  daily_demand: number;
  margin_pct: number;
  stability: number;
  shelf_life_days: number | null;
  moq: number;
  strategic_weight: number;
  stock_qty: number;
  preferred_line_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BomItem {
  id: string;
  factory_id: string;
  product_id: string;
  material_id: string;
  quantity_per_unit: number;
}

export interface Customer {
  id: string;
  factory_id: string;
  name_ar: string;
  name_en: string;
  importance: number;
  annual_value: number;
  churn_risk: number;
  created_at: string;
}

export interface Order {
  id: string;
  factory_id: string;
  customer_id: string;
  product_id: string;
  quantity: number;
  due_date: string;
  status: "received" | "reviewing" | "approved" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface DailyEntry {
  id: string;
  factory_id: string;
  entry_date: string;
  product_id: string;
  line_id: string | null;
  produced: number;
  shipped: number;
  received_material_qty: number;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface ObjectiveSettings {
  id: number;
  factory_id: string;
  objective: "default" | "maximize_profit" | "maximize_service" | "reduce_inventory" | "protect_cash";
  custom_weights: number[] | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PpsSnapshot {
  id: string;
  factory_id: string;
  run_at: string;
  objective: ObjectiveSettings["objective"];
  product_id: string;
  pps: number;
  components: Record<string, number>;
  constraint_status: "ok" | "constrained";
  constraint_notes: { code: string; detail: string }[] | null;
}

export interface Recommendation {
  id: string;
  factory_id: string;
  created_at: string;
  product_id: string | null;
  action_ar: string;
  action_en: string;
  reason_ar: string | null;
  reason_en: string | null;
  impact: Record<string, number> | null;
  priority: number | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  decided_by: string | null;
  decided_at: string | null;
}

export interface DecisionLog {
  id: string;
  factory_id: string;
  created_at: string;
  user_id: string | null;
  recommendation_id: string | null;
  action: string;
  notes: string | null;
}

export interface ForecastRun {
  id: string;
  factory_id: string;
  run_at: string;
  metric: "demand" | "inventory" | "cash";
  horizon: "7d" | "4w" | "3m";
  subject: string;
  scenario: "optimistic" | "likely" | "pessimistic";
  point_estimate: number;
  low_estimate: number | null;
  high_estimate: number | null;
  confidence: number;
  driver_notes: Record<string, unknown> | null;
}

export interface AlertState {
  id: string;
  factory_id: string;
  created_at: string;
  kind: "stockout" | "overstock" | "dead_stock" | "low_readiness" | "line_down" | "demand_anomaly" | "yield_drop" | "reorder_needed" | "cash_risk";
  severity: "info" | "warning" | "critical";
  subject_kind: string;
  subject_id: string;
  title_ar: string;
  title_en: string;
  detail_ar: string | null;
  detail_en: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
}

export interface LearningSignal {
  id: string;
  factory_id: string;
  created_at: string;
  user_id: string | null;
  recommendation_id: string | null;
  product_id: string | null;
  signal: "accept" | "reject" | "override" | "snooze";
  objective: string | null;
  weight_snapshot: number[] | null;
  component_dominant: number | null;
  accuracy_score: number | null;
}

export interface SimulationRun {
  id: string;
  factory_id: string;
  created_at: string;
  created_by: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  label_ar: string | null;
  label_en: string | null;
}

export interface AssistantMessage {
  id: string;
  factory_id: string;
  created_at: string;
  user_id: string | null;
  role: "user" | "assistant";
  content: string;
  context_snapshot: Record<string, unknown> | null;
}

export interface AiRun {
  id: string;
  factory_id: string;
  created_at: string;
  finished_at: string | null;
  user_id: string | null;
  kind: "pps" | "forecast" | "simulate" | "briefing" | "anomaly" | "assistant";
  status: "running" | "success" | "error";
  duration_ms: number | null;
  params: Record<string, unknown> | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
}

// ============ Inputs (per-factory schema-driven form) ============
// One row per form submission. The `kind` field distinguishes input vs
// output. The `fields` is a structured record with the typed values.
// `attachments` is the list of file Blobs (see below).
export type InputKind = "input" | "output";

export interface FactoryInputTemplate {
  id: string;
  factory_id: string;
  kind: InputKind;
  name_ar: string;
  name_en: string;
  /** Ordered list of fields. Each is a typed key+label+type. */
  fields: InputFieldDef[];
  created_at: string;
}

export interface InputFieldDef {
  key: string;
  label_ar: string;
  label_en: string;
  type: "text" | "number" | "select" | "textarea" | "date";
  required?: boolean;
  options?: { value: string; label_ar: string; label_en: string }[];
  unit_ar?: string;
  unit_en?: string;
}

export interface InputAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  blob: Blob;
  created_at: string;
}

export interface InputSubmission {
  id: string;
  factory_id: string;
  kind: InputKind;
  /** date the submission is "for" (e.g. shift date) */
  for_date: string;
  /** when the user submitted it */
  submitted_at: string;
  values: Record<string, string | number | null>;
  notes: string | null;
  attachment_ids: string[];
}

// Separate table for blobs (Dexie stores them more efficiently as a
// dedicated store, and so we can garbage-collect unreferenced blobs).
export interface InputBlobRow {
  id: string;
  blob: Blob;
}

// ============ Dexie database ============

class AIEOSDB extends Dexie {
  factories!: Table<Factory, string>;
  materials!: Table<Material, string>;
  production_lines!: Table<ProductionLine, string>;
  products!: Table<Product, string>;
  bom_items!: Table<BomItem, string>;
  customers!: Table<Customer, string>;
  orders!: Table<Order, string>;
  daily_entries!: Table<DailyEntry, string>;
  objective_settings!: Table<ObjectiveSettings, number>;
  pps_snapshots!: Table<PpsSnapshot, string>;
  recommendations!: Table<Recommendation, string>;
  decision_log!: Table<DecisionLog, string>;
  forecast_runs!: Table<ForecastRun, string>;
  alert_states!: Table<AlertState, string>;
  learning_signals!: Table<LearningSignal, string>;
  simulation_runs!: Table<SimulationRun, string>;
  assistant_messages!: Table<AssistantMessage, string>;
  ai_runs!: Table<AiRun, string>;
  input_templates!: Table<FactoryInputTemplate, string>;
  input_submissions!: Table<InputSubmission, string>;
  input_blobs!: Table<InputBlobRow, string>;

  constructor() {
    super("ai-eos");
    // Note: factory_id is indexed on every table that has it.
    this.version(2).stores({
      factories: "id,type,created_at",
      materials: "id,factory_id,name_en,name_ar",
      production_lines: "id,factory_id,name_en,name_ar,status",
      products: "id,factory_id,sku,name_en,name_ar,active,preferred_line_id",
      bom_items: "id,factory_id,product_id,material_id,[product_id+material_id]",
      customers: "id,factory_id,name_en,name_ar",
      orders: "id,factory_id,customer_id,product_id,due_date,status",
      daily_entries: "id,factory_id,entry_date,product_id,line_id",
      objective_settings: "[factory_id+id],factory_id",
      pps_snapshots: "id,factory_id,run_at,product_id",
      recommendations: "id,factory_id,created_at,product_id,status,priority",
      decision_log: "id,factory_id,created_at,user_id,recommendation_id",
      forecast_runs: "id,factory_id,run_at,metric,horizon,subject,scenario",
      alert_states: "id,factory_id,created_at,kind,subject_id,dismissed_at",
      learning_signals: "id,factory_id,created_at,user_id,recommendation_id,product_id,signal",
      simulation_runs: "id,factory_id,created_at,user_id",
      assistant_messages: "id,factory_id,created_at,user_id,role",
      ai_runs: "id,factory_id,created_at,user_id,kind,status",
      input_templates: "id,factory_id,kind,created_at",
      input_submissions: "id,factory_id,kind,for_date,submitted_at",
      input_blobs: "id",
    });
  }
}

let _db: AIEOSDB | null = null;
export function db(): AIEOSDB {
  if (!_db) _db = new AIEOSDB();
  return _db;
}

// ============ Active factory state ============

export function getActiveFactoryId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_FACTORY_KEY);
}

export function setActiveFactoryId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_FACTORY_KEY, id);
}

// ============ Init / seed ============

const SEED_FLAG = "ai-eos:seeded:v4";

/**
 * Ensure the DB is initialized. On first run, creates 4 factories and
 * seeds one of the ice-cream factories with the existing demo data
 * (so the original demo still works).
 */
export async function ensureSeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG) === "1") {
    // Ensure an active factory is selected
    const active = getActiveFactoryId();
    if (!active) {
      const first = await db().factories.toCollection().first();
      if (first) setActiveFactoryId(first.id);
    }
    return;
  }
  await seedAll();
  window.localStorage.setItem(SEED_FLAG, "1");
}

/** Wipe and re-seed (for a "Reset" button). */
export async function resetAndReseed(): Promise<void> {
  if (typeof window === "undefined") return;
  await db().delete();
  window.localStorage.removeItem(SEED_FLAG);
  _db = null;
  await seedAll();
  window.localStorage.setItem(SEED_FLAG, "1");
}

// ============ Default field templates per factory type ============

export const DEFAULT_INPUT_TEMPLATE_ICE_CREAM: { input: InputFieldDef[]; output: InputFieldDef[] } = {
  input: [
    { key: "milk_liters", label_ar: "كمية الحليب", label_en: "Milk quantity", type: "number", unit_ar: "لتر", unit_en: "L", required: true },
    { key: "sugar_kg", label_ar: "كمية السكر", label_en: "Sugar quantity", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "cream_kg", label_ar: "كمية الكريمة", label_en: "Cream quantity", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "flavor", label_ar: "النكهة", label_en: "Flavor", type: "select", required: true,
      options: [
        { value: "vanilla", label_ar: "فانيلا", label_en: "Vanilla" },
        { value: "chocolate", label_ar: "شوكولاتة", label_en: "Chocolate" },
        { value: "strawberry", label_ar: "فراولة", label_en: "Strawberry" },
        { value: "mango", label_ar: "مانجو", label_en: "Mango" },
        { value: "salted_caramel", label_ar: "كراميل مملح", label_en: "Salted caramel" },
        { value: "mixed", label_ar: "مشكل", label_en: "Mixed" },
      ] },
    { key: "cold_room_temp", label_ar: "حرارة غرفة التبريد", label_en: "Cold room temp", type: "number", unit_ar: "°C", unit_en: "°C" },
    { key: "machine_hours", label_ar: "ساعات تشغيل الماكينة", label_en: "Machine hours", type: "number", unit_ar: "س", unit_en: "h" },
    { key: "shift", label_ar: "الوردية", label_en: "Shift", type: "select", required: true,
      options: [
        { value: "morning", label_ar: "صباحية", label_en: "Morning" },
        { value: "evening", label_ar: "مسائية", label_en: "Evening" },
        { value: "night", label_ar: "ليلية", label_en: "Night" },
      ] },
  ],
  output: [
    { key: "produced_kg", label_ar: "الإنتاج", label_en: "Produced", type: "number", unit_ar: "كغ", unit_en: "kg", required: true },
    { key: "waste_kg", label_ar: "الهادر", label_en: "Waste", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "defect_pct", label_ar: "نسبة العيوب", label_en: "Defect rate", type: "number", unit_ar: "٪", unit_en: "%" },
    { key: "packaging_units", label_ar: "عدد العبوات", label_en: "Packaging units", type: "number" },
    { key: "shipped_units", label_ar: "المنقول", label_en: "Shipped", type: "number" },
    { key: "cold_room_temp", label_ar: "حرارة غرفة التبريد", label_en: "Cold room temp", type: "number", unit_ar: "°C", unit_en: "°C" },
  ],
};

export const DEFAULT_INPUT_TEMPLATE_TISSUE: { input: InputFieldDef[]; output: InputFieldDef[] } = {
  input: [
    { key: "rolls_in", label_ar: "عدد رولات الورق الداخل", label_en: "Paper rolls in", type: "number", unit_ar: "رول", unit_en: "roll", required: true },
    { key: "paper_weight_kg", label_ar: "وزن الورق", label_en: "Paper weight", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "sheet_size", label_ar: "مقاس الفوطة", label_en: "Sheet size", type: "text", required: true,
      placeholder_ar: "مثال: 20×20 سم", placeholder_en: "e.g. 20×20 cm" } as InputFieldDef & { placeholder_ar?: string; placeholder_en?: string },
    { key: "ply", label_ar: "عدد الطبقات", label_en: "Ply", type: "select", required: true,
      options: [
        { value: "1", label_ar: "طبقة واحدة", label_en: "1-ply" },
        { value: "2", label_ar: "طبقتان", label_en: "2-ply" },
        { value: "3", label_ar: "ثلاث طبقات", label_en: "3-ply" },
        { value: "4", label_ar: "أربع طبقات", label_en: "4-ply" },
      ] },
    { key: "machine_hours", label_ar: "ساعات الماكينة", label_en: "Machine hours", type: "number", unit_ar: "س", unit_en: "h" },
    { key: "operator", label_ar: "اسم المشغّل", label_en: "Operator", type: "text" },
  ],
  output: [
    { key: "sheets_out", label_ar: "عدد الفوط المنتجة", label_en: "Sheets produced", type: "number", required: true },
    { key: "bundles", label_ar: "عدد الربطات", label_en: "Bundles", type: "number" },
    { key: "waste_kg", label_ar: "الهادر", label_en: "Waste", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "defect_pct", label_ar: "نسبة العيوب", label_en: "Defect rate", type: "number", unit_ar: "٪", unit_en: "%" },
    { key: "shipped_bundles", label_ar: "المنقول", label_en: "Shipped bundles", type: "number" },
  ],
};

export const DEFAULT_INPUT_TEMPLATE_CARTON: { input: InputFieldDef[]; output: InputFieldDef[] } = {
  input: [
    { key: "board_in_sheets", label_ar: "عدد ألواح الكرتون الداخل", label_en: "Board sheets in", type: "number", required: true },
    { key: "board_type", label_ar: "نوع الكرتون", label_en: "Board type", type: "select", required: true,
      options: [
        { value: "single_wall", label_ar: "موجة واحدة", label_en: "Single wall" },
        { value: "double_wall", label_ar: "موجتان", label_en: "Double wall" },
        { value: "triple_wall", label_ar: "ثلاث موجات", label_en: "Triple wall" },
      ] },
    { key: "board_size", label_ar: "مقاس اللوح", label_en: "Board size", type: "text", required: true },
    { key: "glue_kg", label_ar: "كمية الصمغ", label_en: "Glue quantity", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "ink_kg", label_ar: "كمية الحبر", label_en: "Ink quantity", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "machine_hours", label_ar: "ساعات الماكينة", label_en: "Machine hours", type: "number", unit_ar: "س", unit_en: "h" },
  ],
  output: [
    { key: "boxes_out", label_ar: "عدد الكراتين المنتجة", label_en: "Boxes produced", type: "number", required: true },
    { key: "defect_pct", label_ar: "نسبة العيوب", label_en: "Defect rate", type: "number", unit_ar: "٪", unit_en: "%" },
    { key: "waste_kg", label_ar: "الهادر", label_en: "Waste", type: "number", unit_ar: "كغ", unit_en: "kg" },
    { key: "shipped_boxes", label_ar: "المنقول", label_en: "Shipped boxes", type: "number" },
    { key: "printing_quality", label_ar: "جودة الطباعة", label_en: "Print quality", type: "select",
      options: [
        { value: "excellent", label_ar: "ممتازة", label_en: "Excellent" },
        { value: "good", label_ar: "جيدة", label_en: "Good" },
        { value: "fair", label_ar: "مقبولة", label_en: "Fair" },
        { value: "poor", label_ar: "ضعيفة", label_en: "Poor" },
      ] },
  ],
};

export function defaultTemplateFor(factoryType: FactoryType, kind: InputKind): InputFieldDef[] {
  if (factoryType === "ice_cream") return kind === "input" ? DEFAULT_INPUT_TEMPLATE_ICE_CREAM.input : DEFAULT_INPUT_TEMPLATE_ICE_CREAM.output;
  if (factoryType === "tissue") return kind === "input" ? DEFAULT_INPUT_TEMPLATE_TISSUE.input : DEFAULT_INPUT_TEMPLATE_TISSUE.output;
  return kind === "input" ? DEFAULT_INPUT_TEMPLATE_CARTON.input : DEFAULT_INPUT_TEMPLATE_CARTON.output;
}

async function seedAll(): Promise<void> {
  const now = new Date().toISOString();

  // ===== Factories =====
  const iceCream1Id = "fac00000-0000-0000-0000-000000000001";
  const iceCream2Id = "fac00000-0000-0000-0000-000000000002";
  const tissueId = "fac00000-0000-0000-0000-000000000003";
  const cartonId = "fac00000-0000-0000-0000-000000000004";

  await db().factories.bulkPut([
    { id: iceCream1Id, name_ar: "مصنع الآيس كريم ١", name_en: "Ice Cream Plant 1", type: "ice_cream", color: "#60a5fa", created_at: now },
    { id: iceCream2Id, name_ar: "مصنع الآيس كريم ٢", name_en: "Ice Cream Plant 2", type: "ice_cream", color: "#a78bfa", created_at: now },
    { id: tissueId, name_ar: "مصنع المناديل", name_en: "Tissue Plant", type: "tissue", color: "#34d399", created_at: now },
    { id: cartonId, name_ar: "مصنع الكراتين", name_en: "Carton Box Plant", type: "carton", color: "#fb923c", created_at: now },
  ]);

  // Default active = first factory
  setActiveFactoryId(iceCream1Id);

  // ===== Per-factory templates =====
  for (const fid of [iceCream1Id, iceCream2Id]) {
    await db().input_templates.bulkPut([
      { id: crypto.randomUUID(), factory_id: fid, kind: "input", name_ar: "مدخلات الإنتاج اليومي", name_en: "Daily production inputs",
        fields: DEFAULT_INPUT_TEMPLATE_ICE_CREAM.input, created_at: now },
      { id: crypto.randomUUID(), factory_id: fid, kind: "output", name_ar: "مخرجات الإنتاج اليومي", name_en: "Daily production outputs",
        fields: DEFAULT_INPUT_TEMPLATE_ICE_CREAM.output, created_at: now },
    ]);
  }
  await db().input_templates.bulkPut([
    { id: crypto.randomUUID(), factory_id: tissueId, kind: "input", name_ar: "مدخلات خط المناديل", name_en: "Tissue line inputs",
      fields: DEFAULT_INPUT_TEMPLATE_TISSUE.input, created_at: now },
    { id: crypto.randomUUID(), factory_id: tissueId, kind: "output", name_ar: "مخرجات خط المناديل", name_en: "Tissue line outputs",
      fields: DEFAULT_INPUT_TEMPLATE_TISSUE.output, created_at: now },
  ]);
  await db().input_templates.bulkPut([
    { id: crypto.randomUUID(), factory_id: cartonId, kind: "input", name_ar: "مدخلات خط الكراتين", name_en: "Carton line inputs",
      fields: DEFAULT_INPUT_TEMPLATE_CARTON.input, created_at: now },
    { id: crypto.randomUUID(), factory_id: cartonId, kind: "output", name_ar: "مخرجات خط الكراتين", name_en: "Carton line outputs",
      fields: DEFAULT_INPUT_TEMPLATE_CARTON.output, created_at: now },
  ]);

  // ===== Original demo data, scoped to ice cream plant 1 =====
  const fid = iceCream1Id;

  await db().materials.bulkPut([
    { id: "11111111-0000-0000-0000-000000000001", factory_id: fid, name_ar: "حليب طازج", name_en: "Fresh Milk", unit: "L", stock_qty: 1800, reorder_point: 500, unit_cost: 4.20, lead_time_days: 1, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000002", factory_id: fid, name_ar: "سكر", name_en: "Sugar", unit: "kg", stock_qty: 900, reorder_point: 300, unit_cost: 3.40, lead_time_days: 3, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000003", factory_id: fid, name_ar: "كريمة", name_en: "Cream", unit: "L", stock_qty: 400, reorder_point: 200, unit_cost: 18.0, lead_time_days: 1, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000004", factory_id: fid, name_ar: "نكهة فانيلا", name_en: "Vanilla flavor", unit: "L", stock_qty: 60, reorder_point: 20, unit_cost: 95.0, lead_time_days: 7, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000005", factory_id: fid, name_ar: "نكهة شوكولاتة", name_en: "Chocolate flavor", unit: "kg", stock_qty: 50, reorder_point: 20, unit_cost: 110.0, lead_time_days: 7, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000006", factory_id: fid, name_ar: "عبوات 1 لتر", name_en: "1L tubs", unit: "pcs", stock_qty: 5000, reorder_point: 1500, unit_cost: 0.85, lead_time_days: 7, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000007", factory_id: fid, name_ar: "أعواد خشبية", name_en: "Wooden sticks", unit: "pcs", stock_qty: 12000, reorder_point: 3000, unit_cost: 0.05, lead_time_days: 5, created_at: now, updated_at: now },
  ]);

  await db().production_lines.bulkPut([
    { id: "22222222-0000-0000-0000-000000000001", factory_id: fid, name_ar: "خط الإنتاج 1", name_en: "Production Line 1", capacity_per_hour: 250, status: "running", quality_factor: 0.96, created_at: now, updated_at: now },
    { id: "22222222-0000-0000-0000-000000000002", factory_id: fid, name_ar: "خط الإنتاج 2", name_en: "Production Line 2", capacity_per_hour: 180, status: "running", quality_factor: 0.93, created_at: now, updated_at: now },
    { id: "22222222-0000-0000-0000-000000000003", factory_id: fid, name_ar: "خط التغليف", name_en: "Packaging Line", capacity_per_hour: 600, status: "idle", quality_factor: 0.98, created_at: now, updated_at: now },
  ]);

  await db().products.bulkPut([
    { id: "33333333-0000-0000-0000-000000000001", factory_id: fid, sku: "IC-VAN-1L", name_ar: "آيس كريم فانيلا 1 لتر", name_en: "Vanilla 1L", daily_demand: 600, margin_pct: 0.32, stability: 0.92, shelf_life_days: 90, moq: 100, strategic_weight: 9, stock_qty: 480, preferred_line_id: "22222222-0000-0000-0000-000000000001", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000002", factory_id: fid, sku: "IC-CHO-1L", name_ar: "آيس كريم شوكولاتة 1 لتر", name_en: "Chocolate 1L", daily_demand: 400, margin_pct: 0.35, stability: 0.88, shelf_life_days: 90, moq: 100, strategic_weight: 8, stock_qty: 320, preferred_line_id: "22222222-0000-0000-0000-000000000001", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000003", factory_id: fid, sku: "IC-STR-500", name_ar: "آيس كريم فراولة 500 مل", name_en: "Strawberry 500ml", daily_demand: 300, margin_pct: 0.40, stability: 0.78, shelf_life_days: 90, moq: 80, strategic_weight: 7, stock_qty: 180, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000004", factory_id: fid, sku: "IC-MIX-1L", name_ar: "آيس كريم مشكل 1 لتر", name_en: "Mixed 1L", daily_demand: 250, margin_pct: 0.30, stability: 0.85, shelf_life_days: 90, moq: 80, strategic_weight: 6, stock_qty: 220, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000005", factory_id: fid, sku: "IC-CAR-500", name_ar: "آيس كريم كراميل مملح 500 مل", name_en: "Salted Caramel 500ml", daily_demand: 200, margin_pct: 0.42, stability: 0.72, shelf_life_days: 90, moq: 50, strategic_weight: 5, stock_qty: 90, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
  ]);

  // BOM
  await db().bom_items.bulkPut([
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.6 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000002", quantity_per_unit: 0.15 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000003", quantity_per_unit: 0.2 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000004", quantity_per_unit: 0.005 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000006", quantity_per_unit: 1 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.55 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000002", quantity_per_unit: 0.18 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000003", quantity_per_unit: 0.22 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000005", quantity_per_unit: 0.04 },
    { id: crypto.randomUUID(), factory_id: fid, product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000006", quantity_per_unit: 1 },
  ]);

  await db().customers.bulkPut([
    { id: "44444444-0000-0000-0000-000000000001", factory_id: fid, name_ar: "سوبرماركت النخيل", name_en: "Al-Nakheel Market", importance: 9, annual_value: 480000, churn_risk: 0.10, created_at: now },
    { id: "44444444-0000-0000-0000-000000000002", factory_id: fid, name_ar: "مطاعم الوجبة", name_en: "Al-Wajba Restaurants", importance: 8, annual_value: 210000, churn_risk: 0.18, created_at: now },
    { id: "44444444-0000-0000-0000-000000000003", factory_id: fid, name_ar: "فنادق الخليج", name_en: "Gulf Hotels", importance: 7, annual_value: 320000, churn_risk: 0.22, created_at: now },
    { id: "44444444-0000-0000-0000-000000000004", factory_id: fid, name_ar: "متاجر التوفير", name_en: "Al-Tawfeer Stores", importance: 6, annual_value: 95000, churn_risk: 0.30, created_at: now },
  ]);

  const today = new Date();
  const offset = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };
  await db().orders.bulkPut([
    { id: crypto.randomUUID(), factory_id: fid, customer_id: "44444444-0000-0000-0000-000000000001", product_id: "33333333-0000-0000-0000-000000000001", quantity: 800, due_date: offset(2), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), factory_id: fid, customer_id: "44444444-0000-0000-0000-000000000001", product_id: "33333333-0000-0000-0000-000000000002", quantity: 600, due_date: offset(5), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), factory_id: fid, customer_id: "44444444-0000-0000-0000-000000000002", product_id: "33333333-0000-0000-0000-000000000003", quantity: 400, due_date: offset(3), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), factory_id: fid, customer_id: "44444444-0000-0000-0000-000000000003", product_id: "33333333-0000-0000-0000-000000000004", quantity: 300, due_date: offset(4), status: "in_progress", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), factory_id: fid, customer_id: "44444444-0000-0000-0000-000000000004", product_id: "33333333-0000-0000-0000-000000000005", quantity: 220, due_date: offset(6), status: "approved", created_at: now, updated_at: now },
  ]);

  // Daily entries
  const entries: DailyEntry[] = [];
  for (let g = 0; g < 7; g++) {
    const d = new Date(today);
    d.setDate(d.getDate() - g);
    const ds = d.toISOString().slice(0, 10);
    for (const pid of [
      "33333333-0000-0000-0000-000000000001",
      "33333333-0000-0000-0000-000000000002",
      "33333333-0000-0000-0000-000000000003",
    ]) {
      const produced = 500 + Math.floor(Math.random() * 200);
      const shipped = produced - Math.floor(Math.random() * 50);
      entries.push({
        id: crypto.randomUUID(),
        factory_id: fid,
        entry_date: ds,
        product_id: pid,
        line_id: "22222222-0000-0000-0000-000000000001",
        produced, shipped,
        received_material_qty: 0,
        notes: null,
        entered_by: null,
        created_at: now,
      });
    }
  }
  await db().daily_entries.bulkPut(entries);

  // Objective settings
  await db().objective_settings.put({
    id: 1, factory_id: fid, objective: "default", custom_weights: null,
    updated_at: now, updated_by: null,
  });
}
