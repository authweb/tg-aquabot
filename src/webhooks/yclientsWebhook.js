// src/webhooks/yclientsWebhook.js
import { handleRecordEvent } from "./recordHandlers.js";

export async function handleYclientsWebhook({ body, bot }) {
    if (!body?.resource) return;

    switch (body.resource) {
        case "record":
            await handleRecordEvent({ body, bot });
            break;

        default:
            console.log("[WEBHOOK] unsupported resource:", body.resource);
    }

    console.log("[WEBHOOK IN]", {
        resource: body?.resource,
        status: body?.status,
        company_id: body?.company_id,
        resource_id: body?.resource_id,
        phone: body?.data?.client?.phone,
    });
}
