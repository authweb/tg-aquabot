import { yclients } from "./client.js";

function phoneVariants(phone) {
    const digits = phone.replace(/\D/g, "");
    const v = new Set();

    // как пришло (обычно +7...)
    v.add(phone);

    // только цифры
    if (digits) v.add(digits);

    // 8XXXXXXXXXX
    if (digits.startsWith("7") && digits.length === 11) v.add("8" + digits.slice(1));

    // +7XXXXXXXXXX
    if (digits.startsWith("7") && digits.length === 11) v.add("+7" + digits.slice(1));

    return Array.from(v);
}

export async function findClientByPhone({ companyId, phone }) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return null;

    try {
        const payload = {
            page: 1,
            page_size: 10,
            operation: "AND",
            fields: ["id", "name"],
            filters: [
                { type: "quick_search", state: { value: digits } }
            ],
        };

        const { data } = await yclients.post(
            `/company/${companyId}/clients/search`,
            payload
        );

        const items = data?.data || [];
        if (Array.isArray(items) && items.length > 0) {
            return { id: items[0].id, raw: items[0] };
        }
        return null;
    } catch (e) {
        const status = e?.response?.status;
        console.warn("[YCLIENTS] search error", status, e?.response?.data || e.message);
        return null;
    }
}
