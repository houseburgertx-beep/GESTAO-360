import { NextResponse } from "next/server";
import { z } from "zod";
import { takeatClient } from "@/lib/takeat/client";
import { TakeatApiError } from "@/lib/takeat/types";

const countBatchSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  reason: z.string().trim().min(1).max(255),
  countedAt: z.string().datetime(),
  items: z
    .array(
      z.object({
        takeatId: z.number().int().positive(),
        kind: z.enum(["input", "intermediary"]),
        countedQty: z.number().min(0),
        expectedStockVersion: z.string().regex(/^(?:0|[1-9]\d*)$/),
      })
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  let parsed;
  try {
    const json = await request.json();
    parsed = countBatchSchema.parse(json);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Payload de contagem inválido.", details: String(error) },
      { status: 400 }
    );
  }

  try {
    const inputItems = parsed.items
      .filter((i) => i.kind === "input")
      .map((i) => ({
        id: i.takeatId,
        quantidade: String(i.countedQty),
        expected_stock_version: i.expectedStockVersion,
        counted_at: parsed.countedAt,
        reason: parsed.reason,
      }));

    const intermediaryItems = parsed.items
      .filter((i) => i.kind === "intermediary")
      .map((i) => ({
        id: i.takeatId,
        quantidade: String(i.countedQty),
        expected_stock_version: i.expectedStockVersion,
        counted_at: parsed.countedAt,
        reason: parsed.reason,
      }));

    const responses = [];
    if (inputItems.length > 0) {
      responses.push(
        await takeatClient.registerInputCountsBulk(inputItems, `${parsed.idempotencyKey}-inp`)
      );
    }
    if (intermediaryItems.length > 0) {
      responses.push(
        await takeatClient.registerIntermediaryCountsBulk(
          intermediaryItems,
          `${parsed.idempotencyKey}-int`
        )
      );
    }

    return NextResponse.json({ ok: true, mode: "live", responses }, { status: 201 });
  } catch (error) {
    if (error instanceof TakeatApiError && error.isConflict409) {
      return NextResponse.json(
        {
          ok: false,
          isConflict409: true,
          code: error.code || "inventory_update_conflict",
          error:
            "Conflito 409 no Takeat: o estoque foi movimentado após a leitura de stock_version. Atualize o saldo e revise a contagem manualmente.",
        },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Erro ao enviar contagem para o Takeat.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
