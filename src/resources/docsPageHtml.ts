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
		<a class="logout" href="/docs/logout">Logout</a>
		<div id="swagger-ui"></div>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
		<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
		<script>
			window.ui = SwaggerUIBundle({
				url: '/openapi.json',
				dom_id: '#swagger-ui',
				deepLinking: true,
				presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
				layout: 'BaseLayout'
			});
		</script>
	</body>
</html>`;