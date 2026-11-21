import type {
  InventoryItem,
  RoutineItem,
  RoutineRun,
  RoutineTrafficStatus,
} from "@/types/domain";

export interface CmvAnalysisInput {
  openingStockValue: number;
  purchasesValue: number;
  closingStockValue: number;
  revenueValue: number;
  theoreticalCmvValue: number;
  registeredWasteValue: number;
  cancellationsValue: number;
  targetCmvPct: number;
}

export interface CmvAnalysisResult {
  realCmvValue: number;
  realCmvPct: number;
  theoreticalCmvPct: number;
  gapValue: number;
  gapPctPoints: number;
  vsTargetPctPoints: number;
  registeredWastePctOfRevenue: number;
  cancellationsPctOfRevenue: number;
  unexplainedLeakValue: number;
  healthStatus: "healthy" | "warning" | "critical";
}

/**
 * Calcula o CMV Real vs CMV Teórico e decompõe o vazamento de margem (Gap de CMV).
 * Fórmula clássica de restaurante: CMV Real = Estoque Inicial + Compras - Estoque Final.
 */
export function calculateCmvAnalysis(input: CmvAnalysisInput): CmvAnalysisResult {
  const realCmvValue = Math.max(
    0,
    round2(input.openingStockValue + input.purchasesValue - input.closingStockValue)
  );
  const safeRevenue = input.revenueValue > 0 ? input.revenueValue : 0;

  const realCmvPct = safeRevenue > 0 ? round2((realCmvValue / safeRevenue) * 100) : 0;
  const theoreticalCmvPct =
    safeRevenue > 0 ? round2((input.theoreticalCmvValue / safeRevenue) * 100) : 0;

  const gapValue = round2(realCmvValue - input.theoreticalCmvValue);
  const gapPctPoints = round2(realCmvPct - theoreticalCmvPct);
  const vsTargetPctPoints = round2(realCmvPct - input.targetCmvPct);

  const registeredWastePctOfRevenue =
    safeRevenue > 0 ? round2((input.registeredWasteValue / safeRevenue) * 100) : 0;
  const cancellationsPctOfRevenue =
    safeRevenue > 0 ? round2((input.cancellationsValue / safeRevenue) * 100) : 0;

  // Vazamento não explicado = Gap total menos desperdício registrado e custo estimado de cancelamentos
  const unexplainedLeakValue = Math.max(
    0,
    round2(gapValue - input.registeredWasteValue - input.cancellationsValue * 0.35)
  );

  let healthStatus: CmvAnalysisResult["healthStatus"] = "healthy";
  if (realCmvPct > input.targetCmvPct + 3 || gapPctPoints > 4) {
    healthStatus = "critical";
  } else if (realCmvPct > input.targetCmvPct || gapPctPoints > 2) {
    healthStatus = "warning";
  }

  return {
    realCmvValue,
    realCmvPct,
    theoreticalCmvPct,
    gapValue,
    gapPctPoints,
    vsTargetPctPoints,
    registeredWastePctOfRevenue,
    cancellationsPctOfRevenue,
    unexplainedLeakValue,
    healthStatus,
  };
}

export interface DivergenceInput {
  theoreticalQty: number;
  countedQty: number;
  registeredWasteQty: number;
  unitaryPrice: number;
}

export interface DivergenceResult {
  rawDeltaQty: number; // counted - theoretical (negativo = faltou no estoque)
  missingQty: number; // positivo = quanto sumiu em relação ao teórico
  invisibleDivergenceQty: number; // quanto sumiu ALÉM do desperdício registrado
  invisibleDivergenceCost: number;
  status: "ok" | "surplus" | "explained_waste" | "leak_alert";
}

/**
 * Separa perda assumida (desperdício lançado no app) de divergência invisível
 * (furo de estoque, erro de porcionamento, ficha técnica desatualizada ou desvio).
 */
export function calculateInvisibleDivergence(input: DivergenceInput): DivergenceResult {
  const rawDeltaQty = round4(input.countedQty - input.theoreticalQty);
  const missingQty = round4(input.theoreticalQty - input.countedQty);

  if (missingQty <= 0.0001) {
    return {
      rawDeltaQty,
      missingQty: 0,
      invisibleDivergenceQty: 0,
      invisibleDivergenceCost: 0,
      status: rawDeltaQty > 0.0001 ? "surplus" : "ok",
    };
  }

  const invisibleDivergenceQty = Math.max(0, round4(missingQty - Math.max(0, input.registeredWasteQty)));
  const invisibleDivergenceCost = round2(invisibleDivergenceQty * input.unitaryPrice);

  const status: DivergenceResult["status"] =
    invisibleDivergenceQty <= 0.0001 ? "explained_waste" : "leak_alert";

  return {
    rawDeltaQty,
    missingQty,
    invisibleDivergenceQty,
    invisibleDivergenceCost,
    status,
  };
}

export interface PurchaseSuggestion {
  inventoryItemId: string;
  takeatId: number;
  name: string;
  unit: string;
  supplierId: string;
  currentQty: number;
  minimumStock: number;
  idealStock: number;
  suggestedQty: number;
  unitPrice: number;
  estimatedCost: number;
  urgency: "rupture" | "critical" | "low";
}

/**
 * Gera lista de compras inteligente a partir dos saldos e níveis mínimo/ideal do Takeat.
 * Suporta multiplicador de pico (ex.: 1.25 para fim de semana).
 */
export function buildPurchaseSuggestions(
  items: InventoryItem[],
  peakMultiplier = 1
): PurchaseSuggestion[] {
  const multiplier = Math.max(1, peakMultiplier);
  const suggestions: PurchaseSuggestion[] = [];

  for (const item of items) {
    if (item.kind !== "input") continue;
    const targetIdeal = round2(item.idealStock * multiplier);
    const triggerThreshold = round2(item.minimumStock * multiplier);

    if (item.quantity <= triggerThreshold && targetIdeal > item.quantity) {
      const rawSuggested = targetIdeal - item.quantity;
      const suggestedQty =
        item.unit === "un" || item.unit === "pct" || item.unit === "cx"
          ? Math.ceil(rawSuggested)
          : round2(rawSuggested);

      const urgency: PurchaseSuggestion["urgency"] =
        item.quantity <= 0
          ? "rupture"
          : item.quantity <= item.minimumStock * 0.5
            ? "critical"
            : "low";

      suggestions.push({
        inventoryItemId: item.id,
        takeatId: item.takeatId,
        name: item.name,
        unit: item.unit,
        supplierId: item.supplierId,
        currentQty: item.quantity,
        minimumStock: item.minimumStock,
        idealStock: targetIdeal,
        suggestedQty,
        unitPrice: item.unitaryPrice,
        estimatedCost: round2(suggestedQty * item.unitaryPrice),
        urgency,
      });
    }
  }

  const urgencyWeight = { rupture: 0, critical: 1, low: 2 };
  return suggestions.sort(
    (a, b) => urgencyWeight[a.urgency] - urgencyWeight[b.urgency] || b.estimatedCost - a.estimatedCost
  );
}

/**
 * Calcula variação percentual de preço unitário em NF-e para alerta de inflação de insumos.
 */
export function calculatePriceInflationPct(previousPrice: number, newPrice: number): number {
  if (previousPrice <= 0) return 0;
  return round2(((newPrice - previousPrice) / previousPrice) * 100);
}

/**
 * Avalia o semáforo anti-esquecimento de uma rotina com base no horário atual (HH:mm).
 */
export function evaluateRoutineTrafficStatus(
  routine: Pick<RoutineRun, "status" | "dueTime" | "graceMinutes">,
  nowMinutesFromMidnight: number
): RoutineTrafficStatus {
  if (routine.status === "completed") return "completed";

  const [hh, mm] = routine.dueTime.split(":").map(Number);
  const dueMinutes = (hh || 0) * 60 + (mm || 0);
  const diff = dueMinutes - nowMinutesFromMidnight;

  if (diff < 0) return "late";
  if (diff <= 30) return "due_soon";
  return "on_track";
}

/**
 * Calcula a pontuação (0 a 100%) de um checklist / auditoria 5S ponderada por peso.
 */
export function calculateRoutineScore(items: RoutineItem[]): number {
  if (items.length === 0) return 100;
  const totalWeight = items.reduce((acc, item) => acc + Math.max(1, item.weight), 0);
  const earnedWeight = items.reduce((acc, item) => {
    if (!item.checked || item.isNonCompliant) return acc;
    return acc + Math.max(1, item.weight);
  }, 0);
  return Math.round((earnedWeight / totalWeight) * 100);
}

/**
 * Verifica se um valor numérico (ex.: temperatura °C) está dentro da faixa sanitária segura.
 */
export function isNumericAnswerOutOfRange(item: Pick<RoutineItem, "inputType" | "minValue" | "maxValue">, value: number | null | undefined): boolean {
  if (item.inputType !== "number_range" || value === null || value === undefined || Number.isNaN(value)) {
    return false;
  }
  if (typeof item.minValue === "number" && value < item.minValue) return true;
  if (typeof item.maxValue === "number" && value > item.maxValue) return true;
  return false;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
