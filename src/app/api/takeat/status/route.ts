import { NextResponse } from "next/server";
import { getTakeatRuntimeMode, takeatClient } from "@/lib/takeat/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export async function GET() {
  const mode = getTakeatRuntimeMode();
  const supabaseConfigured = isSupabaseConfigured();

  try {
    const restaurants = await takeatClient.listRestaurants();
    return NextResponse.json({
      mode,
      supabaseConfigured,
      connected: true,
      restaurants,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao verificar Takeat API.";
    return NextResponse.json(
      {
        mode,
        supabaseConfigured,
        connected: false,
        error: message,
        checkedAt: new Date().toISOString(),
      },
      { status: 502 }
    );
  }
}
