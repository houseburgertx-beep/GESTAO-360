"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  Link2,
  RefreshCw,
  RotateCcw,
  Shield,
  Store,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { roleLabel, useApp } from "@/context/AppContext";
import type { UserRole } from "@/types/domain";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const {
    state,
    activeUser,
    isSyncingTakeat,
    switchActiveUser,
    updateStoreConfig,
    addTeamMember,
    syncTakeatNow,
    resetDemoData,
  } = useApp();

  const [storeName, setStoreName] = useState(state.store.name);
  const [dailyGoal, setDailyGoal] = useState(String(state.store.dailyRevenueGoal));
  const [monthlyGoal, setMonthlyGoal] = useState(String(state.store.monthlyRevenueGoal));
  const [cmvTarget, setCmvTarget] = useState(String(state.store.cmvTargetPct));
  const [serverStatus, setServerStatus] = useState<{
    mode: string;
    supabaseConfigured: boolean;
    connected: boolean;
  } | null>(null);

  // Novo membro
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<UserRole>("staff");
  const [memberStation, setMemberStation] = useState("Cozinha / Chapa");

  useEffect(() => {
    if (!open) return;
    setStoreName(state.store.name);
    setDailyGoal(String(state.store.dailyRevenueGoal));
    setMonthlyGoal(String(state.store.monthlyRevenueGoal));
    setCmvTarget(String(state.store.cmvTargetPct));

    fetch("/api/takeat/status")
      .then((r) => r.json())
      .then((d) => setServerStatus(d))
      .catch(() => {});
  }, [open, state.store]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex justify-end">
      <div className="w-full max-w-md bg-[#F6F4EF] h-dvh overflow-y-auto p-5 pb-safe space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-stone-900">Configurações & Integrações</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white border border-[#E5DFD4] text-stone-700"
            aria-label="Fechar configurações"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Alternador Rápido de Perfil (Demonstração das permissões) */}
        <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-orange-600" />
            Perfil Ativo (Teste de Permissões)
          </h3>
          <div className="space-y-1.5">
            {state.team.map((member) => {
              const selected = member.id === activeUser.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => switchActiveUser(member.id)}
                  className={`w-full rounded-xl border p-2.5 text-left flex items-center justify-between transition ${
                    selected
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-stone-50 text-stone-800 border-stone-200"
                  }`}
                >
                  <div>
                    <p className="text-xs font-extrabold">{member.name}</p>
                    <p className={`text-[10px] ${selected ? "text-stone-300" : "text-stone-500"}`}>
                      {roleLabel(member.role)} · {member.station}
                    </p>
                  </div>
                  {selected && <CheckCircle2 className="h-4 w-4 text-orange-400" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Status da Conexão Takeat & Supabase */}
        <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-orange-600" />
              Conexão API Takeat & Supabase
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase whitespace-nowrap shrink-0 ${
                serverStatus?.mode === "live"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {serverStatus?.mode === "live" ? "Takeat Live" : "Takeat Demo"}
            </span>
          </div>

          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs space-y-1">
            <p className="font-bold text-stone-900">{state.store.takeatRestaurantName}</p>
            <p className="text-stone-600">
              Endpoint: <code className="font-mono">https://public-api.takeat.app</code>
            </p>
            <p className="text-stone-600 flex items-center gap-1">
              <Database className="h-3 w-3 text-stone-500" />
              Supabase:{" "}
              <strong>
                {serverStatus?.supabaseConfigured
                  ? "Conectado (.env.local)"
                  : "Modo Local/Demo (migrations prontas em /supabase)"}
              </strong>
            </p>
            <p className="text-[11px] text-stone-500 pt-1">
              Segurança: credenciais Takeat ficam somente no servidor (<code className="font-mono">.env.local</code>), nunca no celular.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void syncTakeatNow()}
            disabled={isSyncingTakeat}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 text-white py-2.5 text-xs font-extrabold"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${isSyncingTakeat ? "animate-spin" : ""}`} />
            Testar Sincronização Takeat Agora
          </button>

          {/* Log de Sincronização */}
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {state.syncLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[10px] border border-stone-200/70">
                <div className="flex justify-between font-mono font-bold">
                  <span className="truncate pr-2 text-stone-700">{log.resource}</span>
                  <span
                    className={
                      log.status === "ok"
                        ? "text-emerald-700"
                        : log.status === "conflict_409"
                          ? "text-amber-700"
                          : "text-red-700"
                    }
                  >
                    {log.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-stone-500 mt-0.5">{log.message}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dados & Metas da Hamburgueria */}
        {activeUser.role !== "staff" && (
          <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-orange-600" />
              Nome & Metas da Hamburgueria
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-stone-700">Nome da Loja</label>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-stone-600">Meta Dia (R$)</label>
                  <input
                    type="number"
                    value={dailyGoal}
                    onChange={(e) => setDailyGoal(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-600">Meta Mês (R$)</label>
                  <input
                    type="number"
                    value={monthlyGoal}
                    onChange={(e) => setMonthlyGoal(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-600">Meta CMV (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={cmvTarget}
                    onChange={(e) => setCmvTarget(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateStoreConfig({
                    name: storeName.trim() || state.store.name,
                    dailyRevenueGoal: Number(dailyGoal) || state.store.dailyRevenueGoal,
                    monthlyRevenueGoal: Number(monthlyGoal) || state.store.monthlyRevenueGoal,
                    cmvTargetPct: Number(cmvTarget) || state.store.cmvTargetPct,
                  })
                }
                className="w-full rounded-xl bg-orange-600 text-white py-2.5 text-xs font-extrabold"
              >
                Salvar Nome & Metas
              </button>
            </div>
          </section>
        )}

        {/* Adicionar Membro da Equipe */}
        {activeUser.role === "owner" && (
          <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-orange-600" />
              Adicionar Membro da Equipe
            </h3>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!memberName.trim()) return;
                addTeamMember({
                  name: memberName.trim(),
                  role: memberRole,
                  station: memberStation,
                  phone: "",
                });
                setMemberName("");
              }}
            >
              <input
                required
                placeholder="Nome completo"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as UserRole)}
                  className="rounded-xl border border-stone-300 px-2.5 py-2 text-xs bg-white"
                >
                  <option value="staff">Líder / Equipe</option>
                  <option value="manager">Gerente</option>
                  <option value="owner">Dono / Admin</option>
                </select>
                <input
                  value={memberStation}
                  onChange={(e) => setMemberStation(e.target.value)}
                  placeholder="Praça"
                  className="rounded-xl border border-stone-300 px-2.5 py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 text-white py-2 text-xs font-bold"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Adicionar à Equipe
              </button>
            </form>
          </section>
        )}

        {/* Resetar Demo */}
        <button
          type="button"
          onClick={resetDemoData}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white py-3 text-xs font-bold text-stone-700 hover:bg-stone-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar Dados Iniciais de Demonstração
        </button>
      </div>
    </div>
  );
}
