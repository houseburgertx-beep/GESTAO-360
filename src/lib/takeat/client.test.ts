import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllTakeatPages,
  resetTakeatTokenCacheForTests,
  takeatClient,
} from "./client";
import { TakeatApiError } from "./types";

describe("Takeat API Client (Contratos Oficiais)", () => {
  beforeEach(() => {
    resetTakeatTokenCacheForTests();
    process.env.TAKEAT_API_KEY = "tk_test_dummy_for_unit_test";
    process.env.TAKEAT_RESTAURANT_ID = "85";
  });

  it("troca API key em POST /oauth/token e percorre todas as páginas até has_more=false", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "jwt_mock_1",
            refresh_token: "ref_mock_1",
            token_type: "Bearer",
            expires_in: 900,
            scope: "inputs:read",
          }),
          { status: 200 }
        );
      }

      if (url.includes("offset=100")) {
        return new Response(
          JSON.stringify({
            data: [{ id: 2, name: "Pão Brioche" }],
            pagination: { count: 1, limit: 100, total: 2, has_more: false, next: null },
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: [{ id: 1, name: "Blend 160g" }],
          pagination: { count: 1, limit: 100, total: 2, has_more: true, next: { offset: 100 } },
        }),
        { status: 200 }
      );
    });

    const result = await fetchAllTakeatPages<{ id: number; name: string }>(
      "/v2/inventory/inputs",
      undefined,
      { fetchImpl: mockFetch as unknown as typeof fetch }
    );

    expect(result.complete).toBe(true);
    expect(result.pagesFetched).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 token + 2 páginas
  });

  it("expõe conflito HTTP 409 em contagem de estoque sem reenviar automaticamente", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "jwt_mock_2",
            refresh_token: "ref_mock_2",
            token_type: "Bearer",
            expires_in: 900,
            scope: "inputs:stock:write",
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          key: "inventory_update_conflict",
          message: "Saldo alterado após leitura de stock_version.",
        }),
        { status: 409 }
      );
    });

    await expect(
      takeatClient.registerInputCountsBulk(
        [
          {
            id: 10,
            quantidade: "12.500",
            expected_stock_version: "42",
            counted_at: "2026-11-20T15:00:00Z",
            reason: "Contagem de fechamento",
          },
        ],
        "cnt_idemp_001",
        85,
        mockFetch as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      name: "TakeatApiError",
      status: 409,
      isConflict409: true,
      code: "inventory_update_conflict",
    } satisfies Partial<TakeatApiError>);

    // Confirma que NÃO fez retry automático em cima do 409
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
