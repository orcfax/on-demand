import { toast, type ExternalToast } from 'svelte-sonner';

/**
 * Toast notification utilities.
 *
 * Thin typed wrappers around svelte-sonner's `toast` function.
 * Import directly from '$lib/toast' — no context setup needed.
 *
 * Usage:
 *   import { notify } from '$lib/toast';
 *   notify.success('Channel opened');
 *   notify.error('Failed to connect wallet');
 *   notify.promise(someAsyncFn(), {
 *     loading: 'Processing...',
 *     success: 'Done!',
 *     error: 'Something went wrong'
 *   });
 */

export const notify = {
	/** Default toast */
	show(message: string, options?: ExternalToast) {
		return toast(message, options);
	},

	/** Success toast (green) */
	success(message: string, options?: ExternalToast) {
		return toast.success(message, options);
	},

	/** Error toast (red) */
	error(message: string, options?: ExternalToast) {
		return toast.error(message, options);
	},

	/** Warning toast (yellow) */
	warning(message: string, options?: ExternalToast) {
		return toast.warning(message, options);
	},

	/** Info toast (blue) */
	info(message: string, options?: ExternalToast) {
		return toast.info(message, options);
	},

	/** Promise toast — shows loading, then success or error */
	promise<T>(
		promise: Promise<T>,
		messages: {
			loading: string;
			success: string | ((data: T) => string);
			error: string | ((err: unknown) => string);
		}
	) {
		return toast.promise(promise, messages);
	},

	/** Dismiss a specific toast or all toasts */
	dismiss(toastId?: string | number) {
		return toast.dismiss(toastId);
	}
};

// Re-export raw toast for advanced usage
export { toast };
