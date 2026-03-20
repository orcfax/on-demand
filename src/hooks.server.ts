import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = ({ error, message }) => {
	console.error('[Server Error]', error);
	return { message: message ?? 'Something went wrong.' };
};
