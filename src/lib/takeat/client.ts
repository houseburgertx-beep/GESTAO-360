import {
  TakeatApiError,
  type TakeatCashFlowEntry,
  type TakeatInventoryCountBatchItem,
  type TakeatInventoryCountResult,
  type TakeatManagedInventoryStock,
  type TakeatPaginatedResponse,
  type TakeatReceivedNfe,
  type TakeatTechnicalSheet,
  type TakeatTokenResponse,
} from "./types";

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope: string;
}

// Cache em memória no processo servidor (em produção multi-instância, persistir refresh_token criptografado em public.takeat_connections)
let cachedSession: TokenCache | null = null;

export function getTakeatRuntimeMode(): "live" | "demo" {
  const mode = process.env.TAKEAT_MODE?.toLowerCase();
  if (mode === "live" && process.env.TAKEAT_API_KEY) {
    return "live";
  }
  return "demo";
}

function getBaseUrl(): string {
  return (process.env.TAKEAT_API_BASE_URL || "https://public-api.takeat.app").replace(/\/$/, "");
}

function getConfiguredRestaurantId(override?: number): number | undefined {
  if (typeof override === "number" && override > 0) return override;
  const envId = Number(process.env.TAKEAT_RESTAURANT_ID);
  return Number.isFinite(envId) && envId > 0 ? envId : undefined;
}

/**
 * Emite ou renova access_token (JWT de 15 min) usando POST /oauth/token.
 * Sempre substitui o refresh_token rotativo quando renovado.
 * Nunca aceita nem envia a chave tk_ diretamente como Bearer nas rotas /v1/*.
 */
export async function getTakeatAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAtMs - now > 60_000) {
    return cachedSession.accessToken;
  }

  const baseUrl = getBaseUrl();

  // 1) Tenta renovar com refresh_token rotativo se já houver sessão
  if (cachedSession?.refreshToken) {
    const refreshBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cachedSession.refreshToken,
    });

    const refreshRes = await fetchImpl(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: refreshBody.toString(),
      cache: "no-store",
    });

    if (refreshRes.ok) {
      const tokenData = (await refreshRes.json()) as TakeatTokenResponse;
      cachedSession = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAtMs: now + (tokenData.expires_in || 900) * 1000,
        scope: tokenData.scope,
      };
      return cachedSession.accessToken;
    }

    // Se invalid_grant ou X-OAuth-Recovery: reauthorize, limpa sessão para nova troca de API Key
    cachedSession = null;
  }

  // 2) Primeira troca via grant_type=api_key (sem client_id / client_secret)
  const apiKey = process.env.TAKEAT_API_KEY;
  if (!apiKey) {
    throw new TakeatApiError("TAKEAT_API_KEY não configurada no servidor.", 401);
  }

  const body = new URLSearchParams({
    grant_type: "api_key",
    api_key: apiKey,
  });

  if (process.env.TAKEAT_SCOPES) {
    body.set("scope", process.env.TAKEAT_SCOPES);
  }

  const res = await fetchImpl(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const recovery = res.headers.get("X-OAuth-Recovery") === "reauthorize";
    throw new TakeatApiError(
      `Falha ao autenticar na Takeat API (HTTP ${res.status}).`,
      res.status,
      { requiresReauthorization: recovery }
    );
  }

  const tokenData = (await res.json()) as TakeatTokenResponse;
  cachedSession = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAtMs: now + (tokenData.expires_in || 900) * 1000,
    scope: tokenData.scope,
  };

  return cachedSession.accessToken;
}

export function resetTakeatTokenCacheForTests(): void {
  cachedSession = null;
}

async function takeatRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH";
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
    restaurantId?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<T> {
  const fetchImpl = options?.fetchImpl || fetch;
  const token = await getTakeatAccessToken(fetchImpl);
  const url = new URL(`${getBaseUrl()}${path}`);

  const resolvedRestaurantId = getConfiguredRestaurantId(options?.restaurantId);
  if (resolvedRestaurantId && !options?.query?.restaurant_id) {
    url.searchParams.set("restaurant_id", String(resolvedRestaurantId));
  }

  if (options?.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers || {}),
  };

  const res = await fetchImpl(url.toString(), {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let errMsg = `Erro na API Takeat (HTTP ${res.status})`;
    let errCode: string | undefined;
    try {
      const payload = (await res.json()) as { message?: string; key?: string; error?: string };
      errMsg = payload.message || payload.error || errMsg;
      errCode = payload.key;
    } catch {
      // mantém mensagem padrão
    }
    throw new TakeatApiError(errMsg, res.status, {
      code: errCode,
      requiresReauthorization: res.headers.get("X-OAuth-Recovery") === "reauthorize",
    });
  }

  return (await res.json()) as T;
}

/**
 * Percorre TODAS as páginas de um endpoint V2 paginado seguindo pagination.next
 * até pagination.has_more === false, mantendo filtros e restaurant_id.
 */
export async function fetchAllTakeatPages<T>(
  path: string,
  baseQuery?: Record<string, string | number | boolean | undefined>,
  options?: { restaurantId?: number; maxPages?: number; fetchImpl?: typeof fetch }
): Promise<{ items: T[]; pagesFetched: number; complete: boolean }> {
  const maxPages = options?.maxPages ?? 50;
  const items: T[] = [];
  let nextQuery: Record<string, string | number | boolean | undefined> = { ...(baseQuery || {}) };
  let pagesFetched = 0;
  let complete = true;

  while (pagesFetched < maxPages) {
    const page = await takeatRequest<TakeatPaginatedResponse<T>>(path, {
      method: "GET",
      query: nextQuery,
      restaurantId: options?.restaurantId,
      fetchImpl: options?.fetchImpl,
    });

    items.push(...(page.data || []));
    pagesFetched += 1;

    if (!page.pagination?.has_more || !page.pagination.next) {
      break;
    }

    nextQuery = {
      ...(baseQuery || {}),
      ...page.pagination.next,
    };

    if (pagesFetched >= maxPages) {
      complete = false;
    }
  }

  return { items, pagesFetched, complete };
}

export const takeatClient = {
  listRestaurants(fetchImpl?: typeof fetch) {
    return takeatRequest<{ id: number; fantasy_name: string; active?: boolean }[]>(
      "/v1/restaurants",
      { fetchImpl }
    );
  },

  listInputs(restaurantId?: number, fetchImpl?: typeof fetch) {
    return fetchAllTakeatPages<TakeatManagedInventoryStock>("/v2/inventory/inputs", undefined, {
      restaurantId,
      fetchImpl,
    });
  },

  listIntermediaries(restaurantId?: number, fetchImpl?: typeof fetch) {
    return fetchAllTakeatPages<TakeatManagedInventoryStock>(
      "/v2/inventory/intermediaries",
      undefined,
      { restaurantId, fetchImpl }
    );
  },

  /**
   * Envia contagem física em lote (1 a 100 itens).
   * Requer Idempotency-Key e expected_stock_version.
   * HTTP 409 NÃO é reenviado automaticamente — exige nova leitura e revisão humana.
   */
  registerInputCountsBulk(
    items: TakeatInventoryCountBatchItem[],
    idempotencyKey: string,
    restaurantId?: number,
    fetchImpl?: typeof fetch
  ) {
    return takeatRequest<{ items: TakeatInventoryCountResult[] }>(
      "/v1/inventory/inputs/counts/bulk",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { items },
        restaurantId,
        fetchImpl,
      }
    );
  },

  registerIntermediaryCountsBulk(
    items: TakeatInventoryCountBatchItem[],
    idempotencyKey: string,
    restaurantId?: number,
    fetchImpl?: typeof fetch
  ) {
    return takeatRequest<{ items: TakeatInventoryCountResult[] }>(
      "/v1/inventory/intermediaries/counts/bulk",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { items },
        restaurantId,
        fetchImpl,
      }
    );
  },

  getProductTechnicalSheet(productId: number, restaurantId?: number) {
    return takeatRequest<TakeatTechnicalSheet>(`/v1/products/${productId}/technical-sheet`, {
      restaurantId,
    });
  },

  setProductAvailability(
    productId: number,
    body: { available?: boolean; available_in_delivery?: boolean },
    restaurantId?: number
  ) {
    return takeatRequest(`/v1/products/${productId}/availability`, {
      method: "PATCH",
      body,
      restaurantId,
    });
  },

  getRealtimeToday(restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/products/realtime/today", {
      restaurantId,
    });
  },

  getPeriodProducts(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/products/period/products", {
      query: { start_date: startDate, end_date: endDate, include_today: true },
      restaurantId,
    });
  },

  getPeriodCancellations(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/products/period/cancellations", {
      query: { start_date: startDate, end_date: endDate },
      restaurantId,
    });
  },

  getPaymentsSummary(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/payments/summary", {
      query: { granularity: "daily", start_date: startDate, end_date: endDate },
      restaurantId,
    });
  },

  getPaymentsChannels(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/payments/channels", {
      query: { start_date: startDate, end_date: endDate },
      restaurantId,
    });
  },

  listCashRegisters(restaurantId?: number) {
    return takeatRequest<Record<string, unknown>[]>("/v1/cash-register", { restaurantId });
  },

  listReceivedNfes(startDateIso: string, endDateIso: string, pendente = true, restaurantId?: number) {
    return takeatRequest<TakeatReceivedNfe[]>("/v1/nfe-received", {
      query: { start_date: startDateIso, end_date: endDateIso, pendente },
      restaurantId,
    });
  },

  getReceivedNfeDetail(nfeReceivedId: number, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>(`/v1/nfe-received/info/${nfeReceivedId}`, {
      restaurantId,
    });
  },

  listCashFlows(startDate: string, endDate: string, restaurantId?: number) {
    return fetchAllTakeatPages<TakeatCashFlowEntry>(
      "/v2/financial/cash-flows",
      { start_date: startDate, end_date: endDate },
      { restaurantId }
    );
  },

  getKdsOverview(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/reports/kds/overview", {
      query: { start_date: startDate, end_date: endDate },
      restaurantId,
    });
  },

  getRatings(startDate: string, endDate: string, restaurantId?: number) {
    return takeatRequest<Record<string, unknown>>("/v1/ratings", {
      query: { start_date: startDate, end_date: endDate, page: 1, per_page: 50 },
      restaurantId,
    });
  },
};
