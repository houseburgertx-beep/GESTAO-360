import type { Supplier } from "@/types/domain";
import type { PurchaseSuggestion } from "./calculations";
import { formatBRL, formatQty } from "@/lib/utils";

/**
 * Monta mensagem pronta para WhatsApp de pedido de reposição por fornecedor.
 */
export function buildWhatsAppPurchaseMessage(
  storeName: string,
  supplier: Supplier,
  items: PurchaseSuggestion[],
  dateLabel: string
): string {
  const lines = [
    `Olá ${supplier.contactName || supplier.name}! Tudo bem?`,
    `Segue pedido de reposição da *${storeName}* (${dateLabel}):`,
    "",
    ...items.map(
      (item, idx) =>
        `${idx + 1}. *${item.name}* — ${formatQty(item.suggestedQty, item.unit)}`
    ),
    "",
    `Total estimado: ${formatBRL(items.reduce((acc, i) => acc + i.estimatedCost, 0))}`,
    "Por favor, confirmar previsão de entrega e envio da NF-e. Obrigado!",
  ];
  return lines.join("\n");
}

export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  const cleanPhone = phoneDigits.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
