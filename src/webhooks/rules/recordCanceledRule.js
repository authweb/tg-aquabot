function isEmpty(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  return s.length === 0;
}

function safe(value, fallback = "—") {
  return isEmpty(value) ? fallback : String(value);
}

function extractServicesTitles(data) {
  const services = Array.isArray(data?.services) ? data.services : [];
  return services.map(s => s?.title).filter(Boolean);
}

function formatDateTime(body) {
  const d = body?.data;
  if (!d) return { date: "—", time: "—" };

  if (typeof d.date === "string" && d.date.includes(" ")) {
    const [datePart, timePart] = d.date.split(" ");
    return { date: datePart || "—", time: (timePart || "—").slice(0, 5) };
  }

  if (typeof d.datetime === "string" && d.datetime.includes("T")) {
    const [datePart, rest] = d.datetime.split("T");
    const timePart = (rest || "").split("+")[0].split("Z")[0];
    return { date: datePart || "—", time: (timePart || "—").slice(0, 5) };
  }

  return { date: "—", time: "—" };
}

// антиспам: по одному алерту на запись за 30 минут
const sent = new Map();
function wasSentRecently(key, ttlMs = 30 * 60 * 1000) {
  const now = Date.now();
  const prev = sent.get(key);
  if (prev && now - prev < ttlMs) return true;
  sent.set(key, now);

  if (sent.size > 5000) {
    for (const [k, t] of sent) if (now - t > ttlMs) sent.delete(k);
  }
  return false;
}

function isCanceledEvent(body) {
  // 1) явные статусы
  const st = String(body?.status || "").toLowerCase();
  if (["delete", "deleted", "cancel", "canceled", "cancelled", "remove", "removed"].includes(st)) {
    return true;
  }

  // 2) update + флаг deleted=true
  if (st === "update" && body?.data?.deleted === true) {
    return true;
  }

  return false;
}

export async function recordCanceledRule({ body, bot, logger = console }) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    logger.warn("[RULE recordCanceled] TELEGRAM_ADMIN_CHAT_ID not set");
    return;
  }

  if (body?.resource !== "record") return;
  if (!isCanceledEvent(body)) return;

  const companyId = body?.company_id;
  const recordId = body?.resource_id || body?.data?.id;
  const apiId = body?.data?.api_id;

  const key = apiId
    ? `record_canceled:${companyId}:${apiId}`
    : `record_canceled:${companyId}:${recordId}`;

  if (wasSentRecently(key)) return;

  const clientName =
    body?.data?.client?.display_name ||
    body?.data?.client?.name ||
    "не указан";

  const phone = body?.data?.client?.phone;
  const { date, time } = formatDateTime(body);
  const services = extractServicesTitles(body?.data);
  const shortLink = body?.data?.short_link;

  const text = [
    "🔴 Запись отменена",
    `🧾 Record ID: ${safe(recordId)}`,
    `👤 Клиент: ${safe(clientName)}`,
    phone ? `📞 Телефон: ${phone}` : null,
    `📅 Дата: ${date}`,
    `🕒 Время: ${time}`,
    services.length ? `🧼 Услуги: ${services.join(", ")}` : null,
    shortLink ? `🔗 ${shortLink}` : null,
    "",
    "👉 Действие: освободился слот — предложить перенос/перезапись.",
  ].filter(Boolean).join("\n");

  try {
    await bot.api.sendMessage(adminChatId, text, {
      disable_web_page_preview: true,
    });
    logger.info("[RULE recordCanceled] admin notified", { recordId, companyId });
  } catch (e) {
    logger.error("[RULE recordCanceled] send failed", e?.message || e);
  }
}
