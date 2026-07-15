
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','manager','operator');
CREATE TYPE public.business_objective AS ENUM ('maximize_profit','maximize_service','reduce_inventory','protect_cash','default');
CREATE TYPE public.line_status AS ENUM ('running','setup','idle','broken','maintenance');
CREATE TYPE public.order_status AS ENUM ('received','reviewing','approved','in_progress','completed','cancelled');
CREATE TYPE public.recommendation_status AS ENUM ('pending','accepted','rejected','superseded');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  language text NOT NULL DEFAULT 'ar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self write" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Auto create profile + assign manager role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'manager');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ MATERIALS ============
CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  unit text NOT NULL,
  stock_qty numeric NOT NULL DEFAULT 0,
  reorder_point numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials auth all" ON public.materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PRODUCTION LINES ============
CREATE TABLE public.production_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  capacity_per_hour numeric NOT NULL DEFAULT 0,
  status line_status NOT NULL DEFAULT 'idle',
  quality_factor numeric NOT NULL DEFAULT 0.95,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_lines TO authenticated;
GRANT ALL ON public.production_lines TO service_role;
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lines auth all" ON public.production_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  daily_demand numeric NOT NULL DEFAULT 0,
  margin_pct numeric NOT NULL DEFAULT 0,
  stability numeric NOT NULL DEFAULT 0.8,
  shelf_life_days integer,
  moq numeric NOT NULL DEFAULT 1,
  strategic_weight integer NOT NULL DEFAULT 5,
  stock_qty numeric NOT NULL DEFAULT 0,
  preferred_line_id uuid REFERENCES public.production_lines(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products auth all" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ BOM ============
CREATE TABLE public.bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity_per_unit numeric NOT NULL,
  UNIQUE (product_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_items TO authenticated;
GRANT ALL ON public.bom_items TO service_role;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bom auth all" ON public.bom_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  importance integer NOT NULL DEFAULT 5,
  annual_value numeric NOT NULL DEFAULT 0,
  churn_risk numeric NOT NULL DEFAULT 0.1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers auth all" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  due_date date NOT NULL,
  status order_status NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders auth all" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ DAILY ENTRIES ============
CREATE TABLE public.daily_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.production_lines(id) ON DELETE SET NULL,
  produced numeric NOT NULL DEFAULT 0,
  shipped numeric NOT NULL DEFAULT 0,
  received_material_qty numeric NOT NULL DEFAULT 0,
  notes text,
  entered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_entries TO authenticated;
GRANT ALL ON public.daily_entries TO service_role;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily auth all" ON public.daily_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ OBJECTIVE (singleton) ============
CREATE TABLE public.objective_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  objective business_objective NOT NULL DEFAULT 'default',
  custom_weights jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objective_settings TO authenticated;
GRANT ALL ON public.objective_settings TO service_role;
ALTER TABLE public.objective_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objective auth all" ON public.objective_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.objective_settings (id, objective) VALUES (1, 'default');

-- ============ PPS SNAPSHOTS ============
CREATE TABLE public.pps_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  objective business_objective NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  pps numeric NOT NULL,
  components jsonb NOT NULL,
  constraint_status text NOT NULL DEFAULT 'ok',
  constraint_notes jsonb
);
CREATE INDEX ON public.pps_snapshots (run_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pps_snapshots TO authenticated;
GRANT ALL ON public.pps_snapshots TO service_role;
ALTER TABLE public.pps_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pps auth all" ON public.pps_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ RECOMMENDATIONS ============
CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action_ar text NOT NULL,
  action_en text NOT NULL,
  reason_ar text,
  reason_en text,
  impact jsonb,
  priority numeric,
  status recommendation_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reco auth all" ON public.recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ DECISION LOG ============
CREATE TABLE public.decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  action text NOT NULL,
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_log TO authenticated;
GRANT ALL ON public.decision_log TO service_role;
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log auth all" ON public.decision_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ SEED DATA ============
-- Materials
INSERT INTO public.materials (id, name_ar, name_en, unit, stock_qty, reorder_point, unit_cost, lead_time_days) VALUES
  ('11111111-0000-0000-0000-000000000001','دقيق قمح','Wheat Flour','kg', 1800, 500, 2.10, 4),
  ('11111111-0000-0000-0000-000000000002','سكر','Sugar','kg', 900, 300, 3.40, 3),
  ('11111111-0000-0000-0000-000000000003','زيت نباتي','Vegetable Oil','L', 400, 200, 6.80, 5),
  ('11111111-0000-0000-0000-000000000004','ملح','Salt','kg', 250, 80, 1.10, 2),
  ('11111111-0000-0000-0000-000000000005','خميرة','Yeast','kg', 60, 30, 12.00, 4),
  ('11111111-0000-0000-0000-000000000006','بيض','Eggs','tray', 220, 80, 18.50, 2),
  ('11111111-0000-0000-0000-000000000007','حليب مجفف','Milk Powder','kg', 180, 100, 22.00, 6),
  ('11111111-0000-0000-0000-000000000008','عبوات كرتونية','Cartons','pcs', 3500, 1000, 0.90, 7);

-- Lines
INSERT INTO public.production_lines (id, name_ar, name_en, capacity_per_hour, status, quality_factor) VALUES
  ('22222222-0000-0000-0000-000000000001','خط العجائن','Dough Line', 350, 'running', 0.96),
  ('22222222-0000-0000-0000-000000000002','خط الحلويات','Pastry Line', 220, 'running', 0.93),
  ('22222222-0000-0000-0000-000000000003','خط التغليف','Packaging Line', 800, 'idle', 0.98);

-- Products
INSERT INTO public.products (id, sku, name_ar, name_en, daily_demand, margin_pct, stability, shelf_life_days, moq, strategic_weight, stock_qty, preferred_line_id) VALUES
  ('33333333-0000-0000-0000-000000000001','P-ALEF','خبز عربي','Arabic Bread', 1200, 0.18, 0.92, 3, 200, 9, 900, '22222222-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000002','P-BAY','كعك بالسمسم','Sesame Cake', 300, 0.32, 0.75, 14, 100, 7, 260, '22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000003','P-JEEM','معمول تمر','Date Ma''amoul', 180, 0.42, 0.60, 30, 50, 8, 90, '22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000004','P-DAL','بسكويت سادة','Plain Biscuits', 500, 0.24, 0.88, 60, 200, 5, 1400, '22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000005','P-HAA','خبز التوست','Toast Bread', 420, 0.22, 0.85, 7, 100, 6, 380, '22222222-0000-0000-0000-000000000001');

-- BOM
INSERT INTO public.bom_items (product_id, material_id, quantity_per_unit) VALUES
  ('33333333-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001', 0.10),
  ('33333333-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004', 0.002),
  ('33333333-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000005', 0.003),
  ('33333333-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001', 0.12),
  ('33333333-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002', 0.05),
  ('33333333-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003', 0.02),
  ('33333333-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001', 0.08),
  ('33333333-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002', 0.06),
  ('33333333-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000006', 0.01),
  ('33333333-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001', 0.09),
  ('33333333-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000002', 0.03),
  ('33333333-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000001', 0.11),
  ('33333333-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000007', 0.008),
  ('33333333-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000005', 0.002);

-- Customers
INSERT INTO public.customers (id, name_ar, name_en, importance, annual_value, churn_risk) VALUES
  ('44444444-0000-0000-0000-000000000001','سوبرماركت النخيل','Al-Nakheel Market', 9, 480000, 0.10),
  ('44444444-0000-0000-0000-000000000002','مطاعم الوجبة','Al-Wajba Restaurants', 8, 210000, 0.18),
  ('44444444-0000-0000-0000-000000000003','فنادق الخليج','Gulf Hotels', 7, 320000, 0.22),
  ('44444444-0000-0000-0000-000000000004','متاجر التوفير','Al-Tawfeer Stores', 6, 95000, 0.30);

-- Orders (mixture of due dates from today +2 to +10)
INSERT INTO public.orders (customer_id, product_id, quantity, due_date, status) VALUES
  ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001', 2400, current_date + 2, 'approved'),
  ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000004', 800, current_date + 5, 'approved'),
  ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000002', 400, current_date + 3, 'approved'),
  ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000005', 600, current_date + 4, 'in_progress'),
  ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000003', 220, current_date + 6, 'approved'),
  ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000001', 1800, current_date + 3, 'received'),
  ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000004', 450, current_date + 8, 'received'),
  ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000002', 300, current_date + 10, 'approved'),
  ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000005', 700, current_date + 2, 'approved'),
  ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001', 900, current_date + 4, 'reviewing');

-- Daily entries — last 7 days for main products
INSERT INTO public.daily_entries (entry_date, product_id, line_id, produced, shipped)
SELECT (current_date - g)::date, '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1150 + (g*20), 1180 - (g*10) FROM generate_series(0,6) g;
INSERT INTO public.daily_entries (entry_date, product_id, line_id, produced, shipped)
SELECT (current_date - g)::date, '33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 280 + g*5, 300 - g*3 FROM generate_series(0,6) g;
INSERT INTO public.daily_entries (entry_date, product_id, line_id, produced, shipped)
SELECT (current_date - g)::date, '33333333-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000001', 400 + g*4, 420 - g*2 FROM generate_series(0,6) g;
