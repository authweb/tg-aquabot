// src/app.js
import { Bot } from "grammy";

import cookieParser from "cookie-parser";
import session from "express-session";

import { env } from "./config/env.js";
import { buildTelegramBot } from "./integrations/telegram/bot.js";
import { startHttpServer } from "./webhooks/httpServer.js";
import { startPendingLinksRecheck } from "./jobs/recheckPendingLinks.js";
import { adminRouter } from "./admin/admin.router.js";

console.log("[ENV CHECK] TELEGRAM_BOT_TOKEN:", Boolean(process.env.TELEGRAM_BOT_TOKEN));
console.log("[ENV CHECK] env.telegramBotToken:", Boolean(env.telegramBotToken));

const bot = buildTelegramBot(new Bot(env.telegramBotToken));

function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`[APP] Received ${signal}, stopping...`);
    try {
      await bot.stop();
    } catch (e) {
      console.warn("[APP] bot.stop error:", e?.message || e);
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

try {
  setupGracefulShutdown();

  // HTTP server (webhook + admin)
  startHttpServer({
    bot,
    register: (app) => {
      // session for admin panel
      app.use(cookieParser());
      app.use(
        session({
          name: "admin.sid",
          secret: env.adminSessionSecret,
          resave: false,
          saveUninitialized: false,
          cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: env.nodeEnv === "production",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          },
        })
      );

      app.use("/admin", adminRouter);
    },
  });

  // Telegram polling
  console.log("[APP] Starting Aquabot...");
  await bot.start();

  // jobs
  startPendingLinksRecheck(bot);

  console.log("[APP] Aquabot started.");
} catch (e) {
  console.error("[APP] fatal error:", e);
  process.exit(1);
}
