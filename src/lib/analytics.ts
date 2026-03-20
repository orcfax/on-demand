type EventData = Record<string, string | number | boolean>;

declare global {
	interface Window {
		umami?: {
			track: ((event: string) => void) & ((event: string, data: EventData) => void);
			identify: ((id: string) => void) & ((id: string, data: EventData) => void);
		};
	}
}

export function track(event: string, data?: EventData) {
	if (data) {
		window.umami?.track(event, data);
	} else {
		window.umami?.track(event);
	}
}

export function identify(id: string, data?: EventData) {
	if (data) {
		window.umami?.identify(id, data);
	} else {
		window.umami?.identify(id);
	}
}
