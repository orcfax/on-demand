/**
 * Structured result from formatCurrencyValue.
 * - `plain`: a simple text string, safe to render directly.
 * - `subscript`: three parts to render as  prefix<sub>subscript</sub>suffix
 *   (e.g. 0.0<sub>5</sub>1234 for values with many leading zeros).
 */
export type FormattedCurrency =
	| { type: 'plain'; text: string }
	| { type: 'subscript'; prefix: string; subscript: string; suffix: string };

/**
 * Format a currency value for display, matching Orcfax Explorer conventions.
 *
 * Rules:
 *  - >= 10: commas + max 2 decimals (sliced, not rounded)
 *  - 1–10: up to 4 decimals (sliced, not rounded)
 *  - < 1 with ≤ 2 leading zeros: up to 4 decimals
 *  - < 1 with > 2 leading zeros: subscript notation  0.0<sub>N</sub>XXXX
 */
export function formatCurrencyValue(value: number): FormattedCurrency {
	// toFixed(20) prevents scientific notation; we slice later to avoid rounding
	let valueStr = value.toFixed(20);

	// Trim trailing zeros
	valueStr = valueStr.replace(/\.?0+$/, '');

	// >= 10: commas, max 2 decimal places
	if (value >= 10) {
		let integerPart = valueStr.split('.')[0];
		const decimalPart = valueStr.split('.')[1];
		integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

		const text = decimalPart ? integerPart + '.' + decimalPart.slice(0, 2) : integerPart;
		return { type: 'plain', text };
	}

	// 1–10: up to 4 decimal places
	if (value >= 1) {
		const decimalIndex = valueStr.indexOf('.');
		const text = decimalIndex !== -1 ? valueStr.slice(0, decimalIndex + 5) : valueStr;
		return { type: 'plain', text };
	}

	// < 1
	if (value < 1) {
		const match = valueStr.match(/^0\.(0+)(\d+)/);
		if (match) {
			const leadingZeros = match[1].length;
			const significantDigits = match[2].slice(0, 4);

			if (leadingZeros > 2) {
				return {
					type: 'subscript',
					prefix: '0.0',
					subscript: String(leadingZeros),
					suffix: significantDigits
				};
			}
			return { type: 'plain', text: `0.${match[1]}${significantDigits}` };
		}

		// No leading zeros — just cap at 4 decimal places
		return { type: 'plain', text: valueStr.slice(0, valueStr.indexOf('.') + 5) };
	}

	return { type: 'plain', text: valueStr };
}
