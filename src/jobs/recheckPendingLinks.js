import { env } from "../config/env.js";
import { getPendingLinks, markClientLinked } from "../db/repos/clientsLinkRepo.js";
import { findClientByPhone } from "../integrations/yclients/clients.service.js";

function toNumberOrString(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function startPendingLinksRecheck(bot) {
    const companyId = Number(env.yclientsCompanyId);
    const intervalSec = Number(process.env.PENDING_RECHECK_INTERVAL_SEC || 120);
    const batchSize = Number(process.env.PENDING_RECHECK_BATCH_SIZE || 20);

    console.log(`[JOB] Pending links recheck: every ${intervalSec}s, batch=${batchSize}`);

    const tick = async () => {
        try {
            const pending = await getPendingLinks({ companyId, limit: batchSize });
            if (!pending.length) return;

            console.log(`[JOB] Pending links found: ${pending.length}`);

            for (const p of pending) {
                // лёгкий троттлинг, чтобы не долбить API
                await sleep(300);

                const found = await findClientByPhone({ companyId, phone: p.phone });

                if (!found?.id) continue;

                const linked = await markClientLinked({
                    companyId,
                    telegramUserId: Number(p.telegram_user_id),
                    yclientsClientId: Number(found.id),
                });

                if (!linked) continue;

                // Клиенту — личное подтверждение
                try {
                    await bot.api.sendMessage(
                        toNumberOrString(p.telegram_chat_id),
                        `✅ Мы нашли вас в системе и подключили уведомления.\nНомер: ${p.phone}`
                    );
                } catch (e) {
                    console.warn("[JOB] client notify failed", e?.message || e);
                }

                // Админу — отчёт
                try {
                    await bot.api.sendMessage(
                        toNumberOrString(env.telegramAdminChatId),
                        "✅ Aquabot: клиент автоматически привязан.\n\n" +
                        `Телефон: ${p.phone}\n` +
                        `Telegram user_id: ${p.telegram_user_id}\n` +
                        `Yclients client_id: ${found.id}\n` +
                        `Компания: ${companyId}`
                    );
                } catch (e) {
                    console.warn("[JOB] admin notify failed", e?.message || e);
                }
            }
        } catch (e) {
            console.error("[JOB] recheck error", e?.response?.data || e?.message || e);
        }
    };

    // первый запуск через 5 секунд (чтобы бот стартанул)
    setTimeout(tick, 5000);

    // и далее по расписанию
    setInterval(tick, intervalSec * 1000);
}
