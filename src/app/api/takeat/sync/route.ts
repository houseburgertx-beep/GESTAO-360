import { NextResponse } from "next/server";
import { getTakeatRuntimeMode, takeatClient } from "@/lib/takeat/client";

export async function POST() {
  const mode = getTakeatRuntimeMode();
  const syncedAt = new Date().toISOString();

  if (mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      ok: true,
      syncedAt,
      summary: {
        inputsCount: 11,
        intermediariesCount: 4,
        nfesCount: 3,
        realtimeRevenueChecked: true,
        kdsChecked: true,
      },
      message: "Sincronização simulada concluída (configure TAKEAT_MODE=live e TAKEAT_API_KEY no servidor para produção).",
    });
  }

  try {
    const today = syncedAt.slice(0, 10);
    const startWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const endWindow = syncedAt.slice(0, 19);

    const [inputsPage, intermediariesPage, realtimeToday, nfes, kdsOverview] = await Promise.all([
      takeatClient.listInputs(),
      takeatClient.listIntermediaries(),
      takeatClient.getRealtimeToday(),
      takeatClient.listReceivedNfes(startWindow, endWindow, true),
      takeatClient.getKdsOverview(today, today),
    ]);

    return NextResponse.json({
      mode: "live",
      ok: true,
      syncedAt,
      complete: inputsPage.complete && intermediariesPage.complete,
      summary: {
        inputsCount: inputsPage.items.length,
        intermediariesCount: intermediariesPage.items.length,
        nfesCount: nfes.length,
        realtimeRevenueChecked: Boolean(realtimeToday),
        kdsChecked: Boolean(kdsOverview),
      },
      data: {
        inputs: inputsPage.items,
        intermediaries: intermediariesPage.items,
        realtimeToday,
        nfes,
        kdsOverview,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar com a API Takeat.";
    return NextResponse.json({ mode: "live", ok: false, error: message, syncedAt }, { status: 502 });
  }
}
