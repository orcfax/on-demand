/**
 * ODAPI service pricing constants.
 *
 * CRITICAL: These values MUST stay in sync between client (IOU signing)
 * and server (cost deduction). A mismatch will cause accounting drift.
 *
 * All amounts are in lovelace (1 ADA = 1,000,000 lovelace).
 *
 * Pricing is derived from the canonical ToS JSON. During a grace period
 * after a ToS update, previous pricing applies. Since ToS changes require
 * a redeploy (JSON is bundled), these constants are correct at server start.
 */

import { getEffectivePricing } from '$lib/tos';

const pricing = getEffectivePricing();

/** Cost to fetch a price update (GET /subbit/request) */
export const PRICE_REQUEST_COST = BigInt(pricing.updateCostLovelace);

/** Cost to publish prices on-chain (POST /subbit/request) */
export const PUBLISH_REQUEST_COST = BigInt(pricing.publishCostLovelace);

/** Channel reserve — minimum ADA that must remain in the UTxO (minADA) */
export const CHANNEL_RESERVE = 2_000_000n; // 2 ADA
export const CHANNEL_RESERVE_ADA = 2;

/** Channel opening fee deducted from deposit by the provider */
export const CHANNEL_INIT_COST = 1_000n; // 0.001 ADA
export const CHANNEL_INIT_COST_ADA = 0.001;

/** Estimated Cardano network transaction fee */
export const EST_NETWORK_FEE_ADA = 0.2;

/** ADA equivalents for UI display */
export const PRICE_REQUEST_COST_ADA = Number(pricing.updateCostLovelace) / 1_000_000;
export const PUBLISH_REQUEST_COST_ADA = Number(pricing.publishCostLovelace) / 1_000_000;
