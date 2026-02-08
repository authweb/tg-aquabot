const TZ = "Asia/Krasnoyarsk";

function partsInTz(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return parts;
}

export function nextDaily0830KrasnoyarskISO(now = new Date()) {
    const p = partsInTz(now);
    const y = Number(p.year), m = Number(p.month), d = Number(p.day);
    const hh = Number(p.hour), mm = Number(p.minute);

    // "сегодня 08:30" в TZ
    const targetLocal = { y, m, d, hh: 8, mm: 30 };

    // если уже позже 08:30 — берём завтра
    const isPast = (hh > 8) || (hh === 8 && mm >= 30);
    const base = new Date(now);
    if (isPast) base.setUTCDate(base.getUTCDate() + 1);

    const p2 = partsInTz(base);
    const y2 = Number(p2.year), m2 = Number(p2.month), d2 = Number(p2.day);

    // строим ISO через Date в UTC, используя смещение TZ нельзя напрямую — проще:
    // сделаем "локальное время TZ" строкой и дадим Postgres AT TIME ZONE позже.
    // Поэтому возвращаем "YYYY-MM-DD 08:30:00" (как local TZ string).
    const yyyy = String(y2).padStart(4, "0");
    const mm2 = String(m2).padStart(2, "0");
    const dd2 = String(d2).padStart(2, "0");
    return `${yyyy}-${mm2}-${dd2} 08:30:00`;
}
