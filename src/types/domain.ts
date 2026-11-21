export type UserRole = "owner" | "manager" | "staff";

export type ShiftName = "morning" | "night";

export type RoutineCategory =
  | "opening"
  | "pre_service"
  | "operation"
  | "closing"
  | "5s_cleaning"
  | "temperature_pvps"
  | "periodic";

export type RecurrenceKind = "daily" | "weekly" | "biweekly" | "monthly";

export type RoutineTrafficStatus = "completed" | "on_track" | "due_soon" | "late";

export interface StoreConfig {
  id: string;
  name: string;
  subtitle: string;
  dailyRevenueGoal: number;
  monthlyRevenueGoal: number;
  cmvTargetPct: number;
  wasteTargetPct: number;
  kdsTargetSeconds: number;
  min5sScore: number;
  lateEscalationMinutes: number;
  takeatMode: "demo" | "live";
  takeatConnected?: boolean;
  takeatRestaurantId: number | null;
  takeatRestaurantName: string;
  takeatLastSyncAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  station: string;
  phone: string;
  active: boolean;
}

export interface RoutineItem {
  id: string;
  label: string;
  instructions?: string;
  inputType: "check" | "number_range" | "text" | "photo";
  minValue?: number;
  maxValue?: number;
  unit?: string;
  photoRequired: boolean;
  weight: number;
  // Estado da resposta atual
  checked: boolean;
  numericValue?: number | null;
  textValue?: string;
  photoDataUrl?: string | null;
  isNonCompliant: boolean;
  answeredAt?: string;
  answeredBy?: string;
}

export interface RoutineRun {
  id: string;
  templateId: string;
  title: string;
  description: string;
  category: RoutineCategory;
  shift: ShiftName | "all";
  station: string;
  recurrence: RecurrenceKind;
  dueTime: string; // HH:mm
  graceMinutes: number;
  assignedRole: UserRole;
  status: "pending" | "in_progress" | "completed";
  completedAt?: string;
  completedBy?: string;
  items: RoutineItem[];
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  whatsapp: string;
  contactName: string;
  deliveryDays: string;
}

export interface InventoryItem {
  id: string;
  takeatId: number;
  kind: "input" | "intermediary";
  name: string;
  unit: string;
  quantity: number;
  minimumStock: number;
  idealStock: number;
  unitaryPrice: number;
  previousUnitPrice: number;
  stockVersion: string;
  storageArea: "Câmara Fria" | "Freezer" | "Estoque Seco" | "Linha de Montagem" | "Bebidas" | "Embalagens";
  supplierId: string;
  isCritical: boolean;
  yield?: number | null;
  recipe?: string | null;
  linkedMenuProductIds: number[];
}

export type WasteReason =
  | "burn_prep_error"
  | "expired_pvps"
  | "dropped_damaged"
  | "supplier_quality"
  | "staff_meal_comp"
  | "closing_leftover";

export interface WasteLog {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: WasteReason;
  shift: ShiftName;
  notes?: string;
  photoDataUrl?: string | null;
  loggedBy: string;
  loggedAt: string;
}

export interface StockCountRecord {
  id: string;
  title: string;
  blindMode: boolean;
  idempotencyKey: string;
  status: "synced" | "conflict_409" | "draft";
  countedBy: string;
  countedAt: string;
  totalDivergenceCost: number;
  items: {
    inventoryItemId: string;
    takeatId: number;
    kind: "input" | "intermediary";
    itemName: string;
    unit: string;
    theoreticalQty: number;
    countedQty: number;
    registeredWasteQty: number;
    invisibleDivergenceQty: number;
    invisibleDivergenceCost: number;
    expectedStockVersion: string;
    newStockVersion?: string;
    status: "synced" | "conflict_409";
    conflictMessage?: string;
  }[];
}

export interface TakeatMenuProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  deliveryPrice: number;
  technicalSheetCost: number;
  soldToday: number;
  soldMonth: number;
  abcClass: "A" | "B" | "C";
  available: boolean;
  availableInDelivery: boolean;
}

export interface ReceivedNfe {
  id: number;
  number: string;
  issuerName: string;
  issuerCnpj: string;
  issuedAt: string;
  totalAmount: number;
  manifestation: "confirmacao" | "ciencia" | "pendente";
  checkedAtReceiving: boolean;
  receivingTemperatureC?: number;
  receivingNotes?: string;
  items: {
    name: string;
    inventoryItemId?: string;
    quantity: number;
    unit: string;
    invoicedUnitPrice: number;
    previousUnitPrice: number;
  }[];
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: "draft" | "sent_whatsapp" | "received" | "received_with_issue";
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  totalEstimated: number;
  items: {
    inventoryItemId: string;
    name: string;
    unit: string;
    suggestedQty: number;
    orderedQty: number;
    unitPrice: number;
  }[];
}

export interface Equipment {
  id: string;
  name: string;
  area: string;
  model: string;
  status: "operational" | "attention" | "down";
  preventiveIntervalDays: number;
  lastMaintenanceAt: string;
  nextMaintenanceAt: string;
  technicianName: string;
  technicianWhatsapp: string;
  accumulatedCost: number;
}

export interface MaintenanceTask {
  id: string;
  equipmentId: string;
  equipmentName: string;
  type: "preventive" | "corrective";
  priority: "stopped_operation" | "urgent" | "normal";
  status: "open" | "in_progress" | "waiting_parts" | "done";
  title: string;
  description: string;
  dueDate: string;
  cost: number;
  photoDataUrl?: string | null;
  openedBy: string;
  createdAt: string;
  completedAt?: string;
}

export type IncidentCategory =
  | "team"
  | "customer"
  | "supplier"
  | "delivery"
  | "equipment"
  | "food_safety"
  | "cashier"
  | "other";

export interface Incident {
  id: string;
  category: IncidentCategory;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  title: string;
  description: string;
  shift: ShiftName;
  photoDataUrl?: string | null;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ActionPlan {
  id: string;
  title: string;
  whyReason: string;
  howSteps: string;
  originType: "manual" | "incident" | "checklist" | "waste" | "cmv" | "maintenance";
  originId?: string;
  ownerName: string;
  dueDate: string;
  estimatedCost: number;
  status: "todo" | "doing" | "done";
  evidencePhotoUrl?: string | null;
  createdAt: string;
  completedAt?: string;
}

export interface ShiftHandover {
  id: string;
  date: string;
  fromShift: ShiftName;
  createdBy: string;
  summary: string;
  pendingAlerts: string[];
  cashOk: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface FinancialCashFlow {
  id: number;
  description: string;
  category: string;
  providerName: string;
  value: number;
  isEarning: boolean;
  paid: boolean;
  dueDate: string;
}

export interface KdsSnapshot {
  avgPrepSeconds: number;
  medianPrepSeconds: number;
  goalCompliancePct: number;
  stations: {
    name: string;
    avgSeconds: number;
    ordersCount: number;
    status: "ok" | "warning" | "critical";
  }[];
  detractors: {
    productName: string;
    avgSeconds: number;
    sampleSize: number;
  }[];
}

export interface RatingsSnapshot {
  averageScore: number;
  totalReviews: number;
  recent: {
    id: string;
    channel: string;
    score: number;
    comment: string;
    date: string;
  }[];
}

export interface RevenueAndCmvSnapshot {
  todayRevenue: number;
  todayOrders: number;
  todayAvgTicket: number;
  todayCancellations: number;
  openCashRegisters: { id: number; name: string; openedAt: string; balance: number }[];
  monthRevenue: number;
  monthOrders: number;
  monthCancellations: number;
  channels: { name: string; group: "presencial" | "delivery_takeat" | "marketplaces"; value: number; pct: number }[];
  paymentMethods: { name: string; value: number; pct: number }[];
  cmvPeriod: {
    label: string;
    openingStockValue: number;
    purchasesValue: number;
    closingStockValue: number;
    revenueValue: number;
    theoreticalCmvValue: number;
  };
}

export interface AppState {
  store: StoreConfig;
  activeUserId: string;
  team: TeamMember[];
  routines: RoutineRun[];
  suppliers: Supplier[];
  inventory: InventoryItem[];
  wasteLogs: WasteLog[];
  stockCounts: StockCountRecord[];
  menuProducts: TakeatMenuProduct[];
  receivedNfes: ReceivedNfe[];
  purchaseOrders: PurchaseOrder[];
  equipments: Equipment[];
  maintenanceTasks: MaintenanceTask[];
  incidents: Incident[];
  actionPlans: ActionPlan[];
  handovers: ShiftHandover[];
  cashFlows: FinancialCashFlow[];
  kds: KdsSnapshot;
  ratings: RatingsSnapshot;
  finance: RevenueAndCmvSnapshot;
  syncLogs: { id: string; resource: string; status: "ok" | "conflict_409" | "error"; message: string; at: string }[];
}
