export function normalizePhone(raw) {
    if (!raw) return null;

    // Оставляем только цифры
    let digits = String(raw).replace(/\D/g, "");

    // РФ кейсы: 8XXXXXXXXXX -> 7XXXXXXXXXX
    if (digits.length === 11 && digits.startsWith("8")) {
        digits = "7" + digits.slice(1);
    }

    // Если уже 11 и начинается с 7 — ок
    if (digits.length === 11 && digits.startsWith("7")) {
        return "+" + digits;
    }

    // Если пришло 10 цифр (без кода страны) — считаем РФ
    if (digits.length === 10) {
        return "+7" + digits;
    }

    // Иначе вернём как есть в +формате (на будущее)
    return digits.startsWith("+") ? digits : "+" + digits;
}
