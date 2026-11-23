import { SEARCH_SHADOW_SOAK_PATH } from "../searchShadowSoak";
import { docsChromeStyles, docsEnvBanner, docsEnvironmentLabels, docsTopActions } from "./docsChrome";

type DocsAuthConfig = {
	auth0Issuer?: string;
	auth0Audience?: string;
	auth0ClientId?: string;
	apiEnvironment?: "production" | "preview" | "local";
};

export const buildDocsPageHtml = (config: DocsAuthConfig): string => {
	const auth0Domain = config.auth0Issuer ? new URL(config.auth0Issuer).hostname : '';
	const auth0Audience = config.auth0Audience ?? '';
	const auth0ClientId = config.auth0ClientId ?? '';
	const auth0Enabled = !!(auth0Domain && auth0Audience && auth0ClientId);
	const apiEnvironment = config.apiEnvironment ?? 'production';
	const pageTitle = `Cult Podcasts API Docs${docsEnvironmentLabels(apiEnvironment).titleSuffix}`;

	return `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${pageTitle}</title>
		<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
		<style>
			html, body { margin: 0; padding: 0; }
			#swagger-ui { min-height: 100vh; }
${docsChromeStyles(apiEnvironment)}
			.hamburger {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 38px;
				height: 36px;
				border: 1px solid #111827;
				background: #111827;
				color: #ffffff;
				border-radius: 6px;
				cursor: pointer;
				font: 700 18px/1 system-ui, sans-serif;
			}
			.token-overlay {
				position: absolute;
				z-index: 10001;
				display: none;
				gap: 8px;
				align-items: center;
				flex-wrap: wrap;
				background: #ffffff;
				border: 1px solid #d1d5db;
				border-radius: 6px;
				padding: 8px;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
				font: 500 13px system-ui, sans-serif;
			}
			.token-overlay.open { display: flex; }
			.token-input {
				width: 320px;
				max-width: 50vw;
				padding: 6px 8px;
				border: 1px solid #d1d5db;
				border-radius: 6px;
				font: 500 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			}
			.token-button {
				padding: 6px 10px;
				border: 1px solid #111827;
				background: #111827;
				color: #ffffff;
				border-radius: 6px;
				cursor: pointer;
				font: 600 12px system-ui, sans-serif;
			}
			.token-button:disabled {
				opacity: 0.55;
				cursor: not-allowed;
			}
			.token-clear {
				background: #ffffff;
				color: #111827;
			}
		</style>
	</head>
	<body>
		${docsEnvBanner(apiEnvironment)}
		${docsTopActions({
			leading: '<button id="token-toggle" class="hamburger" type="button" aria-label="Toggle token controls" title="Token controls">☰</button>',
			links: [{ href: SEARCH_SHADOW_SOAK_PATH, label: 'Search shadow soak' }]
		})}
		<div id="token-overlay" class="token-overlay">
			<label for="api-token">Bearer token</label>
			<input id="api-token" class="token-input" type="password" placeholder="Paste Auth0 access token" autocomplete="off" />
			<button id="auth0-login" class="token-button" type="button" ${auth0Enabled ? '' : 'disabled'}>Login with Auth0</button>
			<button id="save-token" class="token-button" type="button">Use token</button>
			<button id="clear-token" class="token-button token-clear" type="button">Clear</button>
		</div>
		<div id="swagger-ui"></div>
		<script src="https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js"></script>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
		<script>
			const tokenStorageKey = 'cultpodcasts-api-bearer-token';
			const auth0Domain = ${JSON.stringify(auth0Domain)};
			const auth0Audience = ${JSON.stringify(auth0Audience)};
			const auth0ClientId = ${JSON.stringify(auth0ClientId)};
			const auth0Enabled = ${JSON.stringify(auth0Enabled)};
			const tokenToggleButton = document.getElementById('token-toggle');
			const tokenOverlay = document.getElementById('token-overlay');
			const tokenInput = document.getElementById('api-token');
			const auth0LoginButton = document.getElementById('auth0-login');
			const saveTokenButton = document.getElementById('save-token');
			const clearTokenButton = document.getElementById('clear-token');

			const positionTokenOverlay = () => {
				if (!tokenOverlay.classList.contains('open')) {
					return;
				}
				// The header is in the page flow (Api #312), so anchor the menu to the page, not the viewport.
				const rect = tokenToggleButton.getBoundingClientRect();
				tokenOverlay.style.top = rect.top + window.scrollY + 'px';
				tokenOverlay.style.left = Math.max(8, rect.left + window.scrollX - tokenOverlay.offsetWidth - 8) + 'px';
			};

			tokenToggleButton.addEventListener('click', () => {
				tokenOverlay.classList.toggle('open');
				positionTokenOverlay();
			});

			window.addEventListener('resize', positionTokenOverlay);
			document.addEventListener('click', (event) => {
				if (!tokenOverlay.classList.contains('open')) {
					return;
				}
				const target = event.target;
				if (target instanceof Node && !tokenOverlay.contains(target) && target !== tokenToggleButton) {
					tokenOverlay.classList.remove('open');
				}
			});

			const getSavedToken = () => localStorage.getItem(tokenStorageKey) || '';
			const setSavedToken = (value) => {
				if (value) {
					localStorage.setItem(tokenStorageKey, value);
				} else {
					localStorage.removeItem(tokenStorageKey);
				}
			};

			tokenInput.value = getSavedToken();
			saveTokenButton.addEventListener('click', () => {
				setSavedToken(tokenInput.value.trim());
			});

			if (auth0Enabled) {
				auth0LoginButton.addEventListener('click', async () => {
					try {
						auth0LoginButton.disabled = true;
						auth0LoginButton.textContent = 'Logging in...';
						const client = await auth0.createAuth0Client({
							domain: auth0Domain,
							clientId: auth0ClientId,
							authorizationParams: {
								audience: auth0Audience,
								scope: 'openid profile email'
							}
						});
						await client.loginWithPopup({
							authorizationParams: {
								audience: auth0Audience,
								scope: 'openid profile email'
							}
						});
						const token = await client.getTokenSilently({
							authorizationParams: {
								audience: auth0Audience,
								scope: 'openid profile email'
							}
						});
						tokenInput.value = token;
						setSavedToken(token);
						auth0LoginButton.textContent = 'Token ready';
					} catch (error) {
						console.error(error);
						auth0LoginButton.textContent = 'Login failed';
					} finally {
						setTimeout(() => {
							auth0LoginButton.disabled = false;
							auth0LoginButton.textContent = 'Login with Auth0';
						}, 1200);
					}
				});
			}

			clearTokenButton.addEventListener('click', () => {
				tokenInput.value = '';
				setSavedToken('');
			});

			window.ui = SwaggerUIBundle({
				url: '/openapi.json',
				dom_id: '#swagger-ui',
				deepLinking: true,
				presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
				layout: 'BaseLayout',
				requestInterceptor: (request) => {
					const token = tokenInput.value.trim() || getSavedToken();
					if (token) {
						request.headers = request.headers || {};
						request.headers.Authorization = 'Bearer ' + token;
					}
					return request;
				}
			});
		</script>
	</body>
</html>`;
};