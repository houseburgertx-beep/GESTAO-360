-- ============================================================================
-- BrassaOps — Schema Completo PostgreSQL (Supabase + RLS + Storage)
-- Sistema Mobile-First de Gestão de Hamburgueria conectado à API Takeat
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. NÚCLEO DA LOJA, PERFIS & CONEXÃO TAKEAT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand_subtitle TEXT DEFAULT 'Hamburgueria Artesanal',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  daily_revenue_goal NUMERIC(12,2) NOT NULL DEFAULT 6500.00,
  monthly_revenue_goal NUMERIC(12,2) NOT NULL DEFAULT 185000.00,
  cmv_target_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  waste_target_pct NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  kds_target_seconds INTEGER NOT NULL DEFAULT 600,
  min_5s_score INTEGER NOT NULL DEFAULT 90,
  late_escalation_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE public.user_role AS ENUM ('owner', 'manager', 'staff');

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'staff',
  station TEXT DEFAULT 'Geral',
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela estritamente server-side (RLS bloqueia acesso direto pelo navegador)
CREATE TABLE IF NOT EXISTS public.takeat_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'demo' CHECK (mode IN ('demo', 'live')),
  restaurant_id INTEGER,
  restaurant_name TEXT,
  scopes TEXT,
  encrypted_refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'reauthorize_required', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.takeat_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'conflict_409', 'error')),
  records_synced INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. ROTINAS, CHECKLISTS, TEMPERATURAS/PVPS & ORGANIZAÇÃO 5S
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.routine_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('opening', 'pre_service', 'operation', 'closing', '5s_cleaning', 'temperature_pvps', 'periodic')),
  shift TEXT NOT NULL DEFAULT 'all' CHECK (shift IN ('morning', 'night', 'all')),
  station TEXT NOT NULL DEFAULT 'Loja Geral',
  recurrence TEXT NOT NULL DEFAULT 'daily' CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly')),
  recurrence_days INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6], -- 0=Dom ... 6=Sáb ou dia do mês (1-31)
  due_time TIME NOT NULL DEFAULT '10:00:00',
  grace_minutes INTEGER NOT NULL DEFAULT 30,
  assigned_role public.user_role NOT NULL DEFAULT 'manager',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.routine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.routine_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  instructions TEXT,
  input_type TEXT NOT NULL DEFAULT 'check' CHECK (input_type IN ('check', 'number_range', 'text', 'photo')),
  min_value NUMERIC(10,2),
  max_value NUMERIC(10,2),
  unit TEXT,
  photo_required BOOLEAN NOT NULL DEFAULT FALSE,
  weight INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.routine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.routine_templates(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'late')),
  score_pct NUMERIC(5,2),
  completed_by UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (template_id, run_date)
);

CREATE TABLE IF NOT EXISTS public.routine_run_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.routine_runs(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.routine_items(id) ON DELETE CASCADE,
  checked BOOLEAN DEFAULT FALSE,
  numeric_value NUMERIC(10,2),
  text_value TEXT,
  photo_url TEXT,
  is_non_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  answered_by UUID REFERENCES public.profiles(id),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, item_id)
);

-- ----------------------------------------------------------------------------
-- 3. FORNECEDORES, ESTOQUE TAKEAT, DESPERDÍCIO, CONTAGENS & COMPRAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  whatsapp TEXT,
  contact_name TEXT,
  cnpj TEXT,
  delivery_days TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.takeat_inventory_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  takeat_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'intermediary')),
  name TEXT NOT NULL,
  unidade TEXT NOT NULL,
  quantidade NUMERIC(18,6) NOT NULL DEFAULT 0,
  minimum_stock NUMERIC(18,6),
  ideal_stock NUMERIC(18,6),
  unitary_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_version TEXT NOT NULL DEFAULT '0',
  is_master BOOLEAN NOT NULL DEFAULT FALSE,
  is_multistore BOOLEAN NOT NULL DEFAULT FALSE,
  yield NUMERIC(12,2),
  recipe TEXT,
  storage_area TEXT NOT NULL DEFAULT 'Estoque Seco',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, kind, takeat_id)
);

CREATE TABLE IF NOT EXISTS public.waste_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.takeat_inventory_cache(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost_snapshot, 2)) STORED,
  reason TEXT NOT NULL CHECK (reason IN ('burn_prep_error', 'expired_pvps', 'dropped_damaged', 'supplier_quality', 'staff_meal_comp', 'closing_leftover')),
  shift TEXT NOT NULL DEFAULT 'night' CHECK (shift IN ('morning', 'night')),
  notes TEXT,
  photo_url TEXT,
  logged_by UUID REFERENCES public.profiles(id),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_count_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'critical' CHECK (scope IN ('critical', 'area', 'full')),
  blind_mode BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'synced', 'conflict_409', 'error')),
  idempotency_key TEXT NOT NULL UNIQUE,
  total_divergence_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_by UUID REFERENCES public.profiles(id),
  counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.takeat_inventory_cache(id) ON DELETE CASCADE,
  takeat_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'intermediary')),
  theoretical_qty NUMERIC(18,6) NOT NULL,
  counted_qty NUMERIC(18,6) NOT NULL,
  registered_waste_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  invisible_divergence_qty NUMERIC(18,6) NOT NULL DEFAULT 0,
  invisible_divergence_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_stock_version TEXT NOT NULL,
  new_stock_version TEXT,
  takeat_count_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict_409', 'error')),
  conflict_message TEXT
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent_whatsapp', 'received', 'received_with_issue', 'canceled')),
  total_estimated NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_invoiced NUMERIC(12,2),
  takeat_nfe_id INTEGER,
  nfe_access_key TEXT,
  delivery_temperature_c NUMERIC(5,2),
  receiving_notes TEXT,
  receiving_photo_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES public.takeat_inventory_cache(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  suggested_qty NUMERIC(14,4) NOT NULL,
  ordered_qty NUMERIC(14,4) NOT NULL,
  received_qty NUMERIC(14,4),
  last_unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoiced_unit_price NUMERIC(12,2),
  price_variation_pct NUMERIC(6,2)
);

CREATE TABLE IF NOT EXISTS public.unit_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.takeat_inventory_cache(id) ON DELETE CASCADE,
  unit_price NUMERIC(12,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'takeat_nfe',
  takeat_nfe_id INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. MANUTENÇÃO, OCORRÊNCIAS, PASSAGEM DE TURNO & PLANOS DE AÇÃO (5W2H)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'attention', 'down')),
  preventive_interval_days INTEGER NOT NULL DEFAULT 30,
  last_maintenance_at DATE,
  next_maintenance_at DATE,
  technician_name TEXT,
  technician_whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('preventive', 'corrective')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('stopped_operation', 'urgent', 'normal')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_parts', 'done')),
  title TEXT NOT NULL,
  description TEXT,
  photo_before_url TEXT,
  photo_after_url TEXT,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  opened_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shift_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_shift TEXT NOT NULL CHECK (from_shift IN ('morning', 'night')),
  summary TEXT NOT NULL,
  pending_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  cash_ok BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id),
  acknowledged_by UUID REFERENCES public.profiles(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('team', 'customer', 'supplier', 'delivery', 'equipment', 'food_safety', 'cashier', 'other')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT 'night',
  photo_url TEXT,
  routine_run_id UUID REFERENCES public.routine_runs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  why_reason TEXT,
  how_steps TEXT,
  origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('manual', 'incident', 'checklist', 'waste', 'cmv', 'maintenance')),
  origin_id UUID,
  owner_profile_id UUID REFERENCES public.profiles(id),
  owner_name TEXT,
  due_date DATE NOT NULL,
  estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  evidence_photo_url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. SNAPSHOTS EXECUTIVOS (FATURAMENTO, CMV REAL × TEÓRICO, KDS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kpi_date DATE NOT NULL,
  revenue_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  avg_ticket NUMERIC(10,2) NOT NULL DEFAULT 0,
  cancellations_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  theoretical_cmv_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  waste_total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  kds_avg_prep_seconds INTEGER NOT NULL DEFAULT 0,
  score_5s_pct NUMERIC(5,2),
  channels_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  payments_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, kpi_date)
);

CREATE TABLE IF NOT EXISTS public.cmv_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  opening_stock_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchases_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_stock_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  theoretical_cmv_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  registered_waste_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  cancellations_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. ÍNDICES DE PERFORMANCE
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_routine_runs_store_date ON public.routine_runs(store_id, run_date);
CREATE INDEX IF NOT EXISTS idx_inventory_store_area ON public.takeat_inventory_cache(store_id, storage_area);
CREATE INDEX IF NOT EXISTS idx_waste_logs_store_date ON public.waste_logs(store_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_store_status ON public.incidents(store_id, status);
CREATE INDEX IF NOT EXISTS idx_action_plans_store_status ON public.action_plans(store_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_store_status ON public.maintenance_tasks(store_id, status);

-- ----------------------------------------------------------------------------
-- 7. FUNÇÕES HELPER & ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_store_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Habilita RLS em todas as tabelas
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeat_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeat_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_run_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeat_inventory_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmv_periods ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso por loja e perfil
CREATE POLICY "store_read_members" ON public.stores
  FOR SELECT USING (id = public.current_user_store_id());
CREATE POLICY "store_update_owner" ON public.stores
  FOR UPDATE USING (id = public.current_user_store_id() AND public.current_user_role() = 'owner');

CREATE POLICY "profiles_read_store" ON public.profiles
  FOR SELECT USING (store_id = public.current_user_store_id());
CREATE POLICY "profiles_manage_owner" ON public.profiles
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() = 'owner');

-- takeat_connections: ZERO acesso via client; apenas service_role no backend
CREATE POLICY "takeat_connections_deny_client" ON public.takeat_connections
  FOR ALL USING (FALSE);

-- Operação diária (acessível por toda a equipe autenticada da loja)
CREATE POLICY "routines_store_access" ON public.routine_templates
  FOR SELECT USING (store_id = public.current_user_store_id());
CREATE POLICY "routines_manage_mgr_owner" ON public.routine_templates
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));

CREATE POLICY "routine_runs_store_access" ON public.routine_runs
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "routine_answers_store_access" ON public.routine_run_answers
  FOR ALL USING (EXISTS (SELECT 1 FROM public.routine_runs r WHERE r.id = run_id AND r.store_id = public.current_user_store_id()));

CREATE POLICY "inventory_store_read" ON public.takeat_inventory_cache
  FOR SELECT USING (store_id = public.current_user_store_id());
CREATE POLICY "waste_logs_store_all" ON public.waste_logs
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "stock_counts_store_all" ON public.stock_count_sessions
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "stock_count_items_store_all" ON public.stock_count_items
  FOR ALL USING (EXISTS (SELECT 1 FROM public.stock_count_sessions s WHERE s.id = session_id AND s.store_id = public.current_user_store_id()));

CREATE POLICY "suppliers_mgr_owner" ON public.suppliers
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "purchase_orders_mgr_owner" ON public.purchase_orders
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "purchase_items_mgr_owner" ON public.purchase_order_items
  FOR ALL USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = order_id AND po.store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager')));

CREATE POLICY "equipments_store_read" ON public.equipments
  FOR SELECT USING (store_id = public.current_user_store_id());
CREATE POLICY "equipments_mgr_owner_write" ON public.equipments
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));

CREATE POLICY "maintenance_store_all" ON public.maintenance_tasks
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "incidents_store_all" ON public.incidents
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "handovers_store_all" ON public.shift_handovers
  FOR ALL USING (store_id = public.current_user_store_id());
CREATE POLICY "action_plans_store_all" ON public.action_plans
  FOR ALL USING (store_id = public.current_user_store_id());

-- Indicadores financeiros e CMV: somente Dono e Gerente (bloqueado para staff)
CREATE POLICY "kpis_mgr_owner_only" ON public.daily_kpi_snapshots
  FOR SELECT USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "cmv_owner_mgr_only" ON public.cmv_periods
  FOR ALL USING (store_id = public.current_user_store_id() AND public.current_user_role() IN ('owner', 'manager'));

-- ----------------------------------------------------------------------------
-- 8. BUCKET DE STORAGE PARA FOTOS DE EVIDÊNCIA (PRIVADO)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence-photos', 'evidence-photos', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "evidence_photos_store_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'evidence-photos' AND auth.role() = 'authenticated');
CREATE POLICY "evidence_photos_store_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'evidence-photos' AND auth.role() = 'authenticated');
