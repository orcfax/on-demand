export class SubbitError extends Error {
	constructor(
		public code: string,
		message?: string
	) {
		super(message ?? code);
		this.name = 'SubbitError';
	}
}

export const ERROR_STATUS_MAP: Record<string, number> = {
	InsufficientAmount: 402,
	BadEncoding: 403,
	BadSignature: 403,
	StampTooOld: 403,
	StampTooNew: 403,
	BadSeed: 403,
	NoStampCred: 403,
	NoFixedCred: 403,
	NoSubbit: 403,
	Suspended: 403
};

export function mapSubbitError(errorCode: string): { status: number; error: string } {
	const status = ERROR_STATUS_MAP[errorCode] ?? 500;
	return { status, error: errorCode };
}

export function extractCredential(request: Request): string | null {
	return request.headers.get('x-credential');
}

/**
 * Parse an error response body into a user-facing message.
 * Tries JSON first, falls back to raw text, then statusText.
 */
export async function readErrorResponse(response: Response): Promise<string> {
	const text = await response.text();
	if (!text) return response.statusText;
	try {
		const parsed = JSON.parse(text);
		return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
	} catch {
		return text;
	}
}

export function jsonError(
	status: number,
	error: string,
	message: string,
	extraHeaders?: Record<string, string>
): Response {
	return new Response(JSON.stringify({ error, message }), {
		status,
		headers: {
			'content-type': 'application/json',
			...extraHeaders
		}
	});
}
