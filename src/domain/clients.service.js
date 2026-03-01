import { findClientByPhone } from "../integrations/yclients/clients.service.js";

export async function findOrCreateClientByPhone({ companyId, phone }) {
  // Пока создание клиента не реализовано в YCLIENTS API-клиенте,
  // поэтому возвращаем найденного клиента или null.
  return findClientByPhone({ companyId, phone });
}
