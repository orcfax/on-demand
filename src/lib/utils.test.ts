import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
	it('merges simple class names', () => {
		expect(cn('foo', 'bar')).toBe('foo bar');
	});

	it('handles conditional classes', () => {
		expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
	});

	it('deduplicates Tailwind classes', () => {
		expect(cn('p-4', 'p-2')).toBe('p-2');
	});

	it('merges conflicting Tailwind utility classes (last wins)', () => {
		expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
	});

	it('handles undefined and null inputs', () => {
		expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
	});

	it('handles empty string', () => {
		expect(cn('')).toBe('');
	});

	it('handles no arguments', () => {
		expect(cn()).toBe('');
	});

	it('handles array inputs', () => {
		expect(cn(['foo', 'bar'])).toBe('foo bar');
	});

	it('handles object inputs', () => {
		expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
	});
});
