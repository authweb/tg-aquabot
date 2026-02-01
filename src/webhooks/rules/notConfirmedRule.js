function isConfirmed(value) {
  // confirmed может быть 1/0, true/false, "1"/"0"
  if (value === 1 || value === true || value === "1") return true;
  return false;
}

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

// debounce буфер
const pending = new Map();
// антиспам после отправки
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

export async function notConfirmedRule({ body, bot, logger = console }) {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) {
    logger.warn("[RULE notConfirmed] TELEGRAM_ADMIN_CHAT_ID not set");
    return;
  }

  // только записи
  if (body?.resource !== "record") return;
  if (!["create", "update"].includes(body?.status)) return;

  const confirmed = body?.data?.confirmed;

  // если подтверждена — снимаем pending и выходим
  if (isConfirmed(confirmed)) {
    const companyId = body?.company_id;
    const recordId = body?.resource_id || body?.data?.id;
    const apiId = body?.data?.api_id;
    const key = apiId
      ? `not_confirmed:${companyId}:${apiId}`
      : `not_confirmed:${companyId}:${recordId}`;

    const prev = pending.get(key);
    if (prev?.timer) clearTimeout(prev.timer);
    pending.delete(key);
    return;
  }

  const companyId = body?.company_id;
  const recordId = body?.resource_id || body?.data?.id;
  const apiId = body?.data?.api_id;

  const key = apiId
    ? `not_confirmed:${companyId}:${apiId}`
    : `not_confirmed:${companyId}:${recordId}`;

  if (wasSentRecently(key)) return;

  // debounce: перезапуск таймера на каждое событие
  const prev = pending.get(key);
  if (prev?.timer) clearTimeout(prev.timer);

  const timer = setTimeout(async () => {
    try {
      const entry = pending.get(key);
      pending.delete(key);
      if (!entry?.lastBody) return;

      const latest = entry.lastBody;

      // финальная проверка
      const latestConfirmed = latest?.data?.confirmed;
      if (isConfirmed(latestConfirmed)) return;

      const latestRecordId = latest?.resource_id || latest?.data?.id;

      const clientName =
        latest?.data?.client?.display_name ||
        latest?.data?.client?.name ||
        "не указан";

      const { date, time } = formatDateTime(latest);
      const services = extractServicesTitles(latest?.data);
      const shortLink = latest?.data?.short_link;

      const text = [
        "🟡 Запись не подтверждена",
        `🧾 Record ID: ${safe(latestRecordId)}`,
        `👤 Клиент: ${safe(clientName)}`,
        `📅 Дата: ${date}`,
        `🕒 Время: ${time}`,
        services.length ? `🧼 Услуги: ${services.join(", ")}` : null,
        shortLink ? `🔗 ${shortLink}` : null,
        "",
        "👉 Действие: подтвердить запись (или связаться с клиентом).",
      ].filter(Boolean).join("\n");

      await bot.api.sendMessage(adminChatId, text, {
        disable_web_page_preview: true,
      });

      logger.info("[RULE notConfirmed] admin notified (debounced)", {
        recordId: latestRecordId,
        companyId,
      });
    } catch (e) {
      logger.error("[RULE notConfirmed] send failed (debounced)", e?.message || e);
    }
  }, 8000);

  pending.set(key, { timer, lastBody: body });
}
