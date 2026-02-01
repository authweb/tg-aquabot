// src/yclients/clients.js
import axios from "axios";
import { env } from "../config/env.js";

export const yclients = axios.create({
    baseURL: "https://api.yclients.com/api/v1",
    timeout: 15_000,
    headers: {
        Authorization: `Bearer ${env.yclientsPartnerToken}, User ${env.yclientsUserToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.yclients.v2+json",
    },
});
