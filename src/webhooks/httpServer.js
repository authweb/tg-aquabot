// src/webhooks/httpServer.js
import fs from "fs";
import path from "path";
import express from "express";

import { env } from "../config/env.js";
import { handleYclientsWebhook } from "../integrations/yclients/yclientsWebhook.js";

function dumpWebhook(body) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = env.webhookDumpDir || "/opt/tg-aquabot/webhook-dumps";
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf-8");
    console.log("[WEBHOOK] saved:", file);
}

export function startHttpServer({ bot, register }) {
    const httpApp = express();

    // важно под nginx https -> cookie secure, req.ip и т.п.
    httpApp.set("trust proxy", 1);

    httpApp.use(express.json({ limit: "2mb" }));
    httpApp.use(express.urlencoded({ extended: true }));

    httpApp.post("/yclients/webhook", async (req, res) => {
        console.log("[WEBHOOK IN]", {
            ts: new Date().toISOString(),
            resource: req.body?.resource,
            status: req.body?.status,
            company_id: req.body?.company_id,
            resource_id: req.body?.resource_id,
            phone: req.body?.data?.client?.phone,
        });

        if (env.webhookDumpEnabled) dumpWebhook(req.body);

        res.sendStatus(200);

        try {
            await handleYclientsWebhook({ body: req.body, bot });
        } catch (e) {
            console.error("[WEBHOOK] error", e);
        }
    });

    httpApp.get("/health", (req, res) => res.status(200).send("ok"));

    // ✅ сюда подключаем админку и любые доп. роуты
    if (typeof register === "function") {
        register(httpApp);
    }

    const port = Number(env.webhookPort || process.env.WEBHOOK_PORT || 3000);
    const host = env.webhookHost || "127.0.0.1";

    httpApp.listen(port, host, () => {
        console.log(`[HTTP] Webhook server listening on ${host}:${port}`);
    });

    return httpApp;
}
