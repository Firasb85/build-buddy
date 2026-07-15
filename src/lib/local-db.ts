// Local Dexie (IndexedDB) database for the AI-EOS app.
// Replaces Supabase as the data layer. All server functions in this project
// now read/write this database. The schema mirrors the previous Supabase
// tables so the business logic is unchanged.
//
// Notes on IDs:
//   - Most tables used uuid PKs from Supabase. We keep that shape for
//     compatibility with existing code, but use crypto.randomUUID() for
//     new rows.
//   - The "singleton" tables (objective_settings) use a fixed id of 1.

import Dexie, { type Table } from "dexie";

// ============ Table row types ============

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
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
  product_id: string;
  material_id: string;
  quantity_per_unit: number;
}

export interface Customer {
  id: string;
  name_ar: string;
  name_en: string;
  importance: number;
  annual_value: number;
  churn_risk: number;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  product_id: string;
  quantity: number;
  due_date: string; // YYYY-MM-DD
  status: "received" | "reviewing" | "approved" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface DailyEntry {
  id: string;
  entry_date: string; // YYYY-MM-DD
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
  id: number; // always 1
  objective: "default" | "maximize_profit" | "maximize_service" | "reduce_inventory" | "protect_cash";
  custom_weights: number[] | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PpsSnapshot {
  id: string;
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
  created_at: string;
  user_id: string | null;
  recommendation_id: string | null;
  action: string;
  notes: string | null;
}

export interface ForecastRun {
  id: string;
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
  created_at: string;
  created_by: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  label_ar: string | null;
  label_en: string | null;
}

export interface AssistantMessage {
  id: string;
  created_at: string;
  user_id: string | null;
  role: "user" | "assistant";
  content: string;
  context_snapshot: Record<string, unknown> | null;
}

export interface AiRun {
  id: string;
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

// ============ Dexie database ============

class AIEOSDB extends Dexie {
  profiles!: Table<Profile, string>;
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

  constructor() {
    super("ai-eos");
    this.version(1).stores({
      profiles: "id,email",
      materials: "id,name_en,name_ar",
      production_lines: "id,name_en,name_ar,status",
      products: "id,sku,name_en,name_ar,active,preferred_line_id",
      bom_items: "id,product_id,material_id,[product_id+material_id]",
      customers: "id,name_en,name_ar",
      orders: "id,customer_id,product_id,due_date,status",
      daily_entries: "id,entry_date,product_id,line_id",
      objective_settings: "id",
      pps_snapshots: "id,run_at,product_id",
      recommendations: "id,created_at,product_id,status,priority",
      decision_log: "id,created_at,user_id,recommendation_id",
      forecast_runs: "id,run_at,metric,horizon,subject,scenario",
      alert_states: "id,created_at,kind,subject_id,dismissed_at",
      learning_signals: "id,created_at,user_id,recommendation_id,product_id,signal",
      simulation_runs: "id,created_at,user_id",
      assistant_messages: "id,created_at,user_id,role",
      ai_runs: "id,created_at,user_id,kind,status",
    });
  }
}

let _db: AIEOSDB | null = null;
export function db(): AIEOSDB {
  if (!_db) _db = new AIEOSDB();
  return _db;
}

// ============ Init / seed ============

const SEED_FLAG = "ai-eos:seeded:v3";

/**
 * Ensure the DB is initialized with seed data on first run.
 * Idempotent: only seeds when the flag is missing.
 * The seed mirrors the original Supabase Phase 1 migration INSERTs.
 */
export async function ensureSeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG) === "1") {
    // Even if flag set, make sure the objective_settings singleton exists.
    const obj = await db().objective_settings.get(1);
    if (!obj) {
      await db().objective_settings.put({
        id: 1, objective: "default", custom_weights: null,
        updated_at: new Date().toISOString(), updated_by: null,
      });
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
  // re-open
  _db = null;
  await seedAll();
  window.localStorage.setItem(SEED_FLAG, "1");
}

async function seedAll(): Promise<void> {
  const now = new Date().toISOString();
  // Materials
  await db().materials.bulkPut([
    { id: "11111111-0000-0000-0000-000000000001", name_ar: "دقيق قمح", name_en: "Wheat Flour", unit: "kg", stock_qty: 1800, reorder_point: 500, unit_cost: 2.10, lead_time_days: 4, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000002", name_ar: "سكر", name_en: "Sugar", unit: "kg", stock_qty: 900, reorder_point: 300, unit_cost: 3.40, lead_time_days: 3, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000003", name_ar: "زيت نباتي", name_en: "Vegetable Oil", unit: "L", stock_qty: 400, reorder_point: 200, unit_cost: 6.80, lead_time_days: 5, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000004", name_ar: "ملح", name_en: "Salt", unit: "kg", stock_qty: 250, reorder_point: 80, unit_cost: 1.10, lead_time_days: 2, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000005", name_ar: "خميرة", name_en: "Yeast", unit: "kg", stock_qty: 60, reorder_point: 30, unit_cost: 12.00, lead_time_days: 4, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000006", name_ar: "بيض", name_en: "Eggs", unit: "tray", stock_qty: 220, reorder_point: 80, unit_cost: 18.50, lead_time_days: 2, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000007", name_ar: "حليب مجفف", name_en: "Milk Powder", unit: "kg", stock_qty: 180, reorder_point: 100, unit_cost: 22.00, lead_time_days: 6, created_at: now, updated_at: now },
    { id: "11111111-0000-0000-0000-000000000008", name_ar: "عبوات كرتونية", name_en: "Cartons", unit: "pcs", stock_qty: 3500, reorder_point: 1000, unit_cost: 0.90, lead_time_days: 7, created_at: now, updated_at: now },
  ]);
  // Lines
  await db().production_lines.bulkPut([
    { id: "22222222-0000-0000-0000-000000000001", name_ar: "خط العجائن", name_en: "Dough Line", capacity_per_hour: 350, status: "running", quality_factor: 0.96, created_at: now, updated_at: now },
    { id: "22222222-0000-0000-0000-000000000002", name_ar: "خط الحلويات", name_en: "Pastry Line", capacity_per_hour: 220, status: "running", quality_factor: 0.93, created_at: now, updated_at: now },
    { id: "22222222-0000-0000-0000-000000000003", name_ar: "خط التغليف", name_en: "Packaging Line", capacity_per_hour: 800, status: "idle", quality_factor: 0.98, created_at: now, updated_at: now },
  ]);
  // Products
  await db().products.bulkPut([
    { id: "33333333-0000-0000-0000-000000000001", sku: "P-ALEF", name_ar: "خبز عربي", name_en: "Arabic Bread", daily_demand: 1200, margin_pct: 0.18, stability: 0.92, shelf_life_days: 3, moq: 200, strategic_weight: 9, stock_qty: 900, preferred_line_id: "22222222-0000-0000-0000-000000000001", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000002", sku: "P-BAY", name_ar: "كعك بالسمسم", name_en: "Sesame Cake", daily_demand: 300, margin_pct: 0.32, stability: 0.75, shelf_life_days: 14, moq: 100, strategic_weight: 7, stock_qty: 260, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000003", sku: "P-JEEM", name_ar: "معمول تمر", name_en: "Date Ma'amoul", daily_demand: 180, margin_pct: 0.42, stability: 0.60, shelf_life_days: 30, moq: 50, strategic_weight: 8, stock_qty: 90, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000004", sku: "P-DAL", name_ar: "بسكويت سادة", name_en: "Plain Biscuits", daily_demand: 500, margin_pct: 0.24, stability: 0.88, shelf_life_days: 60, moq: 200, strategic_weight: 5, stock_qty: 1400, preferred_line_id: "22222222-0000-0000-0000-000000000002", active: true, created_at: now, updated_at: now },
    { id: "33333333-0000-0000-0000-000000000005", sku: "P-HAA", name_ar: "خبز التوست", name_en: "Toast Bread", daily_demand: 420, margin_pct: 0.22, stability: 0.85, shelf_life_days: 7, moq: 100, strategic_weight: 6, stock_qty: 380, preferred_line_id: "22222222-0000-0000-0000-000000000001", active: true, created_at: now, updated_at: now },
  ]);
  // BOM
  await db().bom_items.bulkPut([
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.10 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000004", quantity_per_unit: 0.002 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000001", material_id: "11111111-0000-0000-0000-000000000005", quantity_per_unit: 0.003 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.12 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000002", quantity_per_unit: 0.05 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000002", material_id: "11111111-0000-0000-0000-000000000003", quantity_per_unit: 0.02 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000003", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.08 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000003", material_id: "11111111-0000-0000-0000-000000000002", quantity_per_unit: 0.06 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000003", material_id: "11111111-0000-0000-0000-000000000006", quantity_per_unit: 0.01 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000004", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.09 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000004", material_id: "11111111-0000-0000-0000-000000000002", quantity_per_unit: 0.03 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000005", material_id: "11111111-0000-0000-0000-000000000001", quantity_per_unit: 0.11 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000005", material_id: "11111111-0000-0000-0000-000000000007", quantity_per_unit: 0.008 },
    { id: crypto.randomUUID(), product_id: "33333333-0000-0000-0000-000000000005", material_id: "11111111-0000-0000-0000-000000000005", quantity_per_unit: 0.002 },
  ]);
  // Customers
  await db().customers.bulkPut([
    { id: "44444444-0000-0000-0000-000000000001", name_ar: "سوبرماركت النخيل", name_en: "Al-Nakheel Market", importance: 9, annual_value: 480000, churn_risk: 0.10, created_at: now },
    { id: "44444444-0000-0000-0000-000000000002", name_ar: "مطاعم الوجبة", name_en: "Al-Wajba Restaurants", importance: 8, annual_value: 210000, churn_risk: 0.18, created_at: now },
    { id: "44444444-0000-0000-0000-000000000003", name_ar: "فنادق الخليج", name_en: "Gulf Hotels", importance: 7, annual_value: 320000, churn_risk: 0.22, created_at: now },
    { id: "44444444-0000-0000-0000-000000000004", name_ar: "متاجر التوفير", name_en: "Al-Tawfeer Stores", importance: 6, annual_value: 95000, churn_risk: 0.30, created_at: now },
  ]);
  // Orders (due dates relative to today)
  const today = new Date();
  const offset = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };
  await db().orders.bulkPut([
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000001", product_id: "33333333-0000-0000-0000-000000000001", quantity: 2400, due_date: offset(2), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000001", product_id: "33333333-0000-0000-0000-000000000004", quantity: 800, due_date: offset(5), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000002", product_id: "33333333-0000-0000-0000-000000000002", quantity: 400, due_date: offset(3), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000002", product_id: "33333333-0000-0000-0000-000000000005", quantity: 600, due_date: offset(4), status: "in_progress", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000003", product_id: "33333333-0000-0000-0000-000000000003", quantity: 220, due_date: offset(6), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000003", product_id: "33333333-0000-0000-0000-000000000001", quantity: 1800, due_date: offset(3), status: "received", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000004", product_id: "33333333-0000-0000-0000-000000000004", quantity: 450, due_date: offset(8), status: "received", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000004", product_id: "33333333-0000-0000-0000-000000000002", quantity: 300, due_date: offset(10), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000001", product_id: "33333333-0000-0000-0000-000000000005", quantity: 700, due_date: offset(2), status: "approved", created_at: now, updated_at: now },
    { id: crypto.randomUUID(), customer_id: "44444444-0000-0000-0000-000000000002", product_id: "33333333-0000-0000-0000-000000000001", quantity: 900, due_date: offset(4), status: "reviewing", created_at: now, updated_at: now },
  ]);
  // Daily entries for the last 7 days for the 3 main products
  const entries: DailyEntry[] = [];
  const productLine: Array<[string, string]> = [
    ["33333333-0000-0000-0000-000000000001", "22222222-0000-0000-0000-000000000001"],
    ["33333333-0000-0000-0000-000000000002", "22222222-0000-0000-0000-000000000002"],
    ["33333333-0000-0000-0000-000000000005", "22222222-0000-0000-0000-000000000001"],
  ];
  const dailyNumbers: Array<[number, number]> = [
    [1150, 1180], [1170, 1170], [1190, 1160], [1210, 1150], [1230, 1140], [1250, 1130], [1270, 1120],
  ];
  for (let g = 0; g < 7; g++) {
    const d = new Date(today);
    d.setDate(d.getDate() - g);
    const ds = d.toISOString().slice(0, 10);
    for (let i = 0; i < productLine.length; i++) {
      const [pid, lid] = productLine[i]!;
      const [baseP, baseS] = dailyNumbers[g]!;
      const produced = baseP + i * 100 + g * 5;
      const shipped = baseS - i * 50 - g * 10;
      entries.push({
        id: crypto.randomUUID(),
        entry_date: ds,
        product_id: pid,
        line_id: lid,
        produced: Math.max(0, produced),
        shipped: Math.max(0, shipped),
        received_material_qty: 0,
        notes: null,
        entered_by: null,
        created_at: now,
      });
    }
  }
  await db().daily_entries.bulkPut(entries);
  // Objective settings singleton
  await db().objective_settings.put({
    id: 1, objective: "default", custom_weights: null,
    updated_at: now, updated_by: null,
  });
}
