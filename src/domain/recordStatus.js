export const INTERNAL_STATUS = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
});

export const YCLIENTS_STATUS_MAP = Object.freeze({
  [INTERNAL_STATUS.PENDING]: 0,
  [INTERNAL_STATUS.CONFIRMED]: 1,
  [INTERNAL_STATUS.CANCELLED]: 2,
});

export function mapYclientsToInternal({ attendance, deleted }) {
  if (deleted === true || Number(attendance) === YCLIENTS_STATUS_MAP.cancelled) {
    return INTERNAL_STATUS.CANCELLED;
  }
  if (Number(attendance) === YCLIENTS_STATUS_MAP.confirmed) {
    return INTERNAL_STATUS.CONFIRMED;
  }
  return INTERNAL_STATUS.PENDING;
}

export function mapInternalToYclientsAttendance(internalStatus) {
  return YCLIENTS_STATUS_MAP[internalStatus] ?? YCLIENTS_STATUS_MAP.pending;
}
