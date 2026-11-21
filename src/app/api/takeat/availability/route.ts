import { NextResponse } from "next/server";
import { z } from "zod";
import { getTakeatRuntimeMode, takeatClient } from "@/lib/takeat/client";

const availabilitySchema = z.object({
  productId: z.number().int().positive(),
  available: z.boolean().optional(),
  available_in_delivery: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  let parsed;
  try {
    parsed = availabilitySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Dados inválidos.", details: String(error) }, { status: 400 });
  }

  const mode = getTakeatRuntimeMode();
  if (mode === "demo") {
    return NextResponse.json({
      ok: true,
      mode: "demo",
      productId: parsed.productId,
      available: parsed.available,
      available_in_delivery: parsed.available_in_delivery,
      updatedAt: new Date().toISOString(),
    });
  }

  try {
    const result = await takeatClient.setProductAvailability(parsed.productId, {
      available: parsed.available,
      available_in_delivery: parsed.available_in_delivery,
    });
    return NextResponse.json({ ok: true, mode: "live", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar disponibilidade no Takeat.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
