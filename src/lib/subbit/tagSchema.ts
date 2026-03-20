import { z } from 'zod';

export const TAG_MIN_BYTES = 3;
export const TAG_MAX_BYTES = 20;

const BLOCKED_CHARS = /[\x00-\x1F\x7F-\x9F\u200B\u200C\u200D\uFEFF\u2060\u202A-\u202E]/;

export const tagSchema = z
	.string()
	.trim()
	.superRefine((val, ctx) => {
		if (BLOCKED_CHARS.test(val)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Tag contains invalid control or invisible characters'
			});
			return;
		}
		const byteLen = new TextEncoder().encode(val).length;
		if (byteLen < TAG_MIN_BYTES) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Tag must be at least ${TAG_MIN_BYTES} bytes (currently ${byteLen})`
			});
		}
		if (byteLen > TAG_MAX_BYTES) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Tag must be at most ${TAG_MAX_BYTES} bytes (currently ${byteLen})`
			});
		}
	});

export function validateTag(
	input: string
): { ok: true; value: string } | { ok: false; error: string } {
	const result = tagSchema.safeParse(input);
	if (result.success) return { ok: true, value: result.data };
	return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid tag' };
}

export function getTagByteLength(input: string): number {
	return new TextEncoder().encode(input).length;
}
