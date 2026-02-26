// src/integrations/telegram/keyboards.js
import { Keyboard } from "grammy";

export function contactKeyboard() {
    return new Keyboard().requestContact("📱 Отправить номер телефона").resized();
}
