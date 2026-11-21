import { takeatClient } from "./client";
import type { TakeatCashFlowEntry, TakeatManagedInventoryStock, TakeatReceivedNfe } from "./types";
import type {
  AppState,
  FinancialCashFlow,
  InventoryItem,
  KdsSnapshot,
  RatingsSnapshot,
  ReceivedNfe,
  RevenueAndCmvSnapshot,
  Supplier,
  TakeatMenuProduct,
} from "@/types/domain";
import { generateId } from "@/lib/utils";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getSaoPauloDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function inferStorageArea(name: string, kind: "input" | "intermediary"): InventoryItem["storageArea"] {
  if (kind === "intermediary") return "Linha de Montagem";
  const upper = name.toUpperCase();
  if (/EMBALA|SACO|SACOLA|CAIXA|COPO|GUARDANAPO|PAPEL|CANUDO|POTE|TAMPA|ETIQUETA|BOBINA/.test(upper)) {
    return "Embalagens";
  }
  if (/REFRI|COCA|GUARANA|GUARANÁ|CERVEJA|HEINEKEN|SPRITE|FANTA|CHOPP|H2O|SCHWEPPES|ENERGETIC|AGUA|ÁGUA|SUCO/.test(upper)) {
    return "Bebidas";
  }
  if (/BATATA|SORVETE|CONGEL|POLPA|NUGGET|ONION|GELO/.test(upper)) {
    return "Freezer";
  }
  if (
    /CARNE|BLEND|HAMBUR|BACON|QUEIJO|CHEDDAR|MUSSARELA|CATUPIRY|CREAM|CALABRESA|FRANGO|LINGUI|OVO|MANTEIGA|REQUEIJ|LEITE|CREME|PRESUNTO|PEPERONI|PEPPERONI|TOMATE|ALFACE|CEBOLA|PICLES|RUCULA|RÚCULA|MAIONESE/.test(
      upper
    )
  ) {
    return "Câmara Fria";
  }
  return "Estoque Seco";
}

function parseSpedNfeItems(
  nfe: TakeatReceivedNfe & { fiscal?: { sped?: { body?: string | null } | null } },
  inventoryByTakeatId: Map<number, InventoryItem>
): ReceivedNfe["items"] {
  const spedBody = nfe.fiscal?.sped?.body;
  if (!spedBody) return [];

  const items: ReceivedNfe["items"] = [];
  for (const line of spedBody.split("\n")) {
    if (!line.startsWith("|C170|")) continue;
    const cols = line.split("|");
    // |C170|num_item|cod_item|descr_compl|qtd|unid|vl_item|...
    const takeatId = Number(cols[3]);
    const qty = Number(String(cols[5] || "0").replace(",", ".")) || 0;
    const totalVal = Number(String(cols[7] || "0").replace(",", ".")) || 0;
    if (!qty || !totalVal) continue;
    const matchedInv = Number.isFinite(takeatId) ? inventoryByTakeatId.get(takeatId) : undefined;
    const unitPrice = round2(totalVal / qty);
    items.push({
      name: matchedInv?.name || (cols[4] ? cols[4] : `Item Takeat #${cols[3] || "C170"}`),
      inventoryItemId: matchedInv?.id,
      quantity: qty,
      unit: matchedInv?.unit || "un",
      invoicedUnitPrice: unitPrice,
      previousUnitPrice: matchedInv?.unitaryPrice || unitPrice,
    });
  }
  return items;
}

export interface LiveSyncResult {
  nextState: AppState;
  summary: {
    inputsCount: number;
    intermediariesCount: number;
    productsCount: number;
    nfesCount: number;
    cashFlowsCount: number;
    monthRevenue: number;
  };
}

/**
 * Consulta a API Oficial da Takeat (https://public-api.takeat.app) em tempo real
 * e atualiza todo o estado operacional da loja sem dados fictícios.
 */
export async function syncLiveTakeatIntoState(prevState: AppState): Promise<LiveSyncResult> {
  const now = new Date();
  const syncedAt = now.toISOString();
  const today = getSaoPauloDateString(now);
  const startMonth = `${today.slice(0, 8)}01`;
  const start85d = getSaoPauloDateString(new Date(now.getTime() - 85 * 86_400_000));
  const start85dIso = `${start85d}T00:00:00`;
  const endTodayIso = `${today}T23:59:59`;

  const [
    restaurantsRes,
    inputsRes,
    intermediariesRes,
    categoriesRes,
    nfesPendRes,
    nfesDoneRes,
    cashFlowsRes,
    paySummaryRes,
    payChannelsRes,
    payMethodsRes,
    periodProductsRes,
    cancellationsRes,
    realtimeRes,
    ratingsRes,
    kdsRes,
    cashRegRes,
  ] = await Promise.allSettled([
    takeatClient.listRestaurants(),
    takeatClient.listInputs(),
    takeatClient.listIntermediaries(),
    takeatClient.listProductCategories(),
    takeatClient.listReceivedNfes(start85dIso, endTodayIso, true),
    takeatClient.listReceivedNfes(start85dIso, endTodayIso, false),
    takeatClient.listCashFlows(startMonth, today),
    takeatClient.getPaymentsSummary(startMonth, today),
    takeatClient.getPaymentsChannels(startMonth, today),
    takeatClient.getPaymentsMethods(startMonth, today),
    takeatClient.getPeriodProducts(startMonth, today),
    takeatClient.getPeriodCancellations(startMonth, today),
    takeatClient.getRealtimeToday(),
    takeatClient.getRatings(startMonth, today),
    takeatClient.getKdsOverview(startMonth, today),
    takeatClient.listCashRegisters(),
  ]);

  if (restaurantsRes.status === "rejected" && inputsRes.status === "rejected") {
    throw restaurantsRes.reason instanceof Error
      ? restaurantsRes.reason
      : new Error("Não foi possível autenticar nem consultar a API Takeat.");
  }

  // 1) Loja
  const restaurants = restaurantsRes.status === "fulfilled" ? restaurantsRes.value : [];
  const primaryRestaurant = restaurants[0];
  const restaurantId =
    Number(primaryRestaurant?.id) || prevState.store.takeatRestaurantId || 97686;
  const restaurantName =
    primaryRestaurant?.fantasy_name || prevState.store.name || "House 190 Eunápolis";

  // 2) Estoque (Insumos + Intermediários)
  const prevInvMap = new Map(prevState.inventory.map((item) => [item.id, item]));
  const mapTakeatStock = (
    raw: TakeatManagedInventoryStock,
    kind: "input" | "intermediary"
  ): InventoryItem => {
    const id = kind === "input" ? `tk_input_${raw.id}` : `tk_int_${raw.id}`;
    const existing = prevInvMap.get(id);
    const unitPrice = Number(raw.unitary_price) || 0;
    const quantity = Number(raw.quantidade) || 0;
    const minFromApi = Number(raw.minimum_stock) || 0;
    const idealFromApi = Number(raw.ideal_stock) || 0;

    return {
      id,
      takeatId: raw.id,
      kind,
      name: raw.name.trim(),
      unit: (raw.unidade || "un").toLowerCase(),
      quantity,
      minimumStock: existing && existing.minimumStock > 0 ? existing.minimumStock : minFromApi,
      idealStock: existing && existing.idealStock > 0 ? existing.idealStock : idealFromApi,
      unitaryPrice: unitPrice,
      previousUnitPrice:
        existing && existing.unitaryPrice > 0 && Math.abs(existing.unitaryPrice - unitPrice) > 0.001
          ? existing.unitaryPrice
          : existing?.previousUnitPrice ?? unitPrice,
      stockVersion: String(raw.stock_version ?? "0"),
      storageArea: existing?.storageArea || inferStorageArea(raw.name, kind),
      supplierId: existing?.supplierId || "",
      isCritical:
        existing?.isCritical ??
        (unitPrice > 0 || quantity < 0 || minFromApi > 0 || kind === "intermediary"),
      yield: raw.yield ? Number(raw.yield) || null : null,
      recipe: raw.recipe || null,
      linkedMenuProductIds: existing?.linkedMenuProductIds || [],
    };
  };

  const rawInputs = inputsRes.status === "fulfilled" ? inputsRes.value.items : [];
  const rawIntermediaries =
    intermediariesRes.status === "fulfilled" ? intermediariesRes.value.items : [];

  const invDedup = new Map<string, InventoryItem>();
  for (const r of rawInputs) {
    const mapped = mapTakeatStock(r, "input");
    invDedup.set(mapped.id, mapped);
  }
  for (const r of rawIntermediaries) {
    const mapped = mapTakeatStock(r, "intermediary");
    invDedup.set(mapped.id, mapped);
  }

  const inventory: InventoryItem[] = [...invDedup.values()].sort((a, b) => {
    const aActive = a.stockVersion !== "0" || a.unitaryPrice > 0 || a.quantity !== 0 ? 0 : 1;
    const bActive = b.stockVersion !== "0" || b.unitaryPrice > 0 || b.quantity !== 0 ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const inventoryByTakeatId = new Map<number, InventoryItem>();
  for (const inv of inventory) {
    inventoryByTakeatId.set(inv.takeatId, inv);
  }

  // 3) Cardápio + Curva ABC + Vendas de Produtos
  interface PeriodProductRow {
    product_id: number;
    product_name?: string;
    units_sold_count?: number;
    total_revenue?: number;
    total_expense?: number;
    current_cmv?: number;
    current_price?: number;
    current_delivery_price?: number;
  }

  const periodProductsRaw =
    periodProductsRes.status === "fulfilled"
      ? ((periodProductsRes.value?.data as { products?: PeriodProductRow[] } | undefined)?.products || [])
      : [];

  const periodProdById = new Map<number, PeriodProductRow>();
  for (const row of periodProductsRaw) {
    periodProdById.set(row.product_id, row);
  }

  const realtimeProdList =
    realtimeRes.status === "fulfilled"
      ? ((realtimeRes.value?.data as { products?: { product_id: number; units_sold_count?: number }[] } | undefined)
          ?.products || [])
      : [];
  const realtimeProdById = new Map(realtimeProdList.map((p) => [p.product_id, p]));

  const categories = categoriesRes.status === "fulfilled" ? categoriesRes.value : [];
  const menuDedup = new Map<number, Omit<TakeatMenuProduct, "abcClass"> & { monthRev: number }>();

  for (const cat of categories) {
    for (const p of cat.products || []) {
      if (menuDedup.has(p.id)) continue;
      const stats = periodProdById.get(p.id);
      const rt = realtimeProdById.get(p.id);
      const price = Number(p.price) || Number(stats?.current_price) || 0;
      const deliveryPrice = Number(p.delivery_price) || price;
      const soldMonth = Number(stats?.units_sold_count) || 0;
      const monthRev = Number(stats?.total_revenue) || soldMonth * price;

      menuDedup.set(p.id, {
        id: p.id,
        name: p.name.trim(),
        category: cat.name.trim(),
        price,
        deliveryPrice,
        technicalSheetCost: Number(stats?.current_cmv) || 0,
        soldToday: Number(rt?.units_sold_count) || 0,
        soldMonth,
        available: Boolean(p.available),
        availableInDelivery: Boolean(p.available_in_delivery),
        monthRev,
      });
    }
  }

  // Adiciona eventuais itens vendidos no relatório que não estejam mais visíveis na árvore principal
  for (const stats of periodProductsRaw) {
    if (menuDedup.has(stats.product_id)) continue;
    const rt = realtimeProdById.get(stats.product_id);
    menuDedup.set(stats.product_id, {
      id: stats.product_id,
      name: (stats.product_name || `Produto #${stats.product_id}`).trim(),
      category: "Catálogo Takeat",
      price: Number(stats.current_price) || 0,
      deliveryPrice: Number(stats.current_delivery_price) || Number(stats.current_price) || 0,
      technicalSheetCost: Number(stats.current_cmv) || 0,
      soldToday: Number(rt?.units_sold_count) || 0,
      soldMonth: Number(stats.units_sold_count) || 0,
      available: true,
      availableInDelivery: true,
      monthRev: Number(stats.total_revenue) || 0,
    });
  }

  const sortedMenuBase = [...menuDedup.values()].sort(
    (a, b) => b.monthRev - a.monthRev || b.soldMonth - a.soldMonth || a.name.localeCompare(b.name, "pt-BR")
  );
  const totalMenuRev = sortedMenuBase.reduce((acc, item) => acc + item.monthRev, 0);
  let cumulativeRev = 0;

  const menuProducts: TakeatMenuProduct[] = sortedMenuBase.map(({ monthRev, ...prod }) => {
    cumulativeRev += monthRev;
    const share = totalMenuRev > 0 ? cumulativeRev / totalMenuRev : 1;
    const abcClass: TakeatMenuProduct["abcClass"] =
      monthRev <= 0 ? "C" : share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
    return { ...prod, abcClass };
  });

  // 4) NF-e Recebidas (85 dias)
  const prevNfeMap = new Map(prevState.receivedNfes.map((n) => [n.id, n]));
  const rawNfes = [
    ...(nfesPendRes.status === "fulfilled" && Array.isArray(nfesPendRes.value) ? nfesPendRes.value : []),
    ...(nfesDoneRes.status === "fulfilled" && Array.isArray(nfesDoneRes.value) ? nfesDoneRes.value : []),
  ];
  const nfeDedup = new Map<number, ReceivedNfe>();
  for (const raw of rawNfes) {
    if (nfeDedup.has(raw.id)) continue;
    const prevNfe = prevNfeMap.get(raw.id);
    const manType = raw.manifestation?.type;
    const manifestation: ReceivedNfe["manifestation"] =
      manType === "confirmacao" ? "confirmacao" : manType === "ciencia" ? "ciencia" : "pendente";

    const parsedItems = parseSpedNfeItems(
      raw as TakeatReceivedNfe & { fiscal?: { sped?: { body?: string | null } | null } },
      inventoryByTakeatId
    );

    nfeDedup.set(raw.id, {
      id: raw.id,
      number: raw.identification?.number || String(raw.id),
      issuerName: raw.issuer?.name || "Fornecedor",
      issuerCnpj: raw.issuer?.document || "",
      issuedAt: raw.timestamps?.issued_at || raw.timestamps?.created_at || syncedAt,
      totalAmount: Number(raw.amounts?.total) || 0,
      manifestation,
      checkedAtReceiving: prevNfe?.checkedAtReceiving || manifestation === "confirmacao",
      receivingTemperatureC: prevNfe?.receivingTemperatureC,
      receivingNotes: prevNfe?.receivingNotes,
      items: parsedItems.length > 0 ? parsedItems : prevNfe?.items || [],
    });
  }
  const receivedNfes = [...nfeDedup.values()].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  );

  // 5) Financeiro (Contas a Pagar / Fluxo de Caixa)
  const rawCashFlows: TakeatCashFlowEntry[] =
    cashFlowsRes.status === "fulfilled" ? cashFlowsRes.value.items : prevState.cashFlows.map((c) => ({
      id: c.id,
      entry_type: "standalone",
      counts_for_result: true,
      description: c.description,
      information: null,
      value: String(c.value),
      is_earning: c.isEarning,
      paid: c.paid,
      due_date: c.dueDate,
      competence_date: c.dueDate,
      paid_at: null,
      created_at: c.dueDate,
      category: c.category,
      provider: { name: c.providerName },
    }));

  const cashFlows: FinancialCashFlow[] = rawCashFlows
    .map((cf) => ({
      id: cf.id,
      description: (cf.description || cf.category || `Lançamento #${cf.id}`).trim(),
      category: (cf.category || "Geral").trim(),
      providerName: (cf.provider?.name || "Sem fornecedor").trim(),
      value: Number(cf.value) || 0,
      isEarning: Boolean(cf.is_earning),
      paid: Boolean(cf.paid),
      dueDate: cf.due_date || today,
    }))
    .sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  // 6) Fornecedores reais extraídos do Fluxo de Caixa e NF-es
  const prevSupplierById = new Map(prevState.suppliers.map((s) => [s.id, s]));
  const prevSupplierByName = new Map(prevState.suppliers.map((s) => [s.name.toUpperCase(), s]));
  const supplierMap = new Map<string, Supplier>();

  for (const cf of rawCashFlows) {
    const name = cf.provider?.name?.trim();
    if (!name) continue;
    const id = cf.provider?.id ? `tk_prov_${cf.provider.id}` : `tk_prov_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const existing = prevSupplierById.get(id) || prevSupplierByName.get(name.toUpperCase());
    if (!supplierMap.has(id)) {
      supplierMap.set(id, {
        id,
        name,
        category: cf.category || existing?.category || "Fornecedor",
        whatsapp: existing?.whatsapp || "",
        contactName: existing?.contactName || name.split(" ")[0] || "Comercial",
        deliveryDays: existing?.deliveryDays || "Conforme pedido",
      });
    }
  }
  for (const nfe of receivedNfes) {
    const name = nfe.issuerName?.trim();
    if (!name) continue;
    const existingByName = prevSupplierByName.get(name.toUpperCase());
    const id = existingByName?.id || `tk_nfe_prov_${(nfe.issuerCnpj || name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    if (!supplierMap.has(id) && ![...supplierMap.values()].some((s) => s.name.toUpperCase() === name.toUpperCase())) {
      supplierMap.set(id, {
        id,
        name,
        category: existingByName?.category || "NF-e Fornecedor",
        whatsapp: existingByName?.whatsapp || "",
        contactName: existingByName?.contactName || "Comercial",
        deliveryDays: existingByName?.deliveryDays || "Conforme NF-e",
      });
    }
  }
  const suppliers = [...supplierMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  // 7) Faturamento, Canais, Meios de Pagamento, Cancelamentos & CMV Real x Teórico
  interface PaySummaryRecord {
    date: string;
    gross_revenue?: number;
    session_count?: number;
    cancelled_session_count?: number;
    average_ticket?: number;
  }
  const summaryRecords =
    paySummaryRes.status === "fulfilled"
      ? ((paySummaryRes.value?.data as { records?: PaySummaryRecord[] } | undefined)?.records || [])
      : [];

  const monthRevenue = round2(
    summaryRecords.reduce((acc, r) => acc + (Number(r.gross_revenue) || 0), 0)
  );
  const monthOrders = summaryRecords.reduce((acc, r) => acc + (Number(r.session_count) || 0), 0);

  const todayRecord = summaryRecords.find((r) => r.date === today);
  const nonZeroDays = summaryRecords.filter((r) => (Number(r.gross_revenue) || 0) > 1);
  const latestActiveDay = nonZeroDays[nonZeroDays.length - 1];
  const displayDayRecord =
    todayRecord && (Number(todayRecord.gross_revenue) || 0) > 1 ? todayRecord : latestActiveDay || todayRecord;

  const todayRevenue = round2(Number(displayDayRecord?.gross_revenue) || 0);
  const todayOrders = Number(displayDayRecord?.session_count) || 0;
  const todayAvgTicket = round2(
    Number(displayDayRecord?.average_ticket) || (todayOrders > 0 ? todayRevenue / todayOrders : 0)
  );

  interface PayChannelRecord {
    channel_group?: string;
    gross_revenue?: number;
  }
  const channelRecords =
    payChannelsRes.status === "fulfilled"
      ? ((payChannelsRes.value?.data as { records?: PayChannelRecord[] } | undefined)?.records || [])
      : [];

  const channelTotals = new Map<"presencial" | "delivery_takeat" | "marketplaces", number>([
    ["presencial", 0],
    ["delivery_takeat", 0],
    ["marketplaces", 0],
  ]);

  for (const rec of channelRecords) {
    const rev = Number(rec.gross_revenue) || 0;
    const rawGroup = (rec.channel_group || "").toLowerCase();
    if (rawGroup.includes("market")) {
      channelTotals.set("marketplaces", (channelTotals.get("marketplaces") || 0) + rev);
    } else if (rawGroup.includes("deliv")) {
      channelTotals.set("delivery_takeat", (channelTotals.get("delivery_takeat") || 0) + rev);
    } else {
      channelTotals.set("presencial", (channelTotals.get("presencial") || 0) + rev);
    }
  }

  const totalChannelsRev = [...channelTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const channels: RevenueAndCmvSnapshot["channels"] = [
    {
      name: "Presencial / Salão",
      group: "presencial",
      value: round2(channelTotals.get("presencial") || 0),
      pct: Math.round(((channelTotals.get("presencial") || 0) / totalChannelsRev) * 100),
    },
    {
      name: "Delivery Próprio (Takeat)",
      group: "delivery_takeat",
      value: round2(channelTotals.get("delivery_takeat") || 0),
      pct: Math.round(((channelTotals.get("delivery_takeat") || 0) / totalChannelsRev) * 100),
    },
    {
      name: "Marketplaces (iFood)",
      group: "marketplaces",
      value: round2(channelTotals.get("marketplaces") || 0),
      pct: Math.round(((channelTotals.get("marketplaces") || 0) / totalChannelsRev) * 100),
    },
  ];

  interface PayMethodRecord {
    payment_method_name?: string;
    payment_method_slug?: string;
    gross_revenue?: number;
  }
  const methodRecords =
    payMethodsRes.status === "fulfilled"
      ? ((payMethodsRes.value?.data as { records?: PayMethodRecord[] } | undefined)?.records || [])
      : [];

  const methodTotals = new Map<string, number>();
  for (const m of methodRecords) {
    const label = (m.payment_method_name || m.payment_method_slug || "Outros").trim();
    methodTotals.set(label, (methodTotals.get(label) || 0) + (Number(m.gross_revenue) || 0));
  }
  const totalMethodsRev = [...methodTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const paymentMethods: RevenueAndCmvSnapshot["paymentMethods"] = [...methodTotals.entries()]
    .map(([name, val]) => ({
      name,
      value: round2(val),
      pct: Math.round((val / totalMethodsRev) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  interface CancelRow {
    cancelled_value?: number;
  }
  const cancelRows =
    cancellationsRes.status === "fulfilled"
      ? ((cancellationsRes.value?.data as { rows?: CancelRow[] } | undefined)?.rows || [])
      : [];
  const monthCancellations = round2(
    cancelRows.reduce((acc, r) => acc + (Number(r.cancelled_value) || 0), 0)
  );

  const theoreticalCmvValue = round2(
    periodProductsRaw.reduce((acc, p) => acc + (Number(p.total_expense) || 0), 0)
  );
  const purchasesValue = round2(
    cashFlows
      .filter((cf) => !cf.isEarning && cf.category.toLowerCase().includes("insumo"))
      .reduce((acc, cf) => acc + cf.value, 0)
  );
  const positiveInventoryValue = round2(
    inventory.reduce((acc, item) => acc + Math.max(0, item.quantity) * item.unitaryPrice, 0)
  );

  const rawCashRegPayload = cashRegRes.status === "fulfilled" ? cashRegRes.value : [];
  const rawCashRegList = Array.isArray(rawCashRegPayload)
    ? rawCashRegPayload
    : (rawCashRegPayload?.data || []);

  const openCashRegisters: RevenueAndCmvSnapshot["openCashRegisters"] = rawCashRegList.map((cr, idx) => ({
    id: Number(cr.id) || idx + 1,
    name: String(cr.name || cr.cashier_name || `Caixa #${idx + 1}`),
    openedAt: String(cr.opened_at || cr.created_at || syncedAt),
    balance: Number(cr.balance || cr.current_balance || 0),
  }));

  const periodLabel = `${startMonth.split("-").reverse().slice(0, 2).join("/")} a ${today.split("-").reverse().slice(0, 2).join("/")}/${today.slice(0, 4)} (Takeat Oficial)`;

  const finance: RevenueAndCmvSnapshot = {
    todayRevenue,
    todayOrders,
    todayAvgTicket,
    todayCancellations: 0,
    openCashRegisters,
    monthRevenue,
    monthOrders,
    monthCancellations,
    channels,
    paymentMethods,
    cmvPeriod: {
      label: periodLabel,
      openingStockValue: prevState.finance.cmvPeriod.openingStockValue,
      purchasesValue,
      closingStockValue:
        prevState.finance.cmvPeriod.closingStockValue > 0
          ? prevState.finance.cmvPeriod.closingStockValue
          : positiveInventoryValue,
      revenueValue: monthRevenue,
      theoreticalCmvValue,
    },
  };

  // 8) Avaliações (Ratings)
  interface RawRating {
    id: number;
    score?: number;
    comment?: string | null;
    source?: { channel?: string };
    created_at?: string;
  }
  const ratingsPayload = ratingsRes.status === "fulfilled" ? ratingsRes.value : null;
  const rawRatings = (ratingsPayload?.data as RawRating[] | undefined) || [];
  const ratingsPagination = ratingsPayload?.pagination as { total?: number } | undefined;

  const avgRatingScore =
    rawRatings.length > 0
      ? round2(rawRatings.reduce((acc, r) => acc + (Number(r.score) || 0), 0) / rawRatings.length)
      : 0;

  const ratings: RatingsSnapshot = {
    averageScore: avgRatingScore,
    totalReviews: Number(ratingsPagination?.total) || rawRatings.length,
    recent: rawRatings.slice(0, 10).map((r) => ({
      id: String(r.id),
      channel: String(r.source?.channel || "takeat").toUpperCase(),
      score: Number(r.score) || 5,
      comment: (r.comment || "").trim() || "Avaliação sem comentário textual.",
      date: (r.created_at || today).slice(0, 10),
    })),
  };

  // 9) KDS Cozinha
  const kdsSummary =
    kdsRes.status === "fulfilled"
      ? (kdsRes.value?.summary as {
          baskets?: number;
          avg_prep_s?: number | null;
          avg_total_s?: number | null;
          median_total_s?: number | null;
          on_time_pct?: number | null;
        } | undefined)
      : undefined;

  const avgPrepSeconds = Math.round(Number(kdsSummary?.avg_prep_s ?? kdsSummary?.avg_total_s ?? 0) || 0);
  const medianPrepSeconds = Math.round(Number(kdsSummary?.median_total_s ?? avgPrepSeconds) || 0);
  const goalCompliancePct = Math.round(Number(kdsSummary?.on_time_pct ?? 0) || 0);

  const kds: KdsSnapshot = {
    avgPrepSeconds,
    medianPrepSeconds,
    goalCompliancePct,
    stations:
      avgPrepSeconds > 0
        ? [
            {
              name: "Cozinha Geral (Takeat KDS)",
              avgSeconds: avgPrepSeconds,
              ordersCount: Number(kdsSummary?.baskets) || 0,
              status:
                avgPrepSeconds > prevState.store.kdsTargetSeconds
                  ? "critical"
                  : avgPrepSeconds > prevState.store.kdsTargetSeconds * 0.85
                    ? "warning"
                    : "ok",
            },
          ]
        : [],
    detractors: [],
  };

  const nextState: AppState = {
    ...prevState,
    store: {
      ...prevState.store,
      id: String(restaurantId),
      name: restaurantName,
      subtitle: `Loja #${restaurantId} · API Oficial Takeat`,
      takeatMode: "live",
      takeatConnected: true,
      takeatRestaurantId: restaurantId,
      takeatRestaurantName: `${restaurantName} · Loja #${restaurantId}`,
      takeatLastSyncAt: syncedAt,
    },
    suppliers,
    inventory,
    menuProducts,
    receivedNfes,
    cashFlows,
    finance,
    ratings,
    kds,
    syncLogs: [
      {
        id: generateId("sync"),
        resource: "SYNC OFICIAL TAKEAT (Loja + Estoque + Cardápio + NF-e + Financeiro)",
        status: "ok",
        message: `${rawInputs.length} insumos, ${rawIntermediaries.length} intermediários, ${menuProducts.length} produtos, ${receivedNfes.length} NF-e e ${cashFlows.length} lançamentos sincronizados.`,
        at: syncedAt,
      },
      ...prevState.syncLogs.slice(0, 14),
    ],
  };

  return {
    nextState,
    summary: {
      inputsCount: rawInputs.length,
      intermediariesCount: rawIntermediaries.length,
      productsCount: menuProducts.length,
      nfesCount: receivedNfes.length,
      cashFlowsCount: cashFlows.length,
      monthRevenue,
    },
  };
}
