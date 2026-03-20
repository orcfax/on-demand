import { z } from 'zod';

// Types:
//
//
// Hex helpers
export const HexString = z.string().regex(/^[0-9a-fA-F]+$/, { message: 'Expected hex string' });

// IOU entry from /l1/ious
export const IouEntrySchema = z.object({
	iouAmt: z.string(), // bigint encoded as string
	sig: z.union([HexString, z.literal('')]), // signature hex (can be empty for zeroed entries)
	txId: HexString.optional(),
	outputIdx: z.string().optional()
});
export type IouEntry = z.infer<typeof IouEntrySchema>;

export const IousResponseSchema = z.record(z.string(), IouEntrySchema);
export type IousResponse = z.infer<typeof IousResponseSchema>;

// L1 sync body — mirrors services/subbit-man-js/src/schemaTypes.d.ts::L1Subbit
export const CurrencySchema = z.union([
	z.literal('Ada'),
	z.object({ byHash: HexString }),
	z.object({ byClass: HexString }) // unit hex (policy+name)
]);

export const L1SubbitSchema = z.object({
	txId: HexString,
	outputIdx: z.string(),
	provider: HexString,
	currency: CurrencySchema,
	closePeriod: z.string(),
	iouKey: HexString,
	tag: HexString,
	sub: z.string(),
	subbitAmt: z.string()
});
export type L1Subbit = z.infer<typeof L1SubbitSchema>;

// /l1/sync returns a map { [keytagHex]: "Insert"|"Update"|"Suspend"|... or error string }
// We accept known actions plus any string for forward-compat.
export const SyncActionSchema = z.union([
	z.literal('Insert'),
	z.literal('Update'),
	z.literal('Suspend'),
	z.literal('NoneOpened'),
	z.literal('NoneSuspended'),
	z.string()
]);
export const SyncResultSchema = z.record(z.string(), SyncActionSchema);
export type SyncResult = z.infer<typeof SyncResultSchema>;

// Credential is base64 string (per design doc)
export const CredentialB64Schema = z.string().min(1);

// /l2/tot returns a stringified amount
export const TotResSchema = z.string();

// /l2/info returns a JSON (from info2json in routes.js)
export const InfoResSchema = z.object({
	keytag: HexString,
	stage: z.string(), // textual description
	cost: z.string(),
	iouAmt: z.string(),
	sub: z.string(),
	subbitAmt: z.string(),
	sig: z.union([HexString, z.literal('')])
});
export type InfoRes = z.infer<typeof InfoResSchema>;

// /l2/mod (PATCH) query: cred, by; result is stringified tot
export const ModOptionsSchema = z.object({
	cred: CredentialB64Schema,
	by: z.string()
});
export type ModOptions = z.infer<typeof ModOptionsSchema>;

export type WalletError =
	| { _tag: 'GetUtxosError'; reason: unknown }
	| { _tag: 'GetChangeAddressError'; reason: unknown }
	| { _tag: 'SignTxError'; reason: unknown }
	| { _tag: 'SubmitTxError'; reason: unknown };

export type WalletInfo = {
	name: String;
	image: String;
	version: String;
};

export type Utxo = {
	input: {
		outputIndex: number;
		txHash: string;
	};
	output: {
		address: string;
		amount: {
			unit: string;
			quantity: string;
		}[];
	};
};

/**
 * Zod schema for validating auth key file contents.
 * This validates the structure and contents of the JSON file that
 * users upload containing their authentication keys and metadata.
 */
export const authKeyFileSchema = z.object({
	format: z.literal('orcfax-on-demand-key'),
	version: z.literal(1),
	crypto: z.object({
		algorithm: z.literal('ed25519'),
		private_key: z.object({
			hex: z.hex(),
			bech32: z.stringFormat('bech32', (val: string) => {
				return val.startsWith('ed25519_sk1');
			})
		}),
		public_key: z.object({
			hex: z.hex(),
			bech32: z.stringFormat('bech32', (val: string) => {
				return val.startsWith('ed25519_vk1');
			})
		})
	}),
	binding: z.object({
		scope: z.literal('subbit-channel'),
		channel_tag: z.string(),
		channel_keytag: z.hex()
	}),
	metadata: z.object({
		network: z.literal(['Preview', 'Mainnet']),
		provider: z.literal('Orcfax Ltd.'),
		created_at: z.iso.datetime(),
		tos_version: z.string().optional(),
		tos_hash: z.string().optional()
	})
});

/**
 * TypeScript type inferred from the Zod schema
 */
export type AuthKeyFile = z.infer<typeof authKeyFileSchema>;

/**
 * Result of building an Open transaction
 */
export interface BuildOpenTxResult {
	/** Unsigned transaction in CBOR hex format */
	unsignedTx: string;
	/** Channel info for the newly opened channel */
	channelInfo: ChannelInfo;
}

/**
 * Result of building an Add transaction
 */
export interface BuildAddTxResult {
	/** Unsigned transaction in CBOR hex format */
	unsignedTx: string;
	/** Updated channel info (will be accurate after tx confirmation) */
	channelInfo: ChannelInfo;
}

/**
 * Result of building a Close transaction
 */
export interface BuildCloseTxResult {
	/** Unsigned transaction in CBOR hex format */
	unsignedTx: string;
	/** Close period deadline (unix ms) */
	deadline: number;
}

/**
 * Result of building an End transaction (withdraw after settlement)
 */
export interface BuildEndTxResult {
	/** Unsigned transaction in CBOR hex format */
	unsignedTx: string;
}

/**
 * Result of building an Expire transaction (withdraw after deadline)
 */
export interface BuildExpireTxResult {
	/** Unsigned transaction in CBOR hex format */
	unsignedTx: string;
}

/**
 * On-chain state lookup result from /l1/channel-on-chain-state
 */
export interface OnChainStateResult {
	state: 'opened' | 'closed' | 'settled' | 'not-found';
	deadline?: number;
}

/**
 * Channel information returned to the client
 */
export interface ChannelInfo {
	txId: string;
	outputIdx: string;
	stage: string;
	cost: string;
	iouAmt: string;
	sub: string;
	subbitAmt: string;
	sig: string;
}
