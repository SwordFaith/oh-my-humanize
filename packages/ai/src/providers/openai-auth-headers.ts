export const MODEL_AUTHORIZATION_HEADER_API_KEY = "model-authorization-header";

export function canUseConfiguredAuthorizationHeader(provider: string): boolean {
	return provider !== "openai" && provider !== "github-copilot";
}

export function hasAuthorizationHeader(headers: Record<string, string> | undefined): boolean {
	if (!headers) return false;
	return Object.keys(headers).some(key => key.toLowerCase() === "authorization");
}

export function setBearerAuthorizationHeader(
	headers: Record<string, string>,
	apiKey: string,
	options: { overrideExisting?: boolean } = {},
): void {
	const overrideExisting = options.overrideExisting ?? true;
	if (!overrideExisting && hasAuthorizationHeader(headers)) return;
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === "authorization") delete headers[key];
	}
	headers.Authorization = `Bearer ${apiKey}`;
}
