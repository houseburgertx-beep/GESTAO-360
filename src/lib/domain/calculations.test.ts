import { describe, expect, it } from "vitest";
import {
  buildPurchaseSuggestions,
  calculateCmvAnalysis,
  calculateInvisibleDivergence,
  calculatePriceInflationPct,
  calculateRoutineScore,
  evaluateRoutineTrafficStatus,
  isNumericAnswerOutOfRange,
} from "./calculations";
import { buildWhatsAppPurchaseMessage, buildWhatsAppUrl } from "./whatsapp";
import type { InventoryItem, RoutineItem } from "@/types/domain";

describe("Motor de Cálculos BrassaOps", () => {
  it("calcula CMV Real, CMV Teórico, Gap e vazamento não explicado corretamente", () => {
    const result = calculateCmvAnalysis({
      openingStockValue: 18000,
      purchasesValue: 48000,
      closingStockValue: 15000,
      revenueValue: 150000,
      theoreticalCmvValue: 43500, // 29%
      registeredWasteValue: 2400,
      cancellationsValue: 1000,
      targetCmvPct: 30,
    });

    // CMV Real = 18000 + 48000 - 15000 = 51000 (34%)
    expect(result.realCmvValue).toBe(51000);
    expect(result.realCmvPct).toBe(34);
    expect(result.theoreticalCmvPct).toBe(29);
    expect(result.gapValue).toBe(7500);
    expect(result.gapPctPoints).toBe(5);
    expect(result.unexplainedLeakValue).toBe(4750);
    expect(result.healthStatus).toBe("critical");
  });

  it("separa desperdício registrado de divergência invisível no estoque", () => {
    // Teórico 20 kg, contado 15 kg -> sumiram 5 kg.
    // 2 kg foram lançados como desperdício -> 3 kg são divergência invisível.
    const res = calculateInvisibleDivergence({
      theoreticalQty: 20,
      countedQty: 15,
      registeredWasteQty: 2,
      unitaryPrice: 38.5,
    });

    expect(res.rawDeltaQty).toBe(-5);
    expect(res.missingQty).toBe(5);
    expect(res.invisibleDivergenceQty).toBe(3);
    expect(res.invisibleDivergenceCost).toBe(115.5);
    expect(res.status).toBe("leak_alert");
  });

  it("marca divergência como explicada quando o desperdício cobre a quebra", () => {
    const res = calculateInvisibleDivergence({
      theoreticalQty: 10,
      countedQty: 8.5,
      registeredWasteQty: 1.5,
      unitaryPrice: 40,
    });

    expect(res.invisibleDivergenceQty).toBe(0);
    expect(res.invisibleDivergenceCost).toBe(0);
    expect(res.status).toBe("explained_waste");
  });

  it("gera sugestões de compra apenas para insumos abaixo do mínimo e ordena por urgência", () => {
    const items: InventoryItem[] = [
      {
        id: "1",
        takeatId: 101,
        kind: "input",
        name: "Pão Brioche",
        unit: "un",
        quantity: 0,
        minimumStock: 60,
        idealStock: 180,
        unitaryPrice: 1.85,
        previousUnitPrice: 1.8,
        stockVersion: "1",
        storageArea: "Estoque Seco",
        supplierId: "sup_padaria",
        isCritical: true,
        linkedMenuProductIds: [1],
      },
      {
        id: "2",
        takeatId: 102,
        kind: "input",
        name: "Batata Pré-Frita 7mm",
        unit: "kg",
        quantity: 12,
        minimumStock: 15,
        idealStock: 45,
        unitaryPrice: 14.5,
        previousUnitPrice: 13.0,
        stockVersion: "2",
        storageArea: "Freezer",
        supplierId: "sup_dist",
        isCritical: true,
        linkedMenuProductIds: [2],
      },
      {
        id: "3",
        takeatId: 201,
        kind: "intermediary",
        name: "Maionese Verde da Casa",
        unit: "kg",
        quantity: 0.5,
        minimumStock: 2,
        idealStock: 5,
        unitaryPrice: 18,
        previousUnitPrice: 18,
        stockVersion: "3",
        storageArea: "Linha de Montagem",
        supplierId: "sup_dist",
        isCritical: false,
        linkedMenuProductIds: [],
      },
    ];

    const suggestions = buildPurchaseSuggestions(items, 1);
    expect(suggestions).toHaveLength(2); // ignora intermediário
    expect(suggestions[0].name).toBe("Pão Brioche");
    expect(suggestions[0].urgency).toBe("rupture");
    expect(suggestions[0].suggestedQty).toBe(180);
    expect(suggestions[1].suggestedQty).toBe(33);
  });

  it("avalia corretamente o semáforo anti-esquecimento das rotinas", () => {
    expect(
      evaluateRoutineTrafficStatus({ status: "completed", dueTime: "10:00", graceMinutes: 30 }, 720)
    ).toBe("completed");
    expect(
      evaluateRoutineTrafficStatus({ status: "pending", dueTime: "11:00", graceMinutes: 30 }, 11 * 60 + 5)
    ).toBe("late");
    expect(
      evaluateRoutineTrafficStatus({ status: "pending", dueTime: "11:00", graceMinutes: 30 }, 10 * 60 + 40)
    ).toBe("due_soon");
    expect(
      evaluateRoutineTrafficStatus({ status: "pending", dueTime: "17:30", graceMinutes: 30 }, 12 * 60)
    ).toBe("on_track");
  });

  it("valida faixa de temperatura e calcula nota ponderada de 5S", () => {
    expect(isNumericAnswerOutOfRange({ inputType: "number_range", minValue: 0, maxValue: 4 }, 6.8)).toBe(true);
    expect(isNumericAnswerOutOfRange({ inputType: "number_range", minValue: 0, maxValue: 4 }, 2.5)).toBe(false);

    const items: RoutineItem[] = [
      { id: "a", label: "A", inputType: "check", photoRequired: false, weight: 3, checked: true, isNonCompliant: false },
      { id: "b", label: "B", inputType: "check", photoRequired: false, weight: 1, checked: true, isNonCompliant: true },
    ];
    expect(calculateRoutineScore(items)).toBe(75);
  });

  it("detecta inflação de preço e formata link WhatsApp", () => {
    expect(calculatePriceInflationPct(32, 36.8)).toBe(15);
    const msg = buildWhatsAppPurchaseMessage(
      "Brassa Burger",
      { id: "s1", name: "Padaria Central", category: "Pães", whatsapp: "+55 (11) 98888-7777", contactName: "Marcos", deliveryDays: "Seg/Qua/Sex" },
      [
        {
          inventoryItemId: "1",
          takeatId: 101,
          name: "Pão Brioche",
          unit: "un",
          supplierId: "s1",
          currentQty: 20,
          minimumStock: 60,
          idealStock: 180,
          suggestedQty: 160,
          unitPrice: 1.85,
          estimatedCost: 296,
          urgency: "critical",
        },
      ],
      "20/11/2026"
    );
    expect(msg).toContain("Pão Brioche");
    expect(msg).toContain("160 un");
    expect(buildWhatsAppUrl("+55 (11) 98888-7777", msg)).toContain("https://wa.me/5511988887777?text=");
  });
});
