"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  ActionPlan,
  AppState,
  Equipment,
  Incident,
  IncidentCategory,
  MaintenanceTask,
  RoutineCategory,
  RoutineRun,
  ShiftName,
  StockCountRecord,
  StoreConfig,
  TeamMember,
  WasteReason,
} from "@/types/domain";
import { createInitialLiveState } from "@/lib/data/initial-state";
import { takeatClient, resetTakeatTokenCache } from "@/lib/takeat/client";
import { syncLiveTakeatIntoState } from "@/lib/takeat/live-sync";
import { TakeatApiError } from "@/lib/takeat/types";
import {
  calculateInvisibleDivergence,
  isNumericAnswerOutOfRange,
} from "@/lib/domain/calculations";
import { generateId } from "@/lib/utils";

const STORAGE_KEY = "house190_live_state_v2";
const LEGACY_STORAGE_KEY = "brassaops_state_v1";

export interface ToastNotice {
  id: string;
  tone: "success" | "warning" | "error" | "info";
  message: string;
}

interface AppContextValue {
  state: AppState;
  activeUser: TeamMember;
  isSyncingTakeat: boolean;
  toast: ToastNotice | null;
  dismissToast: () => void;
  notify: (message: string, tone?: ToastNotice["tone"]) => void;

  // Perfil & Loja
  switchActiveUser: (userId: string) => void;
  updateStoreConfig: (patch: Partial<StoreConfig>) => void;
  addTeamMember: (member: Omit<TeamMember, "id" | "active">) => void;
  resetLocalLogsAndResync: () => Promise<void>;

  // Integração Takeat Oficial (https://public-api.takeat.app)
  syncTakeatNow: () => Promise<void>;
  updateTakeatApiKey: (apiKey: string) => Promise<void>;
  toggleMenuProductAvailability: (
    productId: number,
    channel: "available" | "availableInDelivery"
  ) => Promise<void>;

  // Rotinas & Checklists
  toggleRoutineItem: (runId: string, itemId: string) => void;
  updateRoutineItemNumeric: (runId: string, itemId: string, value: number | null) => void;
  updateRoutineItemPhoto: (runId: string, itemId: string, photoDataUrl: string | null) => void;
  toggleRoutineItemNonCompliant: (runId: string, itemId: string) => void;
  completeRoutineRun: (runId: string) => boolean;
  createRoutineTemplate: (payload: {
    title: string;
    description: string;
    category: RoutineCategory;
    station: string;
    dueTime: string;
    recurrence: "daily" | "weekly" | "biweekly" | "monthly";
    items: { label: string; photoRequired: boolean }[];
  }) => void;

  // Desperdício, Contagens & Compras
  logWaste: (payload: {
    inventoryItemId: string;
    quantity: number;
    reason: WasteReason;
    shift: ShiftName;
    notes?: string;
    photoDataUrl?: string | null;
  }) => void;
  submitStockCount: (payload: {
    title: string;
    blindMode: boolean;
    reason: string;
    entries: { inventoryItemId: string; countedQty: number }[];
  }) => Promise<{ ok: boolean; isConflict409?: boolean; message: string }>;
  createPurchaseOrder: (payload: {
    supplierId: string;
    items: { inventoryItemId: string; name: string; unit: string; suggestedQty: number; orderedQty: number; unitPrice: number }[];
    markAsSent?: boolean;
  }) => void;
  markPurchaseOrderStatus: (orderId: string, status: "sent_whatsapp" | "received" | "received_with_issue") => void;
  confirmNfeReceiving: (nfeId: number, temperatureC: number | undefined, notes: string) => void;

  // Manutenção, Ocorrências, Planos 5W2H & Passagem de Turno
  addEquipment: (eq: Omit<Equipment, "id" | "accumulatedCost">) => void;
  createMaintenanceTask: (payload: {
    equipmentId: string;
    type: "preventive" | "corrective";
    priority: MaintenanceTask["priority"];
    title: string;
    description: string;
    dueDate: string;
    cost: number;
    photoDataUrl?: string | null;
  }) => void;
  updateMaintenanceStatus: (taskId: string, status: MaintenanceTask["status"], cost?: number) => void;
  createIncident: (payload: {
    category: IncidentCategory;
    severity: Incident["severity"];
    title: string;
    description: string;
    shift: ShiftName;
    photoDataUrl?: string | null;
    alsoCreateActionPlan?: boolean;
  }) => void;
  updateIncidentStatus: (incidentId: string, status: Incident["status"]) => void;
  createActionPlan: (payload: {
    title: string;
    whyReason: string;
    howSteps: string;
    originType: ActionPlan["originType"];
    originId?: string;
    ownerName: string;
    dueDate: string;
    estimatedCost: number;
  }) => void;
  updateActionPlanStatus: (planId: string, status: ActionPlan["status"], evidencePhotoUrl?: string | null) => void;
  createShiftHandover: (payload: { fromShift: ShiftName; summary: string; pendingAlerts: string[]; cashOk: boolean }) => void;
  acknowledgeHandover: (handoverId: string) => void;

  // Financeiro & CMV
  toggleCashFlowPaid: (cashFlowId: number) => void;
  updateCmvPeriodValues: (patch: Partial<AppState["finance"]["cmvPeriod"]>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => createInitialLiveState());
  const [hydrated, setHydrated] = useState(false);
  const [isSyncingTakeat, setIsSyncingTakeat] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  function notify(message: string, tone: ToastNotice["tone"] = "success") {
    const id = generateId("toast");
    setToast({ id, tone, message });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3600);
  }

  async function performLiveSync(baseStateOverride?: AppState, silent = false) {
    setIsSyncingTakeat(true);
    try {
      const baseState = baseStateOverride || state;
      const { nextState, summary } = await syncLiveTakeatIntoState(baseState);
      setState((curr) => {
        const root = baseStateOverride || curr;
        return {
          ...root,
          store: nextState.store,
          suppliers: nextState.suppliers,
          inventory: nextState.inventory,
          menuProducts: nextState.menuProducts,
          receivedNfes: nextState.receivedNfes,
          cashFlows: nextState.cashFlows,
          finance: nextState.finance,
          ratings: nextState.ratings,
          kds: nextState.kds,
          syncLogs: [nextState.syncLogs[0], ...root.syncLogs.slice(0, 14)],
        };
      });
      if (!silent) {
        notify(
          `Takeat sincronizado: ${summary.inputsCount} insumos, ${summary.productsCount} produtos e ${summary.nfesCount} NF-e.`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao conectar à API Takeat.";
      setState((prev) => ({
        ...prev,
        store: { ...prev.store, takeatConnected: false },
        syncLogs: [
          {
            id: generateId("sync"),
            resource: "SYNC TAKEAT OFICIAL",
            status: "error",
            message,
            at: new Date().toISOString(),
          },
          ...prev.syncLogs.slice(0, 14),
        ],
      }));
      notify(message, "error");
    } finally {
      setIsSyncingTakeat(false);
    }
  }

  useEffect(() => {
    let initial = createInitialLiveState();
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed?.store && Array.isArray(parsed.routines) && Array.isArray(parsed.inventory)) {
          initial = parsed;
          setState(parsed);
        }
      }
    } catch {
      // Mantém estado inicial limpo se localStorage falhar
    } finally {
      setHydrated(true);
    }
    void performLiveSync(initial, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignora erro de quota
    }
  }, [state, hydrated]);

  const activeUser = useMemo(() => {
    return state.team.find((m) => m.id === state.activeUserId) || state.team[0];
  }, [state.team, state.activeUserId]);

  const value: AppContextValue = {
    state,
    activeUser,
    isSyncingTakeat,
    toast,
    dismissToast: () => setToast(null),
    notify,

    switchActiveUser(userId) {
      const target = state.team.find((u) => u.id === userId);
      if (!target) return;
      setState((prev) => ({ ...prev, activeUserId: userId }));
      notify(`Perfil alternado para ${target.name} (${roleLabel(target.role)})`, "info");
    },

    updateStoreConfig(patch) {
      setState((prev) => ({ ...prev, store: { ...prev.store, ...patch } }));
      notify("Configurações da loja atualizadas!");
    },

    addTeamMember(member) {
      const created: TeamMember = { ...member, id: generateId("usr"), active: true };
      setState((prev) => ({ ...prev, team: [...prev.team, created] }));
      notify(`${member.name} adicionado(a) à equipe!`);
    },

    async resetLocalLogsAndResync() {
      const fresh = createInitialLiveState();
      setState(fresh);
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      await performLiveSync(fresh, false);
    },

    async syncTakeatNow() {
      await performLiveSync(undefined, false);
    },

    async updateTakeatApiKey(apiKey: string) {
      const trimmed = apiKey.trim();
      try {
        if (trimmed) {
          window.localStorage.setItem("takeat_api_key_override", trimmed);
        } else {
          window.localStorage.removeItem("takeat_api_key_override");
        }
      } catch {
        // ignore
      }
      resetTakeatTokenCache();
      await performLiveSync(undefined, false);
    },

    async toggleMenuProductAvailability(productId, channel) {
      const target = state.menuProducts.find((p) => p.id === productId);
      if (!target) return;

      const nextAvailable = channel === "available" ? !target.available : target.available;
      const nextDelivery =
        channel === "availableInDelivery" ? !target.availableInDelivery : target.availableInDelivery;

      try {
        await takeatClient.setProductAvailability(productId, {
          available: nextAvailable,
          available_in_delivery: nextDelivery,
        });

        setState((prev) => ({
          ...prev,
          menuProducts: prev.menuProducts.map((p) =>
            p.id === productId
              ? { ...p, available: nextAvailable, availableInDelivery: nextDelivery }
              : p
          ),
          syncLogs: [
            {
              id: generateId("sync"),
              resource: `PATCH /v1/products/${productId}/availability`,
              status: "ok",
              message: `${target.name}: Salão ${nextAvailable ? "Ativo" : "Pausado"} · Delivery ${nextDelivery ? "Ativo" : "Pausado"}`,
              at: new Date().toISOString(),
            },
            ...prev.syncLogs.slice(0, 14),
          ],
        }));
        notify(
          `${target.name} ${
            (channel === "available" ? nextAvailable : nextDelivery) ? "reativado" : "pausado"
          } no Takeat!`,
          (channel === "available" ? nextAvailable : nextDelivery) ? "success" : "warning"
        );
      } catch (err) {
        notify(err instanceof Error ? err.message : "Erro ao atualizar cardápio no Takeat.", "error");
      }
    },

    toggleRoutineItem(runId, itemId) {
      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((run) => {
          if (run.id !== runId) return run;
          const items = run.items.map((item) => {
            if (item.id !== itemId) return item;
            const nextChecked = !item.checked;
            return {
              ...item,
              checked: nextChecked,
              answeredAt: nextChecked ? new Date().toISOString() : undefined,
              answeredBy: nextChecked ? activeUser.name : undefined,
            };
          });
          return {
            ...run,
            status: run.status === "completed" ? "in_progress" : items.some((i) => i.checked) ? "in_progress" : "pending",
            items,
          };
        }),
      }));
    },

    updateRoutineItemNumeric(runId, itemId, val) {
      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((run) => {
          if (run.id !== runId) return run;
          const items = run.items.map((item) => {
            if (item.id !== itemId) return item;
            const outOfRange = isNumericAnswerOutOfRange(item, val);
            return {
              ...item,
              numericValue: val,
              checked: val !== null && !Number.isNaN(val),
              isNonCompliant: outOfRange,
              answeredAt: new Date().toISOString(),
              answeredBy: activeUser.name,
            };
          });
          return { ...run, status: "in_progress", items };
        }),
      }));
    },

    updateRoutineItemPhoto(runId, itemId, photoDataUrl) {
      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((run) => {
          if (run.id !== runId) return run;
          return {
            ...run,
            status: run.status === "pending" ? "in_progress" : run.status,
            items: run.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    photoDataUrl,
                    checked: photoDataUrl ? true : item.checked,
                    answeredAt: new Date().toISOString(),
                    answeredBy: activeUser.name,
                  }
                : item
            ),
          };
        }),
      }));
    },

    toggleRoutineItemNonCompliant(runId, itemId) {
      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((run) => {
          if (run.id !== runId) return run;
          return {
            ...run,
            items: run.items.map((item) =>
              item.id === itemId
                ? { ...item, isNonCompliant: !item.isNonCompliant, checked: true }
                : item
            ),
          };
        }),
      }));
    },

    completeRoutineRun(runId) {
      const target = state.routines.find((r) => r.id === runId);
      if (!target) return false;

      const missingItems = target.items.filter((i) => !i.checked);
      if (missingItems.length > 0) {
        notify(`Faltam ${missingItems.length} passo(s) para concluir esta rotina.`, "warning");
        return false;
      }

      const missingPhotos = target.items.filter((i) => i.photoRequired && !i.photoDataUrl);
      if (missingPhotos.length > 0) {
        notify(
          `Foto obrigatória pendente em: "${missingPhotos[0].label.slice(0, 42)}..."`,
          "warning"
        );
        return false;
      }

      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: "completed",
                completedAt: new Date().toISOString(),
                completedBy: activeUser.name,
              }
            : r
        ),
      }));
      notify(`Rotina "${target.title}" concluída e auditada!`);
      return true;
    },

    createRoutineTemplate(payload) {
      const created: RoutineRun = {
        id: generateId("run"),
        templateId: generateId("tpl"),
        title: payload.title,
        description: payload.description || "Rotina operacional cadastrada pelo gerente.",
        category: payload.category,
        shift: "all",
        station: payload.station,
        recurrence: payload.recurrence,
        dueTime: payload.dueTime,
        graceMinutes: 20,
        assignedRole: "manager",
        status: "pending",
        items: payload.items.map((it) => ({
          id: generateId("rit"),
          label: it.label,
          inputType: "check",
          photoRequired: it.photoRequired,
          weight: 2,
          checked: false,
          isNonCompliant: false,
        })),
      };
      setState((prev) => ({ ...prev, routines: [...prev.routines, created] }));
      notify(`Rotina "${payload.title}" criada e agendada para ${payload.dueTime}!`);
    },

    logWaste(payload) {
      const item = state.inventory.find((i) => i.id === payload.inventoryItemId);
      if (!item) return;

      const totalCost = Math.round(payload.quantity * item.unitaryPrice * 100) / 100;
      const newLog = {
        id: generateId("wst"),
        inventoryItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        quantity: payload.quantity,
        unitCost: item.unitaryPrice,
        totalCost,
        reason: payload.reason,
        shift: payload.shift,
        notes: payload.notes,
        photoDataUrl: payload.photoDataUrl,
        loggedBy: activeUser.name,
        loggedAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        wasteLogs: [newLog, ...prev.wasteLogs],
      }));
      notify(`Desperdício registrado: ${item.name} (-R$ ${totalCost.toFixed(2).replace(".", ",")})`, "warning");
    },

    async submitStockCount(payload) {
      const idempotencyKey = generateId("cnt");
      const countedAt = new Date().toISOString();

      const itemsMeta = payload.entries
        .map((entry) => {
          const inv = state.inventory.find((i) => i.id === entry.inventoryItemId);
          if (!inv) return null;
          const registeredWasteQty = state.wasteLogs
            .filter((w) => w.inventoryItemId === inv.id)
            .reduce((acc, w) => acc + w.quantity, 0);
          const div = calculateInvisibleDivergence({
            theoreticalQty: inv.quantity,
            countedQty: entry.countedQty,
            registeredWasteQty,
            unitaryPrice: inv.unitaryPrice,
          });
          return { inv, entry, registeredWasteQty, div };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (itemsMeta.length === 0) {
        return { ok: false, message: "Informe ao menos um item na contagem." };
      }

      try {
        const inputItems = itemsMeta
          .filter((m) => m.inv.kind === "input")
          .map((m) => ({
            id: m.inv.takeatId,
            quantidade: String(m.entry.countedQty),
            expected_stock_version: m.inv.stockVersion,
            counted_at: countedAt,
            reason: payload.reason,
          }));

        const intermediaryItems = itemsMeta
          .filter((m) => m.inv.kind === "intermediary")
          .map((m) => ({
            id: m.inv.takeatId,
            quantidade: String(m.entry.countedQty),
            expected_stock_version: m.inv.stockVersion,
            counted_at: countedAt,
            reason: payload.reason,
          }));

        const newVersionByTakeatId = new Map<number, string>();
        if (inputItems.length > 0) {
          const resp = await takeatClient.registerInputCountsBulk(
            inputItems,
            `${idempotencyKey}-inp`
          );
          for (const item of resp?.items || []) {
            if (item.stock_version) newVersionByTakeatId.set(item.id, String(item.stock_version));
          }
        }
        if (intermediaryItems.length > 0) {
          const resp = await takeatClient.registerIntermediaryCountsBulk(
            intermediaryItems,
            `${idempotencyKey}-int`
          );
          for (const item of resp?.items || []) {
            if (item.stock_version) newVersionByTakeatId.set(item.id, String(item.stock_version));
          }
        }

        const totalDivergenceCost = Math.round(
          itemsMeta.reduce((acc, m) => acc + m.div.invisibleDivergenceCost, 0) * 100
        ) / 100;

        const countRecord: StockCountRecord = {
          id: generateId("sc"),
          title: payload.title,
          blindMode: payload.blindMode,
          idempotencyKey,
          status: "synced",
          countedBy: activeUser.name,
          countedAt,
          totalDivergenceCost,
          items: itemsMeta.map((m) => ({
            inventoryItemId: m.inv.id,
            takeatId: m.inv.takeatId,
            kind: m.inv.kind,
            itemName: m.inv.name,
            unit: m.inv.unit,
            theoreticalQty: m.inv.quantity,
            countedQty: m.entry.countedQty,
            registeredWasteQty: m.registeredWasteQty,
            invisibleDivergenceQty: m.div.invisibleDivergenceQty,
            invisibleDivergenceCost: m.div.invisibleDivergenceCost,
            expectedStockVersion: m.inv.stockVersion,
            newStockVersion:
              newVersionByTakeatId.get(m.inv.takeatId) || String(Number(m.inv.stockVersion) + 1),
            status: "synced",
          })),
        };

        const updatedQtyById = new Map(itemsMeta.map((m) => [m.inv.id, m.entry.countedQty]));

        setState((prev) => ({
          ...prev,
          inventory: prev.inventory.map((inv) => {
            if (!updatedQtyById.has(inv.id)) return inv;
            return {
              ...inv,
              quantity: updatedQtyById.get(inv.id)!,
              stockVersion:
                newVersionByTakeatId.get(inv.takeatId) || String(Number(inv.stockVersion) + 1),
            };
          }),
          stockCounts: [countRecord, ...prev.stockCounts],
          syncLogs: [
            {
              id: generateId("sync"),
              resource: "POST /v1/inventory/*/counts/bulk",
              status: "ok",
              message: `${itemsMeta.length} itens contados e enviados ao Takeat (chave ${idempotencyKey}).`,
              at: countedAt,
            },
            ...prev.syncLogs.slice(0, 14),
          ],
        }));

        const successMsg = `Contagem aplicada no Takeat! Divergência invisível: R$ ${totalDivergenceCost.toFixed(2).replace(".", ",")}.`;
        notify(successMsg);
        return { ok: true, message: successMsg };
      } catch (err) {
        if (err instanceof TakeatApiError && err.isConflict409) {
          const msg =
            err.message ||
            "HTTP 409: Saldo mudou no Takeat durante a contagem. Atualize e revise manualmente.";
          setState((prev) => ({
            ...prev,
            syncLogs: [
              {
                id: generateId("sync"),
                resource: "POST /v1/inventory/*/counts/bulk",
                status: "conflict_409",
                message: msg,
                at: new Date().toISOString(),
              },
              ...prev.syncLogs.slice(0, 14),
            ],
          }));
          notify(msg, "error");
          return { ok: false, isConflict409: true, message: msg };
        }
        const msg = err instanceof Error ? err.message : "Erro ao enviar contagem ao Takeat.";
        setState((prev) => ({
          ...prev,
          syncLogs: [
            {
              id: generateId("sync"),
              resource: "POST /v1/inventory/*/counts/bulk",
              status: "error",
              message: msg,
              at: new Date().toISOString(),
            },
            ...prev.syncLogs.slice(0, 14),
          ],
        }));
        notify(msg, "error");
        return { ok: false, message: msg };
      }
    },

    createPurchaseOrder(payload) {
      const supplier = state.suppliers.find((s) => s.id === payload.supplierId);
      const totalEstimated =
        Math.round(payload.items.reduce((acc, i) => acc + i.orderedQty * i.unitPrice, 0) * 100) /
        100;
      const now = new Date().toISOString();
      const order = {
        id: generateId("po"),
        supplierId: payload.supplierId,
        supplierName: supplier?.name || "Fornecedor",
        status: payload.markAsSent ? ("sent_whatsapp" as const) : ("draft" as const),
        createdAt: now,
        sentAt: payload.markAsSent ? now : undefined,
        totalEstimated,
        items: payload.items,
      };
      setState((prev) => ({ ...prev, purchaseOrders: [order, ...prev.purchaseOrders] }));
      notify(`Pedido para ${order.supplierName} salvo!`);
    },

    markPurchaseOrderStatus(orderId, status) {
      setState((prev) => ({
        ...prev,
        purchaseOrders: prev.purchaseOrders.map((po) =>
          po.id === orderId
            ? {
                ...po,
                status,
                sentAt: status === "sent_whatsapp" ? new Date().toISOString() : po.sentAt,
                receivedAt:
                  status === "received" || status === "received_with_issue"
                    ? new Date().toISOString()
                    : po.receivedAt,
              }
            : po
        ),
      }));
      notify("Status do pedido de compra atualizado!");
    },

    confirmNfeReceiving(nfeId, temperatureC, notes) {
      setState((prev) => ({
        ...prev,
        receivedNfes: prev.receivedNfes.map((nfe) =>
          nfe.id === nfeId
            ? {
                ...nfe,
                checkedAtReceiving: true,
                manifestation: "confirmacao",
                receivingTemperatureC: temperatureC,
                receivingNotes: notes,
              }
            : nfe
        ),
      }));
      notify(`NF-e #${nfeId} conferida no recebimento!`);
    },

    addEquipment(eq) {
      const created: Equipment = { ...eq, id: generateId("eq"), accumulatedCost: 0 };
      setState((prev) => ({ ...prev, equipments: [...prev.equipments, created] }));
      notify(`Equipamento "${eq.name}" cadastrado!`);
    },

    createMaintenanceTask(payload) {
      const eq = state.equipments.find((e) => e.id === payload.equipmentId);
      const task: MaintenanceTask = {
        id: generateId("mnt"),
        equipmentId: payload.equipmentId,
        equipmentName: eq?.name || "Equipamento",
        type: payload.type,
        priority: payload.priority,
        status: "open",
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate,
        cost: payload.cost,
        photoDataUrl: payload.photoDataUrl,
        openedBy: activeUser.name,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        maintenanceTasks: [task, ...prev.maintenanceTasks],
        equipments: prev.equipments.map((e) =>
          e.id === payload.equipmentId
            ? {
                ...e,
                status:
                  payload.priority === "stopped_operation"
                    ? "down"
                    : payload.type === "corrective"
                      ? "attention"
                      : e.status,
              }
            : e
        ),
      }));
      notify(`Chamado aberto para ${task.equipmentName}!`, payload.priority === "stopped_operation" ? "error" : "warning");
    },

    updateMaintenanceStatus(taskId, status, cost) {
      const target = state.maintenanceTasks.find((t) => t.id === taskId);
      if (!target) return;

      const finalCost = typeof cost === "number" ? cost : target.cost;
      const today = new Date().toISOString().slice(0, 10);

      setState((prev) => ({
        ...prev,
        maintenanceTasks: prev.maintenanceTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                cost: finalCost,
                completedAt: status === "done" ? new Date().toISOString() : undefined,
              }
            : t
        ),
        equipments:
          status === "done"
            ? prev.equipments.map((e) => {
                if (e.id !== target.equipmentId) return e;
                const nextDate = new Date();
                nextDate.setDate(nextDate.getDate() + e.preventiveIntervalDays);
                return {
                  ...e,
                  status: "operational",
                  lastMaintenanceAt: today,
                  nextMaintenanceAt: nextDate.toISOString().slice(0, 10),
                  accumulatedCost: Math.round((e.accumulatedCost + finalCost) * 100) / 100,
                };
              })
            : prev.equipments,
      }));
      notify(status === "done" ? "Manutenção concluída e próxima preventiva agendada!" : "Status do chamado atualizado!");
    },

    createIncident(payload) {
      const incidentId = generateId("inc");
      const created: Incident = {
        id: incidentId,
        category: payload.category,
        severity: payload.severity,
        status: "open",
        title: payload.title,
        description: payload.description,
        shift: payload.shift,
        photoDataUrl: payload.photoDataUrl,
        createdBy: activeUser.name,
        createdAt: new Date().toISOString(),
      };

      const nextPlan: ActionPlan | null = payload.alsoCreateActionPlan
        ? {
            id: generateId("act"),
            title: `Resolver: ${payload.title}`,
            whyReason: payload.description,
            howSteps: "Definir responsável e prazo para eliminar causa raiz.",
            originType: "incident",
            originId: incidentId,
            ownerName: activeUser.name,
            dueDate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
            estimatedCost: 0,
            status: "todo",
            createdAt: new Date().toISOString(),
          }
        : null;

      setState((prev) => ({
        ...prev,
        incidents: [created, ...prev.incidents],
        actionPlans: nextPlan ? [nextPlan, ...prev.actionPlans] : prev.actionPlans,
      }));
      notify(
        nextPlan
          ? "Ocorrência registrada + Plano de Ação 5W2H criado!"
          : "Ocorrência registrada no Diário de Bordo!",
        payload.severity === "critical" || payload.severity === "high" ? "warning" : "success"
      );
    },

    updateIncidentStatus(incidentId, status) {
      setState((prev) => ({
        ...prev,
        incidents: prev.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                status,
                resolvedAt: status === "resolved" ? new Date().toISOString() : undefined,
              }
            : inc
        ),
      }));
      notify("Ocorrência atualizada!");
    },

    createActionPlan(payload) {
      const plan: ActionPlan = {
        ...payload,
        id: generateId("act"),
        status: "todo",
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, actionPlans: [plan, ...prev.actionPlans] }));
      notify("Plano de Ação 5W2H adicionado!");
    },

    updateActionPlanStatus(planId, status, evidencePhotoUrl) {
      setState((prev) => ({
        ...prev,
        actionPlans: prev.actionPlans.map((p) =>
          p.id === planId
            ? {
                ...p,
                status,
                evidencePhotoUrl: evidencePhotoUrl !== undefined ? evidencePhotoUrl : p.evidencePhotoUrl,
                completedAt: status === "done" ? new Date().toISOString() : undefined,
              }
            : p
        ),
      }));
      notify(status === "done" ? "Plano de Ação concluído!" : "Status do plano atualizado!");
    },

    createShiftHandover(payload) {
      const handover = {
        id: generateId("hnd"),
        date: new Date().toISOString().slice(0, 10),
        fromShift: payload.fromShift,
        createdBy: activeUser.name,
        summary: payload.summary,
        pendingAlerts: payload.pendingAlerts,
        cashOk: payload.cashOk,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, handovers: [handover, ...prev.handovers] }));
      notify("Passagem de turno publicada para o próximo gerente!");
    },

    acknowledgeHandover(handoverId) {
      setState((prev) => ({
        ...prev,
        handovers: prev.handovers.map((h) =>
          h.id === handoverId
            ? {
                ...h,
                acknowledgedBy: activeUser.name,
                acknowledgedAt: new Date().toISOString(),
              }
            : h
        ),
      }));
      notify("Leitura da passagem de turno confirmada!");
    },

    toggleCashFlowPaid(cashFlowId) {
      setState((prev) => ({
        ...prev,
        cashFlows: prev.cashFlows.map((cf) =>
          cf.id === cashFlowId ? { ...cf, paid: !cf.paid } : cf
        ),
      }));
      notify("Lançamento financeiro atualizado!");
    },

    updateCmvPeriodValues(patch) {
      setState((prev) => ({
        ...prev,
        finance: {
          ...prev.finance,
          cmvPeriod: { ...prev.finance.cmvPeriod, ...patch },
        },
      }));
      notify("Fechamento de CMV recalculado!");
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de AppProvider");
  return ctx;
}

export function roleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Dono / Admin";
  if (role === "manager") return "Gerente";
  return "Líder / Equipe";
}
