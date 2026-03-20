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
