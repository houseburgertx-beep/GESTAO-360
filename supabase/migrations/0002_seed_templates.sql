-- ============================================================================
-- BrassaOps — Seed de Templates Padrão para Hamburgueria
-- Execute após 0001_initial_schema.sql para iniciar já com rotinas profissionais
-- ============================================================================

DO $$
DECLARE
  v_store_id UUID;
  v_tpl_abertura UUID;
  v_tpl_temp UUID;
  v_tpl_5s UUID;
  v_tpl_fechamento UUID;
BEGIN
  INSERT INTO public.stores (name, brand_subtitle, daily_revenue_goal, monthly_revenue_goal, cmv_target_pct)
  VALUES ('Brassa Burger House', 'Hamburgueria Artesanal', 6800.00, 195000.00, 30.00)
  RETURNING id INTO v_store_id;

  -- Template 1: Abertura de Cozinha & Mise en Place
  INSERT INTO public.routine_templates (store_id, title, description, category, shift, station, recurrence, due_time, assigned_role)
  VALUES (v_store_id, 'Abertura de Cozinha & Mise en Place', 'Conferência completa de chapa, fritadeiras, carnes, pães e embalagens antes de abrir o delivery e salão.', 'opening', 'morning', 'Cozinha / Chapa', 'daily', '10:30:00', 'manager')
  RETURNING id INTO v_tpl_abertura;

  INSERT INTO public.routine_items (template_id, sort_order, label, input_type, photo_required, weight) VALUES
    (v_tpl_abertura, 1, 'Chapa pré-aquecida, raspada e untada (sem resíduos do dia anterior)', 'check', TRUE, 2),
    (v_tpl_abertura, 2, 'Óleo das fritadeiras filtrado, nível OK e coloração clara', 'check', TRUE, 2),
    (v_tpl_abertura, 3, 'Blends porcionados (160g e Smash 90g) conforme previsão do dia', 'check', FALSE, 2),
    (v_tpl_abertura, 4, 'Pães brioche conferidos (frescor, quantidade e ausência de mofo)', 'check', FALSE, 1),
    (v_tpl_abertura, 5, 'Molhos da casa, cebola caramelizada e bacon em cubas etiquetadas', 'check', FALSE, 2),
    (v_tpl_abertura, 6, 'KDS, impressoras térmicas e caixas de delivery abastecidos', 'check', FALSE, 1);

  -- Template 2: Temperaturas & Validades (PVPS / ANVISA)
  INSERT INTO public.routine_templates (store_id, title, description, category, shift, station, recurrence, due_time, assigned_role)
  VALUES (v_store_id, 'Temperaturas & Etiquetas PVPS', 'Auditoria de cadeia de frio e validades abertas na linha e câmara fria.', 'temperature_pvps', 'all', 'Câmara Fria & Linha', 'daily', '11:00:00', 'manager')
  RETURNING id INTO v_tpl_temp;

  INSERT INTO public.routine_items (template_id, sort_order, label, input_type, min_value, max_value, unit, photo_required, weight) VALUES
    (v_tpl_temp, 1, 'Temperatura Câmara Fria de Carnes', 'number_range', 0, 4, '°C', TRUE, 3),
    (v_tpl_temp, 2, 'Temperatura Freezer de Batatas / Congelados', 'number_range', -24, -15, '°C', FALSE, 2),
    (v_tpl_temp, 3, 'Temperatura Geladeira da Linha de Montagem', 'number_range', 1, 5, '°C', FALSE, 2),
    (v_tpl_temp, 4, 'Todos os insumos abertos estão com etiqueta de manipulação/validade (PVPS)', 'check', NULL, NULL, NULL, TRUE, 3);

  -- Template 3: Organização 5S da Loja
  INSERT INTO public.routine_templates (store_id, title, description, category, shift, station, recurrence, due_time, assigned_role)
  VALUES (v_store_id, 'Auditoria 5S & Padrão Visual da Loja', 'Ronda de organização, limpeza e apresentação antes do horário de pico.', '5s_cleaning', 'night', 'Salão + Cozinha', 'daily', '17:30:00', 'manager')
  RETURNING id INTO v_tpl_5s;

  INSERT INTO public.routine_items (template_id, sort_order, label, input_type, photo_required, weight) VALUES
    (v_tpl_5s, 1, 'Salão, mesas, luminárias e fachadas impecáveis', 'check', TRUE, 2),
    (v_tpl_5s, 2, 'Banheiros abastecidos (papel, sabonete) e higienizados', 'check', TRUE, 2),
    (v_tpl_5s, 3, 'Bancada de montagem e expedição delivery livres de bagunça', 'check', TRUE, 2),
    (v_tpl_5s, 4, 'Estoque seco organizado por categoria e nada encostado no chão', 'check', FALSE, 2),
    (v_tpl_5s, 5, 'Equipe uniformizada, touca/boné e sem adornos', 'check', FALSE, 2);

  -- Template 4: Fechamento & Segurança
  INSERT INTO public.routine_templates (store_id, title, description, category, shift, station, recurrence, due_time, assigned_role)
  VALUES (v_store_id, 'Fechamento de Loja, Caixa & Segurança', 'Checklist obrigatório para fechar o turno sem esquecer gás, limpeza, desperdícios ou caixa.', 'closing', 'night', 'Loja Geral', 'daily', '23:30:00', 'manager')
  RETURNING id INTO v_tpl_fechamento;

  INSERT INTO public.routine_items (template_id, sort_order, label, input_type, photo_required, weight) VALUES
    (v_tpl_fechamento, 1, 'Todos os desperdícios do turno registrados no app', 'check', FALSE, 2),
    (v_tpl_fechamento, 2, 'Contagem rápida dos críticos (blends, pães, batata, cheddar) lançada', 'check', FALSE, 2),
    (v_tpl_fechamento, 3, 'Chapa higienizada, coifa desligada e registro geral de gás GLP fechado', 'check', TRUE, 3),
    (v_tpl_fechamento, 4, 'Fechamento de caixa conferido no Takeat (dinheiro, PIX, maquininhas)', 'check', TRUE, 3),
    (v_tpl_fechamento, 5, 'Portas, geladeiras vedadas e alarme ativado', 'check', FALSE, 2);

  -- Equipamentos padrão da hamburgueria
  INSERT INTO public.equipments (store_id, name, area, model, preventive_interval_days, technician_name, technician_whatsapp) VALUES
    (v_store_id, 'Chapa Profissional 120cm (Gás)', 'Cozinha Quente', 'Vulcan 1200 Heavy', 15, 'Carlos Refrigeração & Gás', '5511999991111'),
    (v_store_id, 'Fritadeira Dupla 2x18L (Batatas)', 'Cozinha Quente', 'Skymsen FGA-36', 7, 'Carlos Refrigeração & Gás', '5511999991111'),
    (v_store_id, 'Coifa e Motor Exaustor Central', 'Cozinha Quente', 'InoxPro 2.5m', 15, 'LimpCoifa Serviços', '5511999992222'),
    (v_store_id, 'Câmara Fria de Carnes & Blends', 'Estoque Frio', 'FrigoMax 6m³', 30, 'GelTech Assistência', '5511999993333'),
    (v_store_id, 'Freezer Horizontal Batatas/Nuggets', 'Estoque Frio', 'Metalfrio DA550', 30, 'GelTech Assistência', '5511999993333'),
    (v_store_id, 'Geladeira Expositora de Bebidas', 'Salão / Bar', 'Imbera VR17', 30, 'GelTech Assistência', '5511999993333'),
    (v_store_id, 'Caixa de Gordura Principal', 'Área Externa', '500L Industrial', 30, 'Desentop Express', '5511999994444');
END $$;
