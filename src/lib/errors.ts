/**
 * Extract a human-readable message from any error type,
 * including SvelteKit HttpError (which has body.message).
 */
export function getErrorMessage(err: unknown, fallback: string): string {
	if (err && typeof err === 'object') {
		// SvelteKit HttpError from remote functions: { status, body: { message } }
		const body = (err as Record<string, unknown>).body;
		if (
			body &&
			typeof body === 'object' &&
			typeof (body as Record<string, unknown>).message === 'string'
		) {
			return (body as Record<string, unknown>).message as string;
		}
	}
	if (err instanceof Error) return err.message;
	return fallback;
}

export async function extractErrorMessage(response: Response): Promise<string> {
	try {
		const text = await response.text();
		const json = JSON.parse(text);
		if (typeof json.message === 'string') return json.message;
		return text || response.statusText;
	} catch {
		return response.statusText || `Request failed (${response.status})`;
	}
}
