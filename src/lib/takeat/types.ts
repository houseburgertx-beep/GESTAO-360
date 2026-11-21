/**
 * Contratos oficiais verificados na OpenAPI da Takeat (https://public-api.takeat.app).
 */

export interface TakeatTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  access_scope?: "multistore";
  restaurants?: { id: string; fantasy_name: string }[];
  restaurant?: { id: number | string; fantasy_name: string };
}

export interface TakeatPagination {
  count: number;
  limit: number;
  total: number;
  has_more: boolean;
  next: Record<string, string | number> | null;
}

export interface TakeatPaginatedResponse<T> {
  data: T[];
  pagination: TakeatPagination;
}

export interface TakeatManagedInventoryStock {
  id: number;
  restaurant_id: number;
  name: string;
  unidade: string;
  ideal_stock: string | null;
  minimum_stock: string | null;
  quantidade: string;
  stock_version: string;
  unitary_price: string;
  total_value: string;
  is_master: boolean;
  is_multistore: boolean;
  is_multistore_child: boolean;
  cash_flow_category_subcategory_id: number | null;
  yield: string | null;
  recipe: string | null;
  created_at: string;
  updated_at: string;
}

export interface TakeatInventoryCountBatchItem {
  id: number;
  quantidade: string;
  expected_stock_version: string;
  counted_at: string;
  reason: string;
}

export interface TakeatInventoryCountResult {
  count_id: string;
  history_id: number;
  id: number;
  restaurant_id: number;
  unidade: string;
  previous_quantity: string;
  quantidade: string;
  quantity_delta: string;
  unitary_price: string;
  total_value: string;
  stock_version: string;
  counted_at: string;
  applied_at: string;
}

export interface TakeatTechnicalSheet {
  id: number;
  restaurant_id: number;
  kind: "intermediary" | "product" | "complement";
  name: string;
  updated_at: string;
  is_multistore: boolean;
  is_multistore_child: boolean;
  quantity_basis: "batch" | "unit";
  yield: string | null;
  recipe: string | null;
  inputs: { id: number; name: string; unidade: string; quantidade: string; unitary_price: string }[];
  intermediaries: { id: number; name: string; unidade: string; quantidade: string; unitary_price: string }[];
  cost: string;
}

export interface TakeatReceivedNfe {
  id: number;
  restaurant_id: number;
  brand_id: number | null;
  identification: {
    access_key: string;
    number: string;
    series: string | null;
    type: string;
  };
  issuer: {
    name: string;
    document: string;
  };
  amounts: {
    total: string;
  };
  status: {
    situation: string;
    complete: boolean;
  };
  manifestation: {
    type: string | null;
    manifested_at: string | null;
  };
  timestamps: {
    issued_at: string;
    created_at: string;
    updated_at: string;
  };
}

export interface TakeatCashFlowEntry {
  id: number;
  entry_type: string;
  counts_for_result: boolean;
  description: string | null;
  information: string | null;
  value: string;
  is_earning: boolean;
  paid: boolean;
  due_date: string;
  competence_date: string | null;
  paid_at: string | null;
  created_at: string;
  category: string;
  provider: { id?: number; name?: string } | null;
}

export class TakeatApiError extends Error {
  status: number;
  code?: string;
  requiresReauthorization: boolean;
  isConflict409: boolean;

  constructor(
    message: string,
    status: number,
    options?: { code?: string; requiresReauthorization?: boolean }
  ) {
    super(message);
    this.name = "TakeatApiError";
    this.status = status;
    this.code = options?.code;
    this.requiresReauthorization = Boolean(options?.requiresReauthorization);
    this.isConflict409 = status === 409;
  }
}
