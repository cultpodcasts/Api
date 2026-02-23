export const docsPageHtml = `<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Cult Podcasts API Docs</title>
		<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
		<style>
			html, body { margin: 0; padding: 0; }
			#swagger-ui { min-height: 100vh; }
			.token-bar {
				position: fixed;
				top: 12px;
				left: 16px;
				z-index: 10000;
				display: flex;
				gap: 8px;
				align-items: center;
				background: #ffffff;
				border: 1px solid #d1d5db;
				border-radius: 6px;
				padding: 8px;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
				font: 500 13px system-ui, sans-serif;
			}
			.token-input {
				width: 360px;
				max-width: 45vw;
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
			.token-clear {
				background: #ffffff;
				color: #111827;
			}
			.logout {
				position: fixed;
				top: 12px;
				right: 16px;
				z-index: 10000;
				background: #111827;
				color: #ffffff;
				padding: 8px 12px;
				border-radius: 6px;
				text-decoration: none;
				font: 600 13px system-ui, sans-serif;
			}
		</style>
	</head>
	<body>
		<div class="token-bar">
			<label for="api-token">Bearer token</label>
			<input id="api-token" class="token-input" type="password" placeholder="Paste Auth0 access token" autocomplete="off" />
			<button id="save-token" class="token-button" type="button">Use token</button>
			<button id="clear-token" class="token-button token-clear" type="button">Clear</button>
		</div>
		<a class="logout" href="/docs/logout">Logout</a>
		<div id="swagger-ui"></div>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
		<script>
			const tokenStorageKey = 'cultpodcasts-api-bearer-token';
			const tokenInput = document.getElementById('api-token');
			const saveTokenButton = document.getElementById('save-token');
			const clearTokenButton = document.getElementById('clear-token');

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