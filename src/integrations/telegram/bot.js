// src/integrations/telegram/bot.js
import { registerCommands } from "./handlers/commands.handler.js";
import { registerContactFlow } from "./handlers/contact.handler.js";
import { registerCallbacks } from "./handlers/callbacks.handler.js";

export function buildTelegramBot(bot) {
  registerCommands(bot);
  registerContactFlow(bot);
  registerCallbacks(bot);

  bot.catch((err) => {
    console.error("[BOT ERROR]", err);
  });

  return bot;
}
