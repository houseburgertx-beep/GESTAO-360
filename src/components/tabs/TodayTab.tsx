"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  PackageX,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  buildPurchaseSuggestions,
  calculateRoutineScore,
  evaluateRoutineTrafficStatus,
} from "@/lib/domain/calculations";
import { formatBRL, formatPct } from "@/lib/utils";
import type { MainTabId } from "@/components/AppShell";

interface TodayTabProps {
  onNavigateTab: (tab: MainTabId, options?: { routineId?: string; subTab?: string }) => void;
  onOpenQuickAction: (mode: "waste" | "incident" | "maintenance" | "pause" | "handover") => void;
}

export function TodayTab({ onNavigateTab, onOpenQuickAction }: TodayTabProps) {
  const { state, activeUser, isSyncingTakeat, syncTakeatNow, acknowledgeHandover } = useApp();

  // Relógio de referência do turno (usa hora real do aparelho)
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const routinesWithTraffic = useMemo(() => {
    const order = { late: 0, due_soon: 1, on_track: 2, completed: 3 };
    return state.routines
      .map((r) => ({
        routine: r,
        traffic: evaluateRoutineTrafficStatus(r, nowMinutes),
        doneCount: r.items.filter((i) => i.checked).length,
      }))
      .sort((a, b) => order[a.traffic] - order[b.traffic] || a.routine.dueTime.localeCompare(b.routine.dueTime));
  }, [state.routines, nowMinutes]);

  const lateRoutines = routinesWithTraffic.filter((r) => r.traffic === "late");
  const completedRoutines = routinesWithTraffic.filter((r) => r.traffic === "completed");
  const totalItems = state.routines.reduce((acc, r) => acc + r.items.length, 0);
  const doneItems = state.routines.reduce(
    (acc, r) => acc + r.items.filter((i) => i.checked).length,
    0
  );
  const overallProgressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 100;

  const ruptureItems = state.inventory.filter((i) => i.quantity <= 0);
  const purchaseSuggestions = buildPurchaseSuggestions(state.inventory, 1);
  const urgentMaintenance = state.maintenanceTasks.filter(
    (m) => m.status !== "done" && (m.priority === "stopped_operation" || m.priority === "urgent")
  );
  const openIncidents = state.incidents.filter((i) => i.status !== "resolved");
  const openActionPlans = state.actionPlans.filter((p) => p.status !== "done");
  const latestHandover = state.handovers[0];

  const todayWasteTotal = state.wasteLogs.reduce((acc, w) => acc + w.totalCost, 0);
  const score5sRun = state.routines.find((r) => r.category === "5s_cleaning");
  const score5s = score5sRun ? calculateRoutineScore(score5sRun.items) : 100;
  const revenuePct =
    state.store.dailyRevenueGoal > 0
      ? Math.min(100, Math.round((state.finance.todayRevenue / state.store.dailyRevenueGoal) * 100))
      : 0;

  const canSeeNumbers = activeUser.role === "owner" || activeUser.role === "manager";

  return (
    <div className="space-y-4">
      {/* Cartão Hero: Controle do Turno (Anti-Esquecimento) */}
      <section className="rounded-3xl bg-[#161514] text-white p-4 shadow-lg border border-stone-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2.5 py-0.5 text-[11px] font-semibold">
              <Flame className="h-3 w-3" />
              Central do Turno · Sem Esquecer Nada
            </span>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight">
              Olá, {activeUser.name.split(" ")[0]}
            </h2>
            <p className="text-xs text-stone-400">
              {completedRoutines.length} de {state.routines.length} rotinas concluídas hoje ({doneItems}/{totalItems} passos)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void syncTakeatNow()}
            disabled={isSyncingTakeat}
            className="flex items-center gap-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 px-3 py-2 text-xs font-semibold text-stone-100 border border-stone-700 active:scale-95 transition shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${isSyncingTakeat ? "animate-spin" : ""}`} />
            <span>Takeat</span>
          </button>
        </div>

        {/* Barra de progresso do turno */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-stone-300 font-medium">Execução das rotinas do dia</span>
            <span className="font-mono font-bold text-orange-300 tabular-nums">{overallProgressPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-stone-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
        </div>

        {/* Mini-placar do dia */}
        <div className={`mt-4 grid gap-2 ${canSeeNumbers ? "grid-cols-3" : "grid-cols-2"}`}>
          {canSeeNumbers && (
            <button
              type="button"
              onClick={() => onNavigateTab("numbers")}
              className="rounded-2xl bg-stone-900/90 border border-stone-800 p-2 text-left hover:border-orange-500/40 transition min-w-0"
            >
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold flex items-center gap-1 truncate">
                <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="truncate">Vendas</span>
              </p>
              <p className="mt-1 text-xs sm:text-sm font-mono font-bold text-white tabular-nums whitespace-nowrap">
                {formatBRL(state.finance.todayRevenue)}
              </p>
              <p className="text-[10px] text-emerald-400 font-medium truncate">
                {revenuePct}% da meta
              </p>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigateTab("inventory", { subTab: "waste" })}
            className="rounded-2xl bg-stone-900/90 border border-stone-800 p-2 text-left hover:border-orange-500/40 transition min-w-0"
          >
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold truncate">
              Desperdício
            </p>
            <p className="mt-1 text-xs sm:text-sm font-mono font-bold text-amber-300 tabular-nums whitespace-nowrap">
              {formatBRL(todayWasteTotal)}
            </p>
            <p className="text-[10px] text-stone-400 truncate">
              {state.wasteLogs.length} registros
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("inventory", { subTab: "purchases" })}
            className="rounded-2xl bg-stone-900/90 border border-stone-800 p-2 text-left hover:border-orange-500/40 transition min-w-0"
          >
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold truncate">
              Repor
            </p>
            <p className="mt-1 text-xs sm:text-sm font-mono font-bold text-orange-300 tabular-nums whitespace-nowrap">
              {purchaseSuggestions.length} itens
            </p>
            <p className="text-[10px] text-stone-400 truncate">
              {ruptureItems.length > 0 ? `${ruptureItems.length} zerado(s)!` : "Sem ruptura"}
            </p>
          </button>
        </div>
      </section>

      {/* Radar de Alertas Críticos (Impossível ignorar) */}
      {(lateRoutines.length > 0 || ruptureItems.length > 0 || urgentMaintenance.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
            Atenção Imediata ({lateRoutines.length + ruptureItems.length + urgentMaintenance.length})
          </h3>

          {ruptureItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-red-50 border border-red-200 p-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="rounded-xl bg-red-600 text-white p-2 shrink-0">
                  <PackageX className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-red-900 uppercase">Ruptura no Estoque Takeat</p>
                  <p className="text-sm font-bold text-stone-900 truncate">{item.name} zerou!</p>
                  <p className="text-xs text-red-700">Pause o item no delivery/cardápio para evitar cancelamento.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenQuickAction("pause")}
                className="rounded-xl bg-red-600 text-white px-3 py-2 text-xs font-bold shrink-0 active:scale-95"
              >
                Pausar
              </button>
            </div>
          ))}

          {urgentMaintenance.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onNavigateTab("operations", { subTab: "maintenance" })}
              className="w-full flex items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-left active:scale-[0.99]"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="rounded-xl bg-amber-500 text-white p-2 shrink-0">
                  <Wrench className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-amber-900 uppercase">
                    Manutenção {task.priority === "stopped_operation" ? "Parou Operação" : "Urgente"}
                  </p>
                  <p className="text-sm font-bold text-stone-900 truncate">{task.equipmentName}</p>
                  <p className="text-xs text-amber-800 truncate">{task.title}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-700 shrink-0" />
            </button>
          ))}

          {lateRoutines.slice(0, 2).map(({ routine }) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => onNavigateTab("routines", { routineId: routine.id })}
              className="w-full flex items-center justify-between gap-3 rounded-2xl bg-orange-50 border border-orange-200 p-3 text-left active:scale-[0.99]"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="rounded-xl bg-orange-600 text-white p-2 shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-orange-800 uppercase">
                    Rotina Atrasada · Prazo {routine.dueTime}
                  </p>
                  <p className="text-sm font-bold text-stone-900 truncate">{routine.title}</p>
                  <p className="text-xs text-stone-600">{routine.station}</p>
                </div>
              </div>
              <span className="rounded-xl bg-orange-600 text-white px-3 py-1.5 text-xs font-bold shrink-0">
                Fazer
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Passagem de Turno (Briefing do Turno Anterior) */}
      {latestHandover && (
        <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-orange-600" />
              <h3 className="text-sm font-extrabold text-stone-900">
                Passagem de Turno ({latestHandover.fromShift === "morning" ? "Almoço → Noite" : "Noite → Manhã"})
              </h3>
            </div>
            {latestHandover.acknowledgedBy ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-bold">
                <CheckCircle2 className="h-3 w-3" /> Lido
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
                Aguardando ciente
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-stone-700 leading-relaxed">{latestHandover.summary}</p>
          {latestHandover.pendingAlerts.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {latestHandover.pendingAlerts.map((alert, idx) => (
                <li key={idx} className="text-xs text-stone-800 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-stone-100">
            <span className="text-[11px] text-stone-500">Por {latestHandover.createdBy}</span>
            <div className="flex items-center gap-2">
              {!latestHandover.acknowledgedBy && (
                <button
                  type="button"
                  onClick={() => acknowledgeHandover(latestHandover.id)}
                  className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-xs font-bold active:scale-95"
                >
                  Confirmar Leitura
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenQuickAction("handover")}
                className="rounded-xl bg-stone-100 text-stone-800 px-3 py-1.5 text-xs font-bold hover:bg-stone-200"
              >
                Passar Turno
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Linha do Tempo das Rotinas do Dia */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
            Linha do Tempo de Hoje
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab("routines")}
            className="text-xs font-bold text-orange-600"
          >
            Ver todas →
          </button>
        </div>

        <div className="space-y-2">
          {routinesWithTraffic.map(({ routine, traffic, doneCount }) => {
            const total = routine.items.length;
            const badge =
              traffic === "completed"
                ? { label: "Concluída", cls: "bg-emerald-100 text-emerald-800" }
                : traffic === "late"
                  ? { label: "Atrasada", cls: "bg-red-100 text-red-700" }
                  : traffic === "due_soon"
                    ? { label: "Vence já", cls: "bg-amber-100 text-amber-800" }
                    : { label: "Programada", cls: "bg-stone-100 text-stone-700" };

            return (
              <button
                key={routine.id}
                type="button"
                onClick={() => onNavigateTab("routines", { routineId: routine.id })}
                className="w-full rounded-2xl bg-white border border-[#E5DFD4] p-3.5 text-left shadow-xs hover:border-orange-300 transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded-lg shrink-0">
                      {routine.dueTime}
                    </span>
                    <span className="text-xs font-medium text-stone-500 truncate">{routine.station}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-stone-900">{routine.title}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                  <span>
                    {doneCount}/{total} passos concluídos
                    {routine.items.some((i) => i.photoRequired) ? " · exige foto" : ""}
                  </span>
                  <span className="font-bold text-orange-600">
                    {traffic === "completed" ? "Revisar" : "Abrir →"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Resumo Rápido de Operação & 5S */}
      <section className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onNavigateTab("operations", { subTab: "incidents" })}
          className="rounded-2xl bg-white border border-[#E5DFD4] p-3 text-left"
        >
          <p className="text-[11px] font-semibold text-stone-500">Ocorrências</p>
          <p className="mt-1 text-xl font-mono font-extrabold text-stone-900 tabular-nums">
            {openIncidents.length}
          </p>
          <p className="text-[10px] text-stone-500">em aberto</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("operations", { subTab: "plans" })}
          className="rounded-2xl bg-white border border-[#E5DFD4] p-3 text-left"
        >
          <p className="text-[11px] font-semibold text-stone-500">Planos 5W2H</p>
          <p className="mt-1 text-xl font-mono font-extrabold text-orange-600 tabular-nums">
            {openActionPlans.length}
          </p>
          <p className="text-[10px] text-stone-500">ativos</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("routines")}
          className="rounded-2xl bg-white border border-[#E5DFD4] p-3 text-left"
        >
          <p className="text-[11px] font-semibold text-stone-500">Nota 5S</p>
          <p className="mt-1 text-xl font-mono font-extrabold text-emerald-700 tabular-nums">
            {formatPct(score5s, 0)}
          </p>
          <p className="text-[10px] text-stone-500">meta {state.store.min5sScore}%</p>
        </button>
      </section>
    </div>
  );
}
