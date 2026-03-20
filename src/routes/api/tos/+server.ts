import { json } from '@sveltejs/kit';
import { tos, computeTosHash, isInGracePeriod, getGraceDeadline } from '$lib/tos';

export function GET() {
	const headers: Record<string, string> = {
		'X-ToS-Version': tos.version,
		'X-ToS-Hash': computeTosHash()
	};

	if (isInGracePeriod()) {
		headers['X-ToS-Grace-Deadline'] = getGraceDeadline()!.toISOString();
		headers['X-ToS-Previous-Version'] = tos.previousVersion!.version;
	}

	return json({ ...tos, hash: computeTosHash() }, { headers });
}
