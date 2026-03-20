import { browser } from '$app/environment';

export class LocalStore<T> {
	value = $state<T>() as T;
	key = '';

	constructor(key: string, initialValue: T) {
		this.key = key;

		// Try to load from localStorage first
		if (browser) {
			const item = localStorage.getItem(key);
			if (item) {
				this.value = this.deserialize(item);
			} else {
				this.value = initialValue;
			}
		} else {
			this.value = initialValue;
		}
	}

	// Explicitly save to localStorage when needed
	save() {
		if (browser) {
			localStorage.setItem(this.key, this.serialize(this.value));
		}
	}

	serialize(value: T): string {
		return JSON.stringify(value);
	}

	deserialize(item: string): T {
		return JSON.parse(item);
	}
}

export function localStore<T>(key: string, value: T) {
	return new LocalStore(key, value);
}
