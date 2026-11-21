"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Lock,
  Receipt,
  Star,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { calculateCmvAnalysis } from "@/lib/domain/calculations";
import { formatBRL, formatDuration, formatPct } from "@/lib/utils";

export function NumbersTab() {
  const { state, activeUser, toggleCashFlowPaid, updateCmvPeriodValues } = useApp();
  const [editingCmv, setEditingCmv] = useState(false);
  const [openingInput, setOpeningInput] = useState(String(state.finance.cmvPeriod.openingStockValue));
  const [purchasesInput, setPurchasesInput] = useState(String(state.finance.cmvPeriod.purchasesValue));
  const [closingInput, setClosingInput] = useState(String(state.finance.cmvPeriod.closingStockValue));

  const totalWasteMonth = useMemo(() => {
    const logged = state.wasteLogs.reduce((acc, w) => acc + w.totalCost, 0);
    // Projeta acumulado do período + novos registros feitos pelo usuário
    return 1840 + logged;
  }, [state.wasteLogs]);

  const cmv = useMemo(() => {
    return calculateCmvAnalysis({
      openingStockValue: state.finance.cmvPeriod.openingStockValue,
      purchasesValue: state.finance.cmvPeriod.purchasesValue,
      closingStockValue: state.finance.cmvPeriod.closingStockValue,
      revenueValue: state.finance.cmvPeriod.revenueValue,
      theoreticalCmvValue: state.finance.cmvPeriod.theoreticalCmvValue,
      registeredWasteValue: totalWasteMonth,
      cancellationsValue: state.finance.monthCancellations,
      targetCmvPct: state.store.cmvTargetPct,
    });
  }, [state.finance, state.store.cmvTargetPct, totalWasteMonth]);

  if (activeUser.role === "staff") {
    return (
      <div className="rounded-3xl bg-white border border-[#E5DFD4] p-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-base font-extrabold text-stone-900">Painel Financeiro Restrito</h2>
        <p className="text-xs text-stone-600 max-w-xs mx-auto">
          Faturamento, CMV e Contas a Pagar são visíveis apenas para os perfis <strong>Dono</strong> e{" "}
          <strong>Gerente</strong> (protegido por RLS no Supabase).
        </p>
      </div>
    );
  }

  const dailyGoalPct = Math.min(
    100,
    Math.round((state.finance.todayRevenue / Math.max(1, state.store.dailyRevenueGoal)) * 100)
  );
  const monthlyGoalPct = Math.min(
    100,
    Math.round((state.finance.monthRevenue / Math.max(1, state.store.monthlyRevenueGoal)) * 100)
  );

  const unpaidPayables = state.cashFlows.filter((cf) => !cf.isEarning && !cf.paid);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-stone-900">CMV, Faturamento & Cozinha</h2>
        <p className="text-xs text-stone-500">
          Indicadores ao vivo da API Takeat + fechamento de margem da hamburgueria.
        </p>
      </div>

      {/* Bloco 1: Faturamento Hoje & Mês */}
      <section className="rounded-3xl bg-[#161514] text-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-300 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Faturamento Hoje (Takeat Realtime)
            </p>
            <p className="mt-1 text-2xl font-mono font-extrabold tabular-nums">
              {formatBRL(state.finance.todayRevenue)}
            </p>
            <p className="text-xs text-stone-400">
              {state.finance.todayOrders} pedidos · Ticket médio{" "}
              <span className="font-mono text-stone-200">{formatBRL(state.finance.todayAvgTicket)}</span>
            </p>
          </div>
          <span className="rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono font-bold whitespace-nowrap shrink-0">
            {dailyGoalPct}% meta
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-stone-400">
            <span>Meta do dia: {formatBRL(state.store.dailyRevenueGoal)}</span>
            <span>Cancelamentos hoje: {formatBRL(state.finance.todayCancellations)}</span>
          </div>
          <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${dailyGoalPct}%` }} />
          </div>
        </div>

        <div className="pt-3 border-t border-stone-800 flex items-center justify-between text-xs">
          <div>
            <p className="text-stone-400">Acumulado do Mês</p>
            <p className="font-mono text-base font-extrabold text-white">
              {formatBRL(state.finance.monthRevenue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-stone-400">Meta Mensal ({monthlyGoalPct}%)</p>
            <p className="font-mono text-xs font-bold text-orange-300">
              {formatBRL(state.store.monthlyRevenueGoal)}
            </p>
          </div>
        </div>
      </section>

      {/* Bloco 2: CMV Real vs CMV Teórico + Gap */}
      <section className="rounded-3xl bg-white border border-[#E5DFD4] p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-orange-600" />
              CMV Real × CMV Teórico
            </h3>
            <p className="text-[11px] text-stone-500">{state.finance.cmvPeriod.label}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditingCmv((v) => !v)}
            className="rounded-xl bg-stone-100 text-stone-800 px-2.5 py-1.5 text-[11px] font-bold"
          >
            {editingCmv ? "Fechar" : "Ajustar Estoque/Compras"}
          </button>
        </div>

        {editingCmv && (
          <div className="rounded-2xl bg-stone-50 border border-stone-200 p-3 space-y-2">
            <p className="text-[11px] font-bold text-stone-700">
              Fórmula: CMV Real = Estoque Inicial + Compras (NF-e) − Estoque Final
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-stone-500">Est. Inicial</label>
                <input
                  type="number"
                  value={openingInput}
                  onChange={(e) => setOpeningInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500">Compras NF-e</label>
                <input
                  type="number"
                  value={purchasesInput}
                  onChange={(e) => setPurchasesInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500">Est. Final</label>
                <input
                  type="number"
                  value={closingInput}
                  onChange={(e) => setClosingInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                updateCmvPeriodValues({
                  openingStockValue: Number(openingInput) || 0,
                  purchasesValue: Number(purchasesInput) || 0,
                  closingStockValue: Number(closingInput) || 0,
                });
                setEditingCmv(false);
              }}
              className="w-full rounded-xl bg-stone-900 text-white py-2 text-xs font-bold"
            >
              Recalcular CMV Real
            </button>
          </div>
        )}

        {/* 3 cartões comparativos */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-stone-50 border border-stone-200 p-2.5 text-center">
            <p className="text-[10px] font-bold uppercase text-stone-500">Meta Loja</p>
            <p className="mt-1 text-lg font-mono font-extrabold text-stone-900">
              {formatPct(state.store.cmvTargetPct)}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-2.5 text-center">
            <p className="text-[10px] font-bold uppercase text-emerald-700">Teórico (Fichas)</p>
            <p className="mt-1 text-lg font-mono font-extrabold text-emerald-800">
              {formatPct(cmv.theoreticalCmvPct)}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-2.5 text-center ${
              cmv.healthStatus === "critical"
                ? "bg-red-50 border-red-300"
                : cmv.healthStatus === "warning"
                  ? "bg-amber-50 border-amber-300"
                  : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <p className="text-[10px] font-bold uppercase text-stone-700">CMV Real</p>
            <p
              className={`mt-1 text-lg font-mono font-extrabold ${
                cmv.healthStatus === "critical"
                  ? "text-red-700"
                  : cmv.healthStatus === "warning"
                    ? "text-amber-800"
                    : "text-emerald-800"
              }`}
            >
              {formatPct(cmv.realCmvPct)}
            </p>
          </div>
        </div>

        {/* Diagnóstico do Gap */}
        <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between font-extrabold text-amber-950">
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-700" />
              Gap de CMV (Vazamento de Margem)
            </span>
            <span className="font-mono text-red-700">
              +{formatPct(cmv.gapPctPoints)} ({formatBRL(cmv.gapValue)})
            </span>
          </div>
          <div className="flex justify-between text-stone-700">
            <span>• Desperdício registrado no app</span>
            <span className="font-mono font-bold">{formatBRL(totalWasteMonth)}</span>
          </div>
          <div className="flex justify-between text-stone-700">
            <span>• Cancelamentos no Takeat (est. insumo)</span>
            <span className="font-mono font-bold">{formatBRL(state.finance.monthCancellations * 0.35)}</span>
          </div>
          <div className="flex justify-between text-red-800 font-bold">
            <span>• Vazamento invisível (porcionamento / inflação / furo)</span>
            <span className="font-mono">{formatBRL(cmv.unexplainedLeakValue)}</span>
          </div>
        </div>
      </section>

      {/* Bloco 3: Canais & Pagamentos */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
            Vendas por Canal (Takeat)
          </h3>
          {state.finance.channels.map((c) => (
            <div key={c.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-stone-800">{c.name}</span>
                <span className="font-mono font-bold text-stone-900">
                  {c.pct}% · {formatBRL(c.value)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5 text-orange-600" />
            Formas de Pagamento
          </h3>
          {state.finance.paymentMethods.map((pm) => (
            <div key={pm.name} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-700">{pm.name}</span>
              <span className="font-mono font-bold text-stone-900">
                {pm.pct}% · {formatBRL(pm.value)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Bloco 4: Curva ABC & Margem por Produto (Fichas Técnicas) */}
      <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
          Curva ABC & Margem por Ficha Técnica (Takeat)
        </h3>
        <div className="space-y-2">
          {state.menuProducts.map((prod) => {
            const cmvItemPct = (prod.technicalSheetCost / Math.max(0.01, prod.price)) * 100;
            const margin = prod.price - prod.technicalSheetCost;
            return (
              <div
                key={prod.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 border border-stone-200/70"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-stone-900 text-orange-300 px-1.5 py-0.5 text-[10px] font-mono font-bold">
                      {prod.abcClass}
                    </span>
                    <p className="text-xs font-extrabold text-stone-900 truncate">{prod.name}</p>
                  </div>
                  <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                    Venda {formatBRL(prod.price)} · Ficha {formatBRL(prod.technicalSheetCost)} · {prod.soldMonth} un/mês
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono font-extrabold text-emerald-700">
                    +{formatBRL(margin)}
                  </p>
                  <p
                    className={`text-[10px] font-mono font-bold ${
                      cmvItemPct > 33 ? "text-red-700" : "text-stone-500"
                    }`}
                  >
                    CMV {formatPct(cmvItemPct)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bloco 5: Pulso da Cozinha (KDS) & Avaliações */}
      <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5">
            <ChefHat className="h-4 w-4 text-orange-600" />
            Cozinha (KDS Takeat) & Avaliações
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap shrink-0">
            <Star className="h-3 w-3 fill-amber-500 text-amber-500 shrink-0" />
            {state.ratings.averageScore.toFixed(1)} ({state.ratings.totalReviews})
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-200/70">
            <p className="text-[10px] font-bold text-stone-500 uppercase">Tempo Médio</p>
            <p className="mt-0.5 text-sm font-mono font-extrabold text-stone-900">
              {formatDuration(state.kds.avgPrepSeconds)}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-200/70">
            <p className="text-[10px] font-bold text-stone-500 uppercase">Meta Cozinha</p>
            <p className="mt-0.5 text-sm font-mono font-extrabold text-emerald-700">
              {formatDuration(state.store.kdsTargetSeconds)}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-200/70">
            <p className="text-[10px] font-bold text-stone-500 uppercase">Na Meta</p>
            <p className="mt-0.5 text-sm font-mono font-extrabold text-orange-600">
              {formatPct(state.kds.goalCompliancePct)}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {state.kds.stations.map((st) => (
            <div key={st.name} className="flex items-center justify-between text-xs py-1">
              <span className="font-bold text-stone-800 flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-stone-400" />
                {st.name}
              </span>
              <span
                className={`font-mono font-extrabold px-2 py-0.5 rounded-lg ${
                  st.status === "warning"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {formatDuration(st.avgSeconds)}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-stone-100 space-y-1.5">
          {state.ratings.recent.map((rev) => (
            <div key={rev.id} className="rounded-xl bg-stone-50 p-2.5 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-stone-700">{rev.channel}</span>
                <span className="text-amber-600">{"★".repeat(rev.score)}</span>
              </div>
              <p className="text-stone-600 mt-0.5">“{rev.comment}”</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bloco 6: Contas a Pagar Próximas (Takeat Cash Flows) */}
      {activeUser.role === "owner" && (
        <section className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-orange-600" />
              Contas a Pagar Próximas ({unpaidPayables.length} em aberto)
            </h3>
            <span className="text-[10px] font-bold text-stone-400">Exclusivo Dono</span>
          </div>

          <div className="space-y-2">
            {state.cashFlows.map((cf) => (
              <div
                key={cf.id}
                className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
                  cf.paid ? "bg-emerald-50/40 border-emerald-200" : "bg-white border-stone-200"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-stone-900 truncate">{cf.description}</p>
                  <p className="text-[10px] text-stone-500">
                    Venc.: <span className="font-mono font-bold">{cf.dueDate}</span> · {cf.category}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs font-extrabold text-stone-900">
                    {formatBRL(cf.value)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCashFlowPaid(cf.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      cf.paid
                        ? "bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"
                        : "bg-stone-900 text-white"
                    }`}
                  >
                    {cf.paid ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Pago
                      </>
                    ) : (
                      "Dar baixa"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
