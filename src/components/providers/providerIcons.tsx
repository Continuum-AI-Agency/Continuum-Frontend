import type { Provider } from "@/lib/schemas/brand-assets";

export function ProviderIcon({ provider, className }: { provider: Provider | string; className?: string }) {
	// Minimal inline icons; replace with brand SVGs when available.
	switch (provider) {
		case "instagram":
			return (
				<span className={className} aria-label="Instagram" title="Instagram">
					IG
				</span>
			);
		case "youtube":
			return (
				<span className={className} aria-label="YouTube" title="YouTube">
					YT
				</span>
			);
		case "tiktok":
			return (
				<span className={className} aria-label="TikTok" title="TikTok">
					TT
				</span>
			);
		case "x":
			return (
				<span className={className} aria-label="X" title="X">
					X
				</span>
			);
		case "facebook":
			return (
				<span className={className} aria-label="Facebook" title="Facebook">
					FB
				</span>
			);
		case "linkedin":
			return (
				<span className={className} aria-label="LinkedIn" title="LinkedIn">
					LI
				</span>
			);
		default:
			return (
				<span className={className} aria-label="Provider" title={String(provider)}>
					•
				</span>
			);
	}
}


