import { NextResponse } from "next/server";
import { getTakeatRuntimeMode, takeatClient } from "@/lib/takeat/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export async function GET() {
  const mode = getTakeatRuntimeMode();
  const supabaseConfigured = isSupabaseConfigured();

  if (mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      supabaseConfigured,
      connected: true,
      restaurantId: 85,
      restaurantName: "Brassa Burger House (Modo Demo)",
      endpointsReady: [
        "POST /oauth/token",
        "GET /v2/inventory/inputs",
        "GET /v2/inventory/intermediaries",
        "POST /v1/inventory/inputs/counts/bulk",
        "PATCH /v1/products/{productId}/availability",
        "GET /v1/reports/products/realtime/today",
        "GET /v1/nfe-received",
        "GET /v2/financial/cash-flows",
        "GET /v1/reports/kds/overview",
      ],
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const restaurants = await takeatClient.listRestaurants();
    return NextResponse.json({
      mode: "live",
      supabaseConfigured,
      connected: true,
      restaurants,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao verificar Takeat API.";
    return NextResponse.json(
      {
        mode: "live",
        supabaseConfigured,
        connected: false,
        error: message,
        checkedAt: new Date().toISOString(),
      },
      { status: 502 }
    );
  }
}
