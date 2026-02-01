// src/yclients/records.service.js
import { yclients } from "./client.js";

function extractYclientsError(raw) {
    return {
        message: raw?.meta?.message || "Произошла ошибка",
        errors: raw?.meta?.errors,
    };
}

function isIdMissing(raw) {
    const idErr = raw?.meta?.errors?.id;
    return Array.isArray(idErr) && idErr.some((m) => String(m).toLowerCase().includes("id"));
}

function buildUpdatePayloadFromRecord({ rec, recordId, patch = {} }) {
    // Собираем “полный PUT”, как любит Yclients:
    // id, staff_id, client, services, datetime, seance_length + наши изменения в patch
    return {
        id: rec?.id ?? recordId,
        staff_id: rec?.staff_id,
        services: Array.isArray(rec?.services) ? rec.services.map((s) => s?.id).filter(Boolean) : [],
        client: { id: rec?.client?.id },
        seance_length: rec?.seance_length ?? rec?.length,
        datetime: rec?.datetime,
        ...patch,
    };
}

function buildFormFromPayload(payload, recordId) {
    const idStr = String(payload?.id ?? recordId);
    const form = new URLSearchParams();

    form.set("id", idStr);

    if (payload?.staff_id != null) form.set("staff_id", String(payload.staff_id));
    if (payload?.seance_length != null) form.set("seance_length", String(payload.seance_length));
    if (payload?.datetime != null) form.set("datetime", String(payload.datetime));

    const clientId = payload?.client?.id;
    if (clientId != null) {
        form.set("client[id]", String(clientId));
        form.set("client", JSON.stringify({ id: Number(clientId) }));
    }

    const services = Array.isArray(payload?.services) ? payload.services : [];
    services.forEach((sid) => form.append("services[]", String(sid)));
    if (services.length) form.set("services", JSON.stringify(services.map(Number)));

    if (payload?.attendance != null) form.set("attendance", String(payload.attendance));
    if (payload?.visit_attendance != null) form.set("visit_attendance", String(payload.visit_attendance));
    if (payload?.confirmed != null) form.set("confirmed", String(payload.confirmed));

    return form.toString();
}

export async function getRecordFromYclients({ companyId, recordId }) {
    try {
        const r = await yclients.get(`/record/${companyId}/${recordId}`);
        return { ok: r.data?.success === true, status: r.status, raw: r.data, data: r.data?.data };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;
        return {
            ok: false,
            status,
            raw,
            message: raw?.meta?.message || e?.message || "Ошибка запроса",
        };
    }
}

/**
 * Обновление записи:
 * - ТОЛЬКО один URL: PUT /record/{companyId}/{recordId}
 * - 2 контура передачи:
 *    A) JSON (application/json)
 *    B) FORM (x-www-form-urlencoded) — строкой + transformRequest passthrough
 */
export async function updateRecord({ companyId, recordId, payload }) {
    const url = `/record/${companyId}/${recordId}`;

    // -------- A) JSON attempt --------
    try {
        console.log("[YCLIENTS updateRecord] attempt JSON url:", url);
        console.log("[YCLIENTS updateRecord] json payload:", JSON.stringify(payload, null, 2));

        const { data, status } = await yclients.put(url, payload, {
            headers: { "Content-Type": "application/json" },
        });

        if (data?.success === true) {
            return { ok: true, status, raw: data };
        }

        const { message, errors } = extractYclientsError(data);
        console.log("[YCLIENTS updateRecord] json error status:", status);
        console.log("[YCLIENTS updateRecord] json meta.errors:", JSON.stringify(errors, null, 2));

        // если ошибка НЕ про id — смысла в fallback может не быть, но мы всё равно попробуем FORM
        // потому что некоторые инсталляции валидируют PUT record только form-ом.
        console.log("[YCLIENTS updateRecord] json failed -> fallback FORM", {
            idMissing: isIdMissing(data),
        });
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;

        if (raw) {
            const { message, errors } = extractYclientsError(raw);
            console.log("[YCLIENTS updateRecord] json exception status:", status);
            console.log("[YCLIENTS updateRecord] json exception meta.errors:", JSON.stringify(errors, null, 2));
            console.log("[YCLIENTS updateRecord] json exception -> fallback FORM", {
                idMissing: isIdMissing(raw),
            });
        } else {
            console.log("[YCLIENTS updateRecord] json exception:", e?.message || e);
            console.log("[YCLIENTS updateRecord] json no raw -> fallback FORM");
        }
    }

    // -------- B) FORM fallback --------
    try {
        const bodyStr = buildFormFromPayload(payload, recordId);

        console.log("[YCLIENTS updateRecord] attempt FORM url:", url);
        console.log("[YCLIENTS updateRecord] form body:", bodyStr);

        const { data, status } = await yclients.put(url, bodyStr, {
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            // 🔥 критично: не даём axios/интерцепторам превратить строку в объект
            transformRequest: [(d) => d],
        });

        if (data?.success === true) {
            return { ok: true, status, raw: data };
        }

        const { message, errors } = extractYclientsError(data);
        console.log("[YCLIENTS updateRecord] form error status:", status);
        console.log("[YCLIENTS updateRecord] form meta.errors:", JSON.stringify(errors, null, 2));
        return { ok: false, status, message, raw: data };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;

        if (raw) {
            const { message, errors } = extractYclientsError(raw);
            console.log("[YCLIENTS updateRecord] form exception status:", status);
            console.log("[YCLIENTS updateRecord] form exception meta.errors:", JSON.stringify(errors, null, 2));
            return { ok: false, status, message, raw };
        }

        console.log("[YCLIENTS updateRecord] form exception:", e?.message || e);
        return { ok: false, status, message: e?.message || "Ошибка запроса", raw: null };
    }
}

/**
 * Подтверждение записи клиентом.
 * В разных инсталляциях могут хотеть:
 * - только attendance=2
 * - или attendance=2 + visit_attendance=2 (как будто подтвердил и визит)
 *
 * Управляем через env:
 *   YCLIENTS_CONFIRM_SET_VISIT_ATTENDANCE=1  -> ставим оба
 *   иначе -> ставим только attendance
 */
export async function confirmRecordInYclients({ companyId, recordId }) {
    const check = await getRecordFromYclients({ companyId, recordId });
    if (!check.ok) return check;

    const rec = check.data || check.raw?.data;

    const setVisit = String(process.env.YCLIENTS_CONFIRM_SET_VISIT_ATTENDANCE || "").trim() === "1";

    const patch = setVisit
        ? { attendance: 2, visit_attendance: 2 }
        : { attendance: 2 };

    // confirmed не шлём — он у тебя и так авто=1 на create
    const payload = buildUpdatePayloadFromRecord({ rec, recordId, patch });

    const upd = await updateRecord({ companyId, recordId, payload });
    return { ...upd, builtPayload: payload };
}

export async function listRecordsFromYclients({
    companyId,
    clientId,
    startDate, // YYYY-MM-DD
    endDate, // YYYY-MM-DD optional
    count = 10,
    page = 1,
}) {
    try {
        const params = new URLSearchParams();
        if (clientId != null) params.set("client_id", String(clientId));
        if (startDate) params.set("start_date", String(startDate));
        if (endDate) params.set("end_date", String(endDate));
        if (count) params.set("count", String(count));
        if (page) params.set("page", String(page));

        const url = `/records/${companyId}?${params.toString()}`;
        console.log("[YCLIENTS listRecords] url:", url);

        const r = await yclients.get(url);
        return { ok: r.data?.success === true, status: r.status, raw: r.data, data: r.data?.data };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;
        return {
            ok: false,
            status,
            raw,
            message: raw?.meta?.message || e?.message || "Ошибка запроса",
        };
    }
}
