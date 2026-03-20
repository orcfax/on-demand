import { describe, it, expect } from 'vitest';
import {
	HexString,
	IouEntrySchema,
	IousResponseSchema,
	L1SubbitSchema,
	SyncActionSchema,
	InfoResSchema,
	authKeyFileSchema
} from './types';

describe('HexString', () => {
	it('accepts valid hex', () => {
		expect(HexString.safeParse('deadbeef').success).toBe(true);
		expect(HexString.safeParse('0123456789abcdefABCDEF').success).toBe(true);
	});

	it('rejects non-hex', () => {
		expect(HexString.safeParse('0xdeadbeef').success).toBe(false); // 0x prefix
		expect(HexString.safeParse('ghij').success).toBe(false);
		expect(HexString.safeParse('').success).toBe(false);
	});
});

describe('IouEntrySchema', () => {
	it('accepts valid IOU entry', () => {
		const result = IouEntrySchema.safeParse({
			iouAmt: '1000000',
			sig: 'aabb'
		});
		expect(result.success).toBe(true);
	});

	it('accepts empty sig', () => {
		const result = IouEntrySchema.safeParse({
			iouAmt: '0',
			sig: ''
		});
		expect(result.success).toBe(true);
	});

	it('accepts optional txId and outputIdx', () => {
		const result = IouEntrySchema.safeParse({
			iouAmt: '5000',
			sig: 'aabb',
			txId: 'deadbeef',
			outputIdx: '0'
		});
		expect(result.success).toBe(true);
	});
});

describe('IousResponseSchema', () => {
	it('accepts record of keytag to IOU entry', () => {
		const result = IousResponseSchema.safeParse({
			aabb: { iouAmt: '1000', sig: 'ccdd' },
			eeff: { iouAmt: '0', sig: '' }
		});
		expect(result.success).toBe(true);
	});
});

describe('L1SubbitSchema', () => {
	it('accepts valid L1 subbit with Ada currency', () => {
		const result = L1SubbitSchema.safeParse({
			txId: 'aabbccdd',
			outputIdx: '0',
			provider: 'deadbeef',
			currency: 'Ada',
			closePeriod: '3600000',
			iouKey: 'aabbccdd',
			tag: 'aabbccdd',
			sub: '0',
			subbitAmt: '10000000'
		});
		expect(result.success).toBe(true);
	});

	it('accepts byHash currency', () => {
		const result = L1SubbitSchema.safeParse({
			txId: 'aabb',
			outputIdx: '0',
			provider: 'ddee',
			currency: { byHash: 'ccdd' },
			closePeriod: '3600',
			iouKey: 'aabb',
			tag: 'aabb',
			sub: '0',
			subbitAmt: '5000000'
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing fields', () => {
		expect(L1SubbitSchema.safeParse({ txId: 'aabb' }).success).toBe(false);
	});
});

describe('SyncActionSchema', () => {
	it('accepts known actions', () => {
		expect(SyncActionSchema.safeParse('Insert').success).toBe(true);
		expect(SyncActionSchema.safeParse('Update').success).toBe(true);
		expect(SyncActionSchema.safeParse('Suspend').success).toBe(true);
		expect(SyncActionSchema.safeParse('NoneOpened').success).toBe(true);
		expect(SyncActionSchema.safeParse('NoneSuspended').success).toBe(true);
	});

	it('accepts unknown string actions (forward compat)', () => {
		expect(SyncActionSchema.safeParse('FutureAction').success).toBe(true);
	});
});

describe('InfoResSchema', () => {
	it('accepts valid info response', () => {
		const result = InfoResSchema.safeParse({
			keytag: 'aabbccdd',
			stage: 'Opened',
			cost: '1000',
			iouAmt: '5000',
			sub: '0',
			subbitAmt: '10000000',
			sig: 'eeff'
		});
		expect(result.success).toBe(true);
	});

	it('accepts empty sig', () => {
		const result = InfoResSchema.safeParse({
			keytag: 'aabb',
			stage: 'Suspended',
			cost: '0',
			iouAmt: '0',
			sub: '0',
			subbitAmt: '0',
			sig: ''
		});
		expect(result.success).toBe(true);
	});
});

describe('authKeyFileSchema', () => {
	it('accepts a valid key file', () => {
		const keyFile = {
			format: 'orcfax-on-demand-key',
			version: 1,
			crypto: {
				algorithm: 'ed25519',
				private_key: {
					hex: 'a'.repeat(64),
					bech32: 'ed25519_sk1abc123'
				},
				public_key: {
					hex: 'b'.repeat(64),
					bech32: 'ed25519_vk1xyz789'
				}
			},
			binding: {
				scope: 'subbit-channel',
				channel_tag: 'test-channel',
				channel_keytag: 'ab'.repeat(34)
			},
			metadata: {
				network: 'Preview',
				provider: 'Orcfax Ltd.',
				created_at: '2026-03-20T12:00:00Z'
			}
		};
		const result = authKeyFileSchema.safeParse(keyFile);
		expect(result.success).toBe(true);
	});

	it('rejects wrong format', () => {
		const keyFile = {
			format: 'wrong-format',
			version: 1,
			crypto: {
				algorithm: 'ed25519',
				private_key: { hex: 'aa', bech32: 'ed25519_sk1x' },
				public_key: { hex: 'bb', bech32: 'ed25519_vk1x' }
			},
			binding: { scope: 'subbit-channel', channel_tag: 'x', channel_keytag: 'aa' },
			metadata: { network: 'Preview', provider: 'Orcfax Ltd.', created_at: '2026-01-01T00:00:00Z' }
		};
		expect(authKeyFileSchema.safeParse(keyFile).success).toBe(false);
	});

	it('rejects wrong version', () => {
		const keyFile = {
			format: 'orcfax-on-demand-key',
			version: 2,
			crypto: {
				algorithm: 'ed25519',
				private_key: { hex: 'aa', bech32: 'ed25519_sk1x' },
				public_key: { hex: 'bb', bech32: 'ed25519_vk1x' }
			},
			binding: { scope: 'subbit-channel', channel_tag: 'x', channel_keytag: 'aa' },
			metadata: { network: 'Preview', provider: 'Orcfax Ltd.', created_at: '2026-01-01T00:00:00Z' }
		};
		expect(authKeyFileSchema.safeParse(keyFile).success).toBe(false);
	});

	it('rejects invalid network', () => {
		const keyFile = {
			format: 'orcfax-on-demand-key',
			version: 1,
			crypto: {
				algorithm: 'ed25519',
				private_key: { hex: 'aa', bech32: 'ed25519_sk1x' },
				public_key: { hex: 'bb', bech32: 'ed25519_vk1x' }
			},
			binding: { scope: 'subbit-channel', channel_tag: 'x', channel_keytag: 'aa' },
			metadata: { network: 'Testnet', provider: 'Orcfax Ltd.', created_at: '2026-01-01T00:00:00Z' }
		};
		expect(authKeyFileSchema.safeParse(keyFile).success).toBe(false);
	});
});
