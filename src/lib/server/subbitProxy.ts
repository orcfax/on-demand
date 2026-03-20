import { env } from '$env/dynamic/private';
import { InfoResSchema, type InfoRes } from '$lib/subbit/types';
import { TOS_VERSION, computeTosHash, isInGracePeriod, getGraceDeadline, tos } from '$lib/tos';
export { SubbitError, mapSubbitError, extractCredential, jsonError } from './subbitErrors';
import { SubbitError } from './subbitErrors';

function getSubbitManUrl(): string {
	return env.PRIVATE_SUBBIT_MAN_URL ?? 'http://127.0.0.1:7822';
}

export async function validateCredential(credential: string): Promise<string> {
	const url = new URL('/l2/tot', getSubbitManUrl());
	url.searchParams.set('cred', credential);

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: { accept: 'application/json' }
	});

	if (!response.ok) {
		const errorText = (await response.text()).trim();
		throw new SubbitError(errorText, `Credential validation failed: ${errorText}`);
	}

	return await response.text();
}

export async function chargeCost(credential: string, cost: bigint): Promise<void> {
	const url = new URL('/l2/mod', getSubbitManUrl());
	url.searchParams.set('cred', credential);
	url.searchParams.set('by', (-cost).toString());

	const response = await fetch(url.toString(), {
		method: 'PATCH',
		headers: { accept: 'application/json' }
	});

	if (!response.ok) {
		const errorText = (await response.text()).trim();
		throw new SubbitError(errorText, `Cost update failed: ${errorText}`);
	}
}

export async function getChannelInfo(credential: string): Promise<InfoRes> {
	const url = new URL('/l2/info', getSubbitManUrl());
	url.searchParams.set('cred', credential);

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: { accept: 'application/json' }
	});

	if (!response.ok) {
		const errorText = (await response.text()).trim();
		throw new SubbitError(errorText, `Channel info failed: ${errorText}`);
	}

	return InfoResSchema.parse(await response.json());
}

export function tosHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		'X-ToS-Version': TOS_VERSION,
		'X-ToS-Hash': computeTosHash()
	};

	if (isInGracePeriod()) {
		headers['X-ToS-Grace-Deadline'] = getGraceDeadline()!.toISOString();
		headers['X-ToS-Previous-Version'] = tos.previousVersion!.version;
	}

	return headers;
}

export function requireTosAcceptance(request: Request): Response | null {
	if (isInGracePeriod()) return null;
	if (!tos.previousVersion) return null;

	const accepted = request.headers.get('x-tos-accepted');
	if (accepted === TOS_VERSION) return null;

	return new Response(
		JSON.stringify({
			error: 'TosUpdateRequired',
			currentVersion: TOS_VERSION,
			tosUrl: '/api/tos',
			message: `Terms of Service have been updated. Review at /api/tos and include 'X-ToS-Accepted: ${TOS_VERSION}' header.`
		}),
		{
			status: 409,
			headers: {
				'content-type': 'application/json',
				...tosHeaders()
			}
		}
	);
}
