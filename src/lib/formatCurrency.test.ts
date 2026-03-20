import { describe, it, expect } from 'vitest';
import { formatCurrencyValue } from './formatCurrency';

describe('formatCurrencyValue', () => {
	describe('>= 10: commas + max 2 decimals', () => {
		it('formats large integers with commas', () => {
			const result = formatCurrencyValue(1234567);
			expect(result).toEqual({ type: 'plain', text: '1,234,567' });
		});

		it('truncates to 2 decimal places (no rounding)', () => {
			const result = formatCurrencyValue(12.3456);
			expect(result).toEqual({ type: 'plain', text: '12.34' });
		});

		it('handles exactly 10', () => {
			const result = formatCurrencyValue(10);
			expect(result).toEqual({ type: 'plain', text: '10' });
		});
	});

	describe('1-10: up to 4 decimals', () => {
		it('shows up to 4 decimal places', () => {
			const result = formatCurrencyValue(1.23456789);
			expect(result).toEqual({ type: 'plain', text: '1.2345' });
		});

		it('handles exactly 1', () => {
			const result = formatCurrencyValue(1);
			expect(result).toEqual({ type: 'plain', text: '1' });
		});
	});

	describe('< 1 with <= 2 leading zeros: up to 4 decimals', () => {
		it('formats 0.01234 (leading zeros + 4 sig digits)', () => {
			const result = formatCurrencyValue(0.01234);
			expect(result).toEqual({ type: 'plain', text: '0.01234' });
		});

		it('formats 0.001234 (2 leading zeros + 4 sig digits)', () => {
			const result = formatCurrencyValue(0.001234);
			expect(result).toEqual({ type: 'plain', text: '0.001234' });
		});
	});

	describe('< 1 with > 2 leading zeros: subscript notation', () => {
		it('formats 0.000001234 with subscript', () => {
			const result = formatCurrencyValue(0.000001234);
			expect(result.type).toBe('subscript');
			if (result.type === 'subscript') {
				expect(result.prefix).toBe('0.0');
				expect(result.subscript).toBe('5');
				expect(result.suffix).toBe('1234');
			}
		});

		it('formats 0.0001 (3 leading zeros) with subscript', () => {
			const result = formatCurrencyValue(0.0001);
			expect(result.type).toBe('subscript');
			if (result.type === 'subscript') {
				expect(result.prefix).toBe('0.0');
				expect(result.subscript).toBe('3');
			}
		});
	});

	describe('edge cases', () => {
		it('handles 0', () => {
			const result = formatCurrencyValue(0);
			expect(result.type).toBe('plain');
		});

		it('handles 0.5 (no leading zeros)', () => {
			const result = formatCurrencyValue(0.5);
			expect(result).toEqual({ type: 'plain', text: '0.5' });
		});
	});
});
