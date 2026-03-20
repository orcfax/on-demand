import { describe, it, expect } from 'vitest';
import { getErrorMessage, extractErrorMessage } from './errors';

describe('getErrorMessage', () => {
	it('extracts message from Error', () => {
		expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
	});

	it('extracts message from SvelteKit HttpError shape', () => {
		const err = { status: 500, body: { message: 'server error' } };
		expect(getErrorMessage(err, 'fallback')).toBe('server error');
	});

	it('returns fallback for null', () => {
		expect(getErrorMessage(null, 'fallback')).toBe('fallback');
	});

	it('returns fallback for undefined', () => {
		expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
	});

	it('returns fallback for string', () => {
		expect(getErrorMessage('not an error', 'fallback')).toBe('fallback');
	});

	it('returns fallback for object without message', () => {
		expect(getErrorMessage({ code: 42 }, 'fallback')).toBe('fallback');
	});

	it('prefers body.message over Error.message', () => {
		const err = Object.assign(new Error('from Error'), {
			body: { message: 'from body' }
		});
		expect(getErrorMessage(err, 'fallback')).toBe('from body');
	});
});

describe('extractErrorMessage', () => {
	it('extracts message from JSON response', async () => {
		const response = new Response(JSON.stringify({ message: 'not found' }), {
			status: 404,
			statusText: 'Not Found'
		});
		expect(await extractErrorMessage(response)).toBe('not found');
	});

	it('returns statusText when body is not JSON', async () => {
		const response = new Response('Something went wrong', {
			status: 500,
			statusText: 'Internal Server Error'
		});
		// JSON.parse fails -> catch returns statusText
		expect(await extractErrorMessage(response)).toBe('Internal Server Error');
	});

	it('returns raw text for valid JSON without message field', async () => {
		const body = JSON.stringify({ error: 'oops', code: 42 });
		const response = new Response(body, { status: 500, statusText: 'ISE' });
		expect(await extractErrorMessage(response)).toBe(body);
	});

	it('returns statusText for empty body', async () => {
		const response = new Response('', {
			status: 502,
			statusText: 'Bad Gateway'
		});
		expect(await extractErrorMessage(response)).toBe('Bad Gateway');
	});

	it('handles malformed JSON by falling back to statusText', async () => {
		const response = new Response('{bad json', {
			status: 500,
			statusText: 'Internal Server Error'
		});
		// JSON.parse fails -> catch returns statusText
		expect(await extractErrorMessage(response)).toBe('Internal Server Error');
	});

	it('falls back to status code when no text or statusText', async () => {
		const response = new Response('', { status: 418 });
		const result = await extractErrorMessage(response);
		expect(result).toContain('418');
	});
});
