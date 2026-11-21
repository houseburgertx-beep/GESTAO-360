"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChefHat,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileSpreadsheet,
  MessageCircle,
  Package,
  RefreshCw,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { WASTE_REASON_LABELS } from "@/components/QuickActionSheet";
import {
  buildPurchaseSuggestions,
  calculateInvisibleDivergence,
  calculatePriceInflationPct,
} from "@/lib/domain/calculations";
import { buildWhatsAppPurchaseMessage, buildWhatsAppUrl } from "@/lib/domain/whatsapp";
import { formatBRL, formatPct, formatQty } from "@/lib/utils";
import type { InventoryItem } from "@/types/domain";

export type InventorySubTab = "stock" | "waste" | "count" | "purchases";

interface InventoryTabProps {
  initialSubTab?: string | null;
  onClearSubTab?: () => void;
  onOpenWasteQuickAction: () => void;
  onOpenPauseQuickAction: () => void;
}

const AREAS: ("Todas" | InventoryItem["storageArea"])[] = [
  "Todas",
  "Câmara Fria",
  "Freezer",
  "Linha de Montagem",
  "Estoque Seco",
  "Bebidas",
  "Embalagens",
];

export function InventoryTab({
  initialSubTab,
  onClearSubTab,
  onOpenWasteQuickAction,
  onOpenPauseQuickAction,
}: InventoryTabProps) {
  const {
    state,
    activeUser,
    isSyncingTakeat,
    syncTakeatNow,
    submitStockCount,
    createPurchaseOrder,
    markPurchaseOrderStatus,
    confirmNfeReceiving,
    createActionPlan,
  } = useApp();

  const [subTab, setSubTab] = useState<InventorySubTab>(
    (initialSubTab as InventorySubTab) || "stock"
  );
  const [areaFilter, setAreaFilter] = useState<"Todas" | InventoryItem["storageArea"]>("Todas");
  const [kindFilter, setKindFilter] = useState<"all" | "input" | "intermediary">("all");
  const [recipeModalItem, setRecipeModalItem] = useState<InventoryItem | null>(null);

  // Estado da Contagem Física
  const [blindMode, setBlindMode] = useState(false);
  const [countOnlyCritical, setCountOnlyCritical] = useState(true);
  const [countReason, setCountReason] = useState("Contagem física de turno · BrassaOps");
  const [simulate409, setSimulate409] = useState(false);
  const [countedDraft, setCountedDraft] = useState<Record<string, string>>({});
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [lastConflictMsg, setLastConflictMsg] = useState<string | null>(null);

  // Estado de Compras & NF-e
  const [peakMultiplier, setPeakMultiplier] = useState<1 | 1.25 | 1.5>(1);
  const [nfeTempDraft, setNfeTempDraft] = useState<Record<number, string>>({});
  const [nfeNotesDraft, setNfeNotesDraft] = useState<Record<number, string>>({});

  useEffect(() => {
    if (
      initialSubTab === "stock" ||
      initialSubTab === "waste" ||
      initialSubTab === "count" ||
      initialSubTab === "purchases"
    ) {
      setSubTab(initialSubTab);
      onClearSubTab?.();
    }
  }, [initialSubTab, onClearSubTab]);

  const filteredStock = useMemo(() => {
    return state.inventory.filter((item) => {
      if (areaFilter !== "Todas" && item.storageArea !== areaFilter) return false;
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      return true;
    });
  }, [state.inventory, areaFilter, kindFilter]);

  const totalInventoryValue = useMemo(
    () => state.inventory.reduce((acc, i) => acc + i.quantity * i.unitaryPrice, 0),
    [state.inventory]
  );

  // Ranking dos maiores vilões de desperdício
  const wasteByItem = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    for (const w of state.wasteLogs) {
      const existing = map.get(w.inventoryItemId);
      if (existing) {
        existing.qty += w.quantity;
        existing.cost += w.totalCost;
      } else {
        map.set(w.inventoryItemId, { name: w.itemName, unit: w.unit, qty: w.quantity, cost: w.totalCost });
      }
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [state.wasteLogs]);

  const totalWasteCost = useMemo(
    () => state.wasteLogs.reduce((acc, w) => acc + w.totalCost, 0),
    [state.wasteLogs]
  );

  // Itens exibidos na tela de Contagem
  const countItems = useMemo(() => {
    return state.inventory.filter((i) => (!countOnlyCritical ? true : i.isCritical));
  }, [state.inventory, countOnlyCritical]);

  // Sugestões de Compra agrupadas por fornecedor
  const suggestions = useMemo(
    () => buildPurchaseSuggestions(state.inventory, peakMultiplier),
    [state.inventory, peakMultiplier]
  );

  const groupedBySupplier = useMemo(() => {
    const groups = new Map<string, typeof suggestions>();
    for (const s of suggestions) {
      const curr = groups.get(s.supplierId) || [];
      curr.push(s);
      groups.set(s.supplierId, curr);
    }
    return [...groups.entries()].map(([supplierId, items]) => ({
      supplier: state.suppliers.find((sp) => sp.id === supplierId) || {
        id: supplierId,
        name: "Fornecedor Geral",
        category: "Insumos",
        whatsapp: "5511999999999",
        contactName: "Atendimento",
        deliveryDays: "Sob consulta",
      },
      items,
      totalCost: items.reduce((acc, i) => acc + i.estimatedCost, 0),
    }));
  }, [suggestions, state.suppliers]);

  async function handleSendStockCount() {
    setLastConflictMsg(null);
    const entries = countItems
      .filter((item) => countedDraft[item.id] !== undefined && countedDraft[item.id] !== "")
      .map((item) => ({
        inventoryItemId: item.id,
        countedQty: Math.max(0, Number(countedDraft[item.id])),
      }));

    if (entries.length === 0) return;

    setCountSubmitting(true);
    const res = await submitStockCount({
      title: countOnlyCritical ? "Contagem Rápida de Críticos" : "Contagem Completa de Estoque",
      blindMode,
      reason: countReason.trim() || "Contagem física BrassaOps",
      simulateConflict409: simulate409,
      entries,
    });
    setCountSubmitting(false);

    if (res.isConflict409) {
      setLastConflictMsg(res.message);
      setSimulate409(false);
    } else if (res.ok) {
      setCountedDraft({});
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho + Sync Takeat */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">Estoque, Desperdício & Compras</h2>
          <p className="text-xs text-stone-500">
            Conectado ao Takeat · Capital em estoque:{" "}
            <span className="font-mono font-bold text-stone-800">{formatBRL(totalInventoryValue)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncTakeatNow()}
          disabled={isSyncingTakeat}
          className="flex items-center gap-1.5 rounded-xl bg-stone-900 text-white px-3 py-2 text-xs font-bold active:scale-95 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${isSyncingTakeat ? "animate-spin" : ""}`} />
          Sync
        </button>
      </div>

      {/* Sub-abas */}
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-[#EAE4D9] p-1">
        {[
          { id: "stock", label: "Estoque", icon: Package },
          { id: "waste", label: "Perdas", icon: Trash2 },
          { id: "count", label: "Contagem", icon: ClipboardCheck },
          { id: "purchases", label: "Compras", icon: ShoppingCart },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as InventorySubTab)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl py-2 px-1 text-[11px] font-extrabold transition ${
                active ? "bg-white text-stone-900 shadow-xs" : "text-stone-600"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-orange-600" : ""}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================== SUB-ABA 1: ESTOQUE TAKEAT ===================== */}
      {subTab === "stock" && (
        <div className="space-y-3">
          {/* Filtro Tipo + Praça */}
          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `Todos (${state.inventory.length})` },
              { id: "input", label: "Insumos" },
              { id: "intermediary", label: "Intermediários" },
            ].map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKindFilter(k.id as typeof kindFilter)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                  kindFilter === k.id
                    ? "bg-orange-600 text-white"
                    : "bg-white border border-[#E5DFD4] text-stone-700"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setAreaFilter(area)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap ${
                  areaFilter === area
                    ? "bg-stone-900 text-white"
                    : "bg-white border border-[#E5DFD4] text-stone-600"
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredStock.map((item) => {
              const isRupture = item.quantity <= 0;
              const isLow = item.quantity > 0 && item.quantity <= item.minimumStock;
              const inflation = calculatePriceInflationPct(item.previousUnitPrice, item.unitaryPrice);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3.5 bg-white shadow-xs ${
                    isRupture
                      ? "border-red-300 bg-red-50/40"
                      : isLow
                        ? "border-amber-300"
                        : "border-[#E5DFD4]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-md bg-stone-100 text-stone-600 px-1.5 py-0.5 text-[10px] font-bold">
                          {item.storageArea}
                        </span>
                        {item.kind === "intermediary" && (
                          <span className="rounded-md bg-purple-100 text-purple-800 px-1.5 py-0.5 text-[10px] font-bold">
                            Intermediário
                          </span>
                        )}
                        {inflation >= 5 && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold">
                            <TrendingUp className="h-2.5 w-2.5" />+{formatPct(inflation)} preço
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 text-sm font-extrabold text-stone-900">{item.name}</h3>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-base font-mono font-extrabold tabular-nums ${
                          isRupture ? "text-red-600" : isLow ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {formatQty(item.quantity, item.unit)}
                      </p>
                      <p className="text-[10px] text-stone-500 font-mono">
                        Mín {item.minimumStock} · Ideal {item.idealStock}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-500 font-mono">
                      {formatBRL(item.unitaryPrice)}/{item.unit} · v{item.stockVersion}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {item.recipe && (
                        <button
                          type="button"
                          onClick={() => setRecipeModalItem(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-50 text-purple-800 px-2.5 py-1 text-[11px] font-bold"
                        >
                          <ChefHat className="h-3 w-3" /> Receita
                        </button>
                      )}
                      {isRupture && (
                        <button
                          type="button"
                          onClick={onOpenPauseQuickAction}
                          className="rounded-lg bg-red-600 text-white px-2.5 py-1 text-[11px] font-bold"
                        >
                          Pausar Cardápio
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== SUB-ABA 2: DESPERDÍCIO ===================== */}
      {subTab === "waste" && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-4 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-100">
                  Desperdício Registrado no Período
                </p>
                <p className="mt-1 text-2xl font-mono font-extrabold tabular-nums">
                  {formatBRL(totalWasteCost)}
                </p>
                <p className="text-xs text-amber-100 mt-0.5">
                  {state.wasteLogs.length} registros · meta até {formatPct(state.store.wasteTargetPct)} da receita
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWasteQuickAction}
                className="rounded-2xl bg-white text-orange-700 px-3.5 py-2.5 text-xs font-extrabold shadow-xs active:scale-95 shrink-0"
              >
                + Lançar Perda
              </button>
            </div>
          </div>

          {/* Ranking de Vilões */}
          <div className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
              Maiores Vilões de Desperdício
            </h3>
            {wasteByItem.map((w) => {
              const pct = totalWasteCost > 0 ? Math.round((w.cost / totalWasteCost) * 100) : 0;
              return (
                <div key={w.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-900 truncate pr-2">{w.name}</span>
                    <span className="font-mono font-extrabold text-red-700 shrink-0">
                      {formatBRL(w.cost)} ({formatQty(w.qty, w.unit)})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Histórico de Lançamentos */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
              Histórico de Perdas
            </h3>
            {state.wasteLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl bg-white border border-[#E5DFD4] p-3.5 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
                    {WASTE_REASON_LABELS[log.reason]}
                  </span>
                  <p className="mt-1 text-sm font-extrabold text-stone-900">{log.itemName}</p>
                  {log.notes && <p className="mt-0.5 text-xs text-stone-600">{log.notes}</p>}
                  <p className="mt-1 text-[11px] text-stone-400">
                    {log.loggedBy} · Turno {log.shift === "morning" ? "Almoço" : "Noite"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-extrabold text-red-700">
                    -{formatBRL(log.totalCost)}
                  </p>
                  <p className="text-xs font-mono text-stone-500">{formatQty(log.quantity, log.unit)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== SUB-ABA 3: CONTAGEM FÍSICA + DIVERGÊNCIA ===================== */}
      {subTab === "count" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-extrabold text-stone-900">Nova Contagem Física → Takeat</h3>
                <p className="text-xs text-stone-500">
                  Envia via <code className="font-mono bg-stone-100 px-1 rounded">POST /v1/inventory/*/counts/bulk</code> com <code className="font-mono">stock_version</code> e <code className="font-mono">Idempotency-Key</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlindMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border ${
                  blindMode
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-stone-50 text-stone-700 border-stone-200"
                }`}
              >
                {blindMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {blindMode ? "Contagem Cega ON" : "Contagem Cega OFF"}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCountOnlyCritical(true)}
                className={`rounded-lg px-3 py-1.5 font-bold ${
                  countOnlyCritical ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700"
                }`}
              >
                Só Críticos ({state.inventory.filter((i) => i.isCritical).length})
              </button>
              <button
                type="button"
                onClick={() => setCountOnlyCritical(false)}
                className={`rounded-lg px-3 py-1.5 font-bold ${
                  !countOnlyCritical ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700"
                }`}
              >
                Todos ({state.inventory.length})
              </button>
            </div>

            <input
              value={countReason}
              onChange={(e) => setCountReason(e.target.value)}
              placeholder="Motivo da contagem (obrigatório no Takeat)"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
            />

            {lastConflictMsg && (
              <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-xs text-red-900 space-y-2">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  Conflito de Concorrência Detectado (HTTP 409)
                </p>
                <p>{lastConflictMsg}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLastConflictMsg(null);
                    void syncTakeatNow();
                  }}
                  className="rounded-lg bg-red-600 text-white px-3 py-1.5 font-bold"
                >
                  Recarregar Saldos e stock_version do Takeat
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {countItems.map((item) => {
                const rawVal = countedDraft[item.id] ?? "";
                const hasVal = rawVal !== "";
                const wasteQty = state.wasteLogs
                  .filter((w) => w.inventoryItemId === item.id)
                  .reduce((acc, w) => acc + w.quantity, 0);
                const preview = hasVal
                  ? calculateInvisibleDivergence({
                      theoreticalQty: item.quantity,
                      countedQty: Math.max(0, Number(rawVal)),
                      registeredWasteQty: wasteQty,
                      unitaryPrice: item.unitaryPrice,
                    })
                  : null;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-stone-900 truncate">{item.name}</p>
                        <p className="text-[11px] text-stone-500">
                          {item.storageArea} · v{item.stockVersion}
                          {!blindMode && (
                            <span className="font-mono font-bold text-stone-700">
                              {" "}
                              · Teórico: {formatQty(item.quantity, item.unit)}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          placeholder="Contado"
                          value={rawVal}
                          onChange={(e) =>
                            setCountedDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="w-24 rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-sm font-mono font-bold text-right"
                        />
                        <span className="text-xs font-bold text-stone-500 w-6">{item.unit}</span>
                      </div>
                    </div>

                    {preview && !blindMode && (
                      <div
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold flex items-center justify-between ${
                          preview.status === "leak_alert"
                            ? "bg-red-100 text-red-800"
                            : preview.status === "explained_waste"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        <span>
                          {preview.status === "leak_alert"
                            ? `Divergência invisível: ${formatQty(preview.invisibleDivergenceQty, item.unit)} (descontando ${formatQty(wasteQty, item.unit)} de perda)`
                            : preview.status === "explained_waste"
                              ? "Quebra 100% explicada pelo desperdício registrado"
                              : preview.status === "surplus"
                                ? `Sobra física: +${formatQty(preview.rawDeltaQty, item.unit)}`
                                : "Saldo bateu exato com o Takeat!"}
                        </span>
                        {preview.invisibleDivergenceCost > 0 && (
                          <span className="font-mono font-extrabold">
                            -{formatBRL(preview.invisibleDivergenceCost)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {state.store.takeatMode === "demo" && (
              <label className="flex items-center gap-2 text-[11px] text-stone-500">
                <input
                  type="checkbox"
                  checked={simulate409}
                  onChange={(e) => setSimulate409(e.target.checked)}
                />
                Testar proteção contra Conflito HTTP 409 (venda durante contagem)
              </label>
            )}

            <button
              type="button"
              disabled={countSubmitting || Object.values(countedDraft).every((v) => !v)}
              onClick={() => void handleSendStockCount()}
              className="w-full rounded-2xl bg-orange-600 disabled:bg-stone-300 text-white py-3.5 text-sm font-extrabold active:scale-[0.99]"
            >
              {countSubmitting ? "Enviando ao Takeat..." : "Enviar Contagem ao Takeat"}
            </button>
          </div>

          {/* Histórico de Contagens e Divergências Invisíveis */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
              Últimas Contagens & Radar de Furo de Estoque
            </h3>
            {state.stockCounts.map((sc) => (
              <div key={sc.id} className="rounded-2xl bg-white border border-[#E5DFD4] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-stone-900">{sc.title}</p>
                    <p className="text-[11px] text-stone-500">
                      Por {sc.countedBy} · {sc.items.length} itens · Takeat Sync OK
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-stone-500">Furo invisível</p>
                    <p className="text-sm font-mono font-extrabold text-red-700">
                      -{formatBRL(sc.totalDivergenceCost)}
                    </p>
                  </div>
                </div>
                <div className="space-y-1 pt-1 border-t border-stone-100">
                  {sc.items.map((it) => (
                    <div key={it.inventoryItemId} className="flex items-center justify-between text-xs">
                      <span className="text-stone-700 truncate pr-2">{it.itemName}</span>
                      <span className="font-mono text-stone-900 shrink-0">
                        {it.theoreticalQty} → <strong>{it.countedQty}</strong> {it.unit}
                        {it.invisibleDivergenceCost > 0 && (
                          <span className="text-red-700 font-bold">
                            {" "}
                            (-{formatBRL(it.invisibleDivergenceCost)})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== SUB-ABA 4: COMPRAS AUTOMÁTICAS & NF-E TAKEAT ===================== */}
      {subTab === "purchases" && (
        <div className="space-y-4">
          {/* Lista Automática por Estoque Ideal */}
          <div className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-stone-900">
                  Sugestão Automática de Compras
                </h3>
                <p className="text-xs text-stone-500">
                  Baseada em <code className="font-mono">ideal_stock − saldo Takeat</code>
                </p>
              </div>
              <div className="flex rounded-xl bg-stone-100 p-0.5 text-[11px] font-bold">
                {([1, 1.25, 1.5] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPeakMultiplier(m)}
                    className={`rounded-lg px-2 py-1 ${
                      peakMultiplier === m ? "bg-orange-600 text-white" : "text-stone-600"
                    }`}
                  >
                    {m === 1 ? "Normal" : m === 1.25 ? "FDS +25%" : "Pico +50%"}
                  </button>
                ))}
              </div>
            </div>

            {groupedBySupplier.length === 0 ? (
              <p className="text-xs text-emerald-700 font-semibold py-2">
                Todos os insumos estão acima do estoque mínimo!
              </p>
            ) : (
              <div className="space-y-3">
                {groupedBySupplier.map(({ supplier, items, totalCost }) => {
                  const msg = buildWhatsAppPurchaseMessage(
                    state.store.name,
                    supplier,
                    items,
                    new Date().toLocaleDateString("pt-BR")
                  );
                  const wppUrl = buildWhatsAppUrl(supplier.whatsapp, msg);

                  return (
                    <div
                      key={supplier.id}
                      className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-extrabold text-stone-900">{supplier.name}</p>
                          <p className="text-[11px] text-stone-500">
                            {supplier.category} · Entrega: {supplier.deliveryDays}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-extrabold text-stone-900">
                          {formatBRL(totalCost)}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {items.map((it) => (
                          <div
                            key={it.inventoryItemId}
                            className="flex items-center justify-between text-xs bg-white rounded-xl px-2.5 py-2 border border-stone-200/80"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-stone-900 truncate">{it.name}</p>
                              <p className="text-[10px] text-stone-500">
                                Atual: {formatQty(it.currentQty, it.unit)} · Ideal: {formatQty(it.idealStock, it.unit)}
                              </p>
                            </div>
                            <span
                              className={`font-mono font-extrabold px-2 py-0.5 rounded-lg shrink-0 ${
                                it.urgency === "rupture"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-orange-100 text-orange-800"
                              }`}
                            >
                              +{formatQty(it.suggestedQty, it.unit)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <a
                          href={wppUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() =>
                            createPurchaseOrder({
                              supplierId: supplier.id,
                              markAsSent: true,
                              items: items.map((i) => ({
                                inventoryItemId: i.inventoryItemId,
                                name: i.name,
                                unit: i.unit,
                                suggestedQty: i.suggestedQty,
                                orderedQty: i.suggestedQty,
                                unitPrice: i.unitPrice,
                              })),
                            })
                          }
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 text-xs font-extrabold active:scale-[0.99]"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Enviar no WhatsApp
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pedidos Recentes */}
          {state.purchaseOrders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
                Pedidos em Andamento
              </h3>
              {state.purchaseOrders.map((po) => (
                <div key={po.id} className="rounded-2xl bg-white border border-[#E5DFD4] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-stone-900">{po.supplierName}</p>
                      <p className="text-xs text-stone-500">
                        {po.items.length} item(ns) · {formatBRL(po.totalEstimated)}
                      </p>
                    </div>
                    {po.status === "received" ? (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-[11px] font-bold">
                        Recebido
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markPurchaseOrderStatus(po.id, "received")}
                        className="rounded-xl bg-stone-900 text-white px-3 py-1.5 text-xs font-bold"
                      >
                        Marcar Recebido
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recebimento de NF-e Takeat + Radar de Inflação */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1 flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-orange-600" />
              NF-e Recebidas (Takeat) & Radar de Inflação
            </h3>

            {state.receivedNfes.map((nfe) => (
              <div key={nfe.id} className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-stone-500">
                      NF-e #{nfe.number}
                    </span>
                    <h4 className="text-sm font-extrabold text-stone-900">{nfe.issuerName}</h4>
                    <p className="text-xs font-mono font-bold text-stone-700 mt-0.5">
                      {formatBRL(nfe.totalAmount)}
                    </p>
                  </div>
                  {nfe.checkedAtReceiving ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold">
                      <CheckCircle2 className="h-3 w-3" /> Conferida
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[11px] font-bold">
                      Aguardando carga
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {nfe.items.map((it) => {
                    const diffPct = calculatePriceInflationPct(
                      it.previousUnitPrice,
                      it.invoicedUnitPrice
                    );
                    const highInflation = diffPct >= 5;
                    return (
                      <div
                        key={it.name}
                        className={`rounded-xl p-2.5 text-xs flex items-center justify-between gap-2 ${
                          highInflation
                            ? "bg-red-50 border border-red-200"
                            : "bg-stone-50 border border-stone-200/70"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900 truncate">{it.name}</p>
                          <p className="text-[11px] text-stone-600 font-mono">
                            {formatQty(it.quantity, it.unit)} × {formatBRL(it.invoicedUnitPrice)}
                            {highInflation && (
                              <span className="text-red-700 font-bold">
                                {" "}
                                (antes {formatBRL(it.previousUnitPrice)})
                              </span>
                            )}
                          </p>
                        </div>
                        {highInflation && (
                          <button
                            type="button"
                            onClick={() =>
                              createActionPlan({
                                title: `Cotar fornecedor alternativo: ${it.name} (+${formatPct(diffPct)})`,
                                whyReason: `NF-e #${nfe.number} (${nfe.issuerName}) subiu de ${formatBRL(it.previousUnitPrice)} para ${formatBRL(it.invoicedUnitPrice)}.`,
                                howSteps: "Solicitar 2 orçamentos e revisar ficha técnica no Takeat.",
                                originType: "cmv",
                                ownerName: activeUser.name,
                                dueDate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
                                estimatedCost: 0,
                              })
                            }
                            className="rounded-lg bg-red-600 text-white px-2 py-1 text-[10px] font-extrabold shrink-0"
                          >
                            +{formatPct(diffPct)} · Cotar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!nfe.checkedAtReceiving ? (
                  <div className="pt-2 border-t border-stone-100 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Temp °C"
                        value={nfeTempDraft[nfe.id] ?? ""}
                        onChange={(e) =>
                          setNfeTempDraft((p) => ({ ...p, [nfe.id]: e.target.value }))
                        }
                        className="rounded-xl border border-stone-300 px-2.5 py-2 text-xs font-mono"
                      />
                      <input
                        placeholder="Obs. do recebimento (validade/avaria)"
                        value={nfeNotesDraft[nfe.id] ?? ""}
                        onChange={(e) =>
                          setNfeNotesDraft((p) => ({ ...p, [nfe.id]: e.target.value }))
                        }
                        className="col-span-2 rounded-xl border border-stone-300 px-2.5 py-2 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        confirmNfeReceiving(
                          nfe.id,
                          nfeTempDraft[nfe.id] ? Number(nfeTempDraft[nfe.id]) : undefined,
                          nfeNotesDraft[nfe.id] || "Carga conferida sem divergência física."
                        )
                      }
                      className="w-full rounded-xl bg-stone-900 text-white py-2.5 text-xs font-extrabold"
                    >
                      Confirmar Recebimento da Carga
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                    {nfe.receivingTemperatureC !== undefined && (
                      <span className="font-mono font-bold text-stone-800">
                        Carga a {nfe.receivingTemperatureC}°C ·{" "}
                      </span>
                    )}
                    {nfe.receivingNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Receita de Intermediário */}
      {recipeModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 text-purple-800">
              <ChefHat className="h-5 w-5" />
              <h3 className="text-base font-extrabold">Ficha de Produção · Intermediário</h3>
            </div>
            <p className="text-sm font-bold text-stone-900">{recipeModalItem.name}</p>
            <p className="text-xs font-mono text-stone-600">
              Rendimento do lote: {recipeModalItem.yield || "—"} {recipeModalItem.unit} · Custo:{" "}
              {formatBRL(recipeModalItem.unitaryPrice)}/{recipeModalItem.unit}
            </p>
            <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3 text-xs text-stone-800 leading-relaxed">
              {recipeModalItem.recipe}
            </div>
            <button
              type="button"
              onClick={() => setRecipeModalItem(null)}
              className="w-full rounded-xl bg-stone-900 text-white py-2.5 text-xs font-bold"
            >
              Fechar Receita
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
