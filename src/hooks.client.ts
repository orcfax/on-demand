import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, message }) => {
	console.error('[Client Error]', error);
	return { message: message ?? 'Something went wrong.' };
};
