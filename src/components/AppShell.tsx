"use client";

import { useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  Flame,
  Home,
  Package,
  Plus,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { roleLabel, useApp } from "@/context/AppContext";
import { TodayTab } from "@/components/tabs/TodayTab";
import { RoutinesTab } from "@/components/tabs/RoutinesTab";
import { InventoryTab } from "@/components/tabs/InventoryTab";
import { OperationsTab } from "@/components/tabs/OperationsTab";
import { NumbersTab } from "@/components/tabs/NumbersTab";
import { QuickActionSheet, type QuickActionMode } from "@/components/QuickActionSheet";
import { SettingsDrawer } from "@/components/SettingsDrawer";

export type MainTabId = "today" | "routines" | "inventory" | "operations" | "numbers";

export function AppShell() {
  const { state, activeUser, toast, dismissToast } = useApp();

  const [activeTab, setActiveTab] = useState<MainTabId>("today");
  const [targetRoutineId, setTargetRoutineId] = useState<string | null>(null);
  const [targetSubTab, setTargetSubTab] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickActionMode>("menu");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pendingRoutinesCount = state.routines.filter((r) => r.status !== "completed").length;
  const openOpsCount =
    state.maintenanceTasks.filter((m) => m.status !== "done").length +
    state.incidents.filter((i) => i.status !== "resolved").length;

  function handleNavigateTab(tab: MainTabId, options?: { routineId?: string; subTab?: string }) {
    if (options?.routineId) setTargetRoutineId(options.routineId);
    if (options?.subTab) setTargetSubTab(options.subTab);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openQuick(mode: QuickActionMode) {
    setQuickMode(mode);
    setQuickOpen(true);
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-xl mx-auto bg-[#F6F4EF] shadow-xl/5 relative">
      {/* Cabeçalho Mobile Compacto Fixo */}
      <header className="sticky top-0 z-30 bg-[#161514]/95 backdrop-blur-md text-white px-4 py-3 border-b border-stone-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm shrink-0">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold tracking-tight truncate">
                  {state.store.name}
                </h1>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0">
                  Takeat
                </span>
              </div>
              <p className="text-[11px] text-stone-400 truncate">
                {activeUser.name} · {roleLabel(activeUser.role)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações e troca de perfil"
            className="h-9 w-9 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 active:scale-95 shrink-0"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Toast flutuante */}
      {toast && (
        <div className="fixed top-16 inset-x-0 z-50 px-4 max-w-xl mx-auto pointer-events-none">
          <div
            className={`pointer-events-auto rounded-2xl px-3.5 py-2.5 text-xs font-bold shadow-lg flex items-center justify-between gap-2 border ${
              toast.tone === "error"
                ? "bg-red-600 text-white border-red-700"
                : toast.tone === "warning"
                  ? "bg-amber-500 text-stone-950 border-amber-600"
                  : toast.tone === "info"
                    ? "bg-stone-900 text-white border-stone-700"
                    : "bg-emerald-600 text-white border-emerald-700"
            }`}
          >
            <span>{toast.message}</span>
            <button type="button" onClick={dismissToast} aria-label="Fechar aviso">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo Principal da Aba Ativa */}
      <main className="flex-1 px-4 pt-4 pb-28">
        {activeTab === "today" && (
          <TodayTab
            onNavigateTab={handleNavigateTab}
            onOpenQuickAction={(mode) => openQuick(mode)}
          />
        )}

        {activeTab === "routines" && (
          <RoutinesTab
            initialRoutineId={targetRoutineId}
            onClearInitialRoutine={() => setTargetRoutineId(null)}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryTab
            initialSubTab={targetSubTab}
            onClearSubTab={() => setTargetSubTab(null)}
            onOpenWasteQuickAction={() => openQuick("waste")}
            onOpenPauseQuickAction={() => openQuick("pause")}
          />
        )}

        {activeTab === "operations" && (
          <OperationsTab
            initialSubTab={targetSubTab}
            onClearSubTab={() => setTargetSubTab(null)}
            onOpenQuickAction={(mode) => openQuick(mode)}
          />
        )}

        {activeTab === "numbers" && <NumbersTab />}
      </main>

      {/* Botão Flutuante + Ação Rápida */}
      <button
        type="button"
        onClick={() => openQuick("menu")}
        aria-label="Abrir menu de ação rápida"
        className="fixed bottom-20 right-4 sm:right-[max(1rem,calc(50%-17rem))] z-40 h-14 px-4 rounded-full bg-orange-600 hover:bg-orange-700 text-white shadow-xl shadow-orange-600/30 flex items-center gap-1.5 font-extrabold text-xs active:scale-95 transition"
      >
        <Plus className="h-5 w-5 stroke-[2.8]" />
        <span>Rápido</span>
      </button>

      {/* Navegação Inferior (5 Abas no Polegar) */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 inset-x-0 z-30 max-w-xl mx-auto bg-white/95 backdrop-blur-md border-t border-[#E5DFD4] px-2 pt-1.5 pb-safe"
      >
        <div className="grid grid-cols-5 gap-1">
          {[
            { id: "today", label: "Hoje", icon: Home, badge: 0 },
            { id: "routines", label: "Rotinas", icon: ClipboardCheck, badge: pendingRoutinesCount },
            { id: "inventory", label: "Estoque", icon: Package, badge: 0 },
            { id: "operations", label: "Operação", icon: Wrench, badge: openOpsCount },
            { id: "numbers", label: "Números", icon: BarChart3, badge: 0 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNavigateTab(tab.id as MainTabId)}
                className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 px-1 transition ${
                  active ? "text-orange-600 bg-orange-50/80" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[2]"}`} />
                <span className={`mt-0.5 text-[10px] ${active ? "font-extrabold" : "font-semibold"}`}>
                  {tab.label}
                </span>
                {tab.badge > 0 && (
                  <span className="absolute top-1 right-2.5 h-4 min-w-4 px-1 rounded-full bg-orange-600 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modais globais */}
      <QuickActionSheet
        open={quickOpen}
        mode={quickMode}
        onChangeMode={setQuickMode}
        onClose={() => setQuickOpen(false)}
      />

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
