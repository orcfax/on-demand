import { describe, it, expect } from 'vitest';
import {
	SubbitError,
	mapSubbitError,
	extractCredential,
	jsonError,
	readErrorResponse
} from './subbitErrors';

describe('SubbitError', () => {
	it('creates an error with code and message', () => {
		const err = new SubbitError('InsufficientAmount', 'Not enough funds');
		expect(err.code).toBe('InsufficientAmount');
		expect(err.message).toBe('Not enough funds');
		expect(err.name).toBe('SubbitError');
		expect(err).toBeInstanceOf(Error);
	});

	it('uses code as message when no message provided', () => {
		const err = new SubbitError('BadSignature');
		expect(err.message).toBe('BadSignature');
		expect(err.code).toBe('BadSignature');
	});
});

describe('mapSubbitError', () => {
	it('maps InsufficientAmount to 402', () => {
		expect(mapSubbitError('InsufficientAmount')).toEqual({
			status: 402,
			error: 'InsufficientAmount'
		});
	});

	it('maps BadEncoding to 403', () => {
		expect(mapSubbitError('BadEncoding')).toEqual({ status: 403, error: 'BadEncoding' });
	});

	it('maps BadSignature to 403', () => {
		expect(mapSubbitError('BadSignature')).toEqual({ status: 403, error: 'BadSignature' });
	});

	it('maps StampTooOld to 403', () => {
		expect(mapSubbitError('StampTooOld')).toEqual({ status: 403, error: 'StampTooOld' });
	});

	it('maps Suspended to 403', () => {
		expect(mapSubbitError('Suspended')).toEqual({ status: 403, error: 'Suspended' });
	});

	it('maps unknown error codes to 500', () => {
		expect(mapSubbitError('UnknownError')).toEqual({ status: 500, error: 'UnknownError' });
	});

	it('maps empty string to 500', () => {
		expect(mapSubbitError('')).toEqual({ status: 500, error: '' });
	});
});

describe('extractCredential', () => {
	it('extracts x-credential header from request', () => {
		const request = new Request('http://localhost', {
			headers: { 'x-credential': 'abc123' }
		});
		expect(extractCredential(request)).toBe('abc123');
	});

	it('returns null when header is missing', () => {
		const request = new Request('http://localhost');
		expect(extractCredential(request)).toBeNull();
	});
});

describe('jsonError', () => {
	it('creates a JSON error response with correct status', async () => {
		const response = jsonError(400, 'BadRequest', 'Invalid input');
		expect(response.status).toBe(400);
		expect(response.headers.get('content-type')).toBe('application/json');

		const body = await response.json();
		expect(body).toEqual({ error: 'BadRequest', message: 'Invalid input' });
	});

	it('includes extra headers when provided', async () => {
		const response = jsonError(409, 'Conflict', 'Version mismatch', {
			'X-Custom': 'value'
		});
		expect(response.status).toBe(409);
		expect(response.headers.get('X-Custom')).toBe('value');
		expect(response.headers.get('content-type')).toBe('application/json');
	});

	it('works with 500 status', async () => {
		const response = jsonError(500, 'InternalError', 'Something broke');
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe('InternalError');
	});
});

describe('readErrorResponse', () => {
	it('returns parsed string from JSON string body', async () => {
		const response = new Response('"Some error message"', { status: 400 });
		expect(await readErrorResponse(response)).toBe('Some error message');
	});

	it('returns stringified JSON for object body', async () => {
		const body = { error: 'BadRequest', detail: 'missing field' };
		const response = new Response(JSON.stringify(body), { status: 400 });
		expect(await readErrorResponse(response)).toBe(JSON.stringify(body));
	});

	it('returns raw text for non-JSON body', async () => {
		const response = new Response('plain text error', { status: 500 });
		expect(await readErrorResponse(response)).toBe('plain text error');
	});

	it('returns statusText for empty body', async () => {
		const response = new Response('', { status: 404, statusText: 'Not Found' });
		expect(await readErrorResponse(response)).toBe('Not Found');
	});
});
