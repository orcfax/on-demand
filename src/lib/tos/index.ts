import tosJson from './tos.json';
import { blake2b } from '@noble/hashes/blake2';
import { bytesToHex } from '@noble/hashes/utils';

export interface TosPricing {
	currency: string;
	updateCostLovelace: number;
	publishCostLovelace: number;
}

export interface TosClause {
	id: string;
	title: string;
	text: string;
}

export interface TosChangelogEntry {
	version: string;
	date: string;
	changes: string[];
}

export interface PreviousVersion {
	version: string;
	effectiveDate: string;
	pricing: TosPricing;
	minDepositAda: number;
	closePeriodMs: number;
	gracePeriodDays: number;
}

export interface Tos {
	version: string;
	effectiveDate: string;
	gracePeriodDays: number;
	provider: { name: string; service: string };
	pricing: TosPricing;
	channel: { closePeriodMs: number; minDepositAda: number };
	previousVersion: PreviousVersion | null;
	changelog: TosChangelogEntry[];
	clauses: TosClause[];
}

export const tos = tosJson as Tos;

export const TOS_VERSION: string = tos.version;

let cachedHash: string | null = null;

export function computeTosHash(): string {
	if (!cachedHash) {
		const bytes = new TextEncoder().encode(JSON.stringify(tos));
		cachedHash = bytesToHex(blake2b(bytes, { dkLen: 32 }));
	}
	return cachedHash;
}

export function isInGracePeriod(): boolean {
	if (!tos.previousVersion) return false;
	const effectiveMs = new Date(tos.effectiveDate).getTime();
	const graceEndMs = effectiveMs + tos.gracePeriodDays * 86_400_000;
	return Date.now() < graceEndMs;
}

export function getGraceDeadline(): Date | null {
	if (!tos.previousVersion) return null;
	const effectiveMs = new Date(tos.effectiveDate).getTime();
	return new Date(effectiveMs + tos.gracePeriodDays * 86_400_000);
}

export function getEffectivePricing(): TosPricing {
	if (tos.previousVersion && isInGracePeriod()) {
		return tos.previousVersion.pricing;
	}
	return tos.pricing;
}
