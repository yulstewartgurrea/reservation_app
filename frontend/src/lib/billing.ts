/**
 * Commission / service-fee copy.
 *
 * The exact rate isn't exposed via the public API, so we keep the
 * customer/owner-facing wording in one place. If the platform rate changes,
 * update `SERVICE_FEE_RATE_LABEL` here and nowhere else.
 */

export const SERVICE_FEE_RATE_LABEL = "15%";

/** One-liner shown on the billing empty state. */
export const SERVICE_FEE_HINT = `A ${SERVICE_FEE_RATE_LABEL} service fee applies to completed bookings, billed monthly.`;

/** Longer, non-dismissable notice shown on the shop create flow. */
export const SERVICE_FEE_TERMS = `The platform charges a ${SERVICE_FEE_RATE_LABEL} service fee on completed bookings. It's billed monthly as a single invoice you can pay online or by bank / GCash. Pay-on-arrival walk-ins are never charged.`;
