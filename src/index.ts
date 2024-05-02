import { parseJwt } from '@cfworker/jwt';
import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { stream } from 'hono/streaming'

type Env = {
	Content: R2Bucket;
	Data: R2Bucket;
	Analytics: AnalyticsEngineDataset;
	DB: D1Database;
	apikey: string;
	apihost: string;
	gatewayKey: string;
}

const allowedOrigins: Array<string> = [
	"https://cultpodcasts.com".toLowerCase(),
	"http://localhost:4200".toLowerCase(),
	"https://local.cultpodcasts.com:4200".toLowerCase(),
	"https://localhost:4200".toLowerCase()
];

function getOrigin(origin: string | null | undefined) {
	if (origin == null || allowedOrigins.indexOf(origin.toLowerCase()) == -1) {
		origin = allowedOrigins[0];
	}
	return origin;
}

const app = new Hono<{ Bindings: Env }>();
app.use('/*', cors({
	origin: (origin, c) => {
		return getOrigin(origin);
	},
	allowHeaders: ['content-type', 'authorization'],
	allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
	maxAge: 86400,
	credentials: true,
}))

app.get('/homepage', async (c) => {
	let object: R2ObjectBody | null = null;
	try {
		object = await c.env.Content.get("homepage");
	} catch (e) {
	}

	if (object === null) {
		return new Response("Object Not Found", { status: 404 });
	}

	c.header("etag", object.httpEtag);
	c.header("Cache-Control", "max-age=600");
	c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin")));
	c.header("Access-Control-Allow-Methods", "GET,OPTIONS");

	return stream(c, async (stream) => {
		// Write a process to be executed when aborted.
		stream.onAbort(() => {
		  console.log('Aborted!')
		})
		// Pipe a readable stream.
		await stream.pipe(object.body)
	  })
});

app.post("/search", async (c) => {
	const leechHandlingActive: boolean = false;
	const url = `${c.env.apihost}`;
	let dataPoint: AnalyticsEngineDataPoint = { indexes: [], blobs: [] };
	let ipAddress: string = "";
	let asn: string = "";
	let city: string = "";
	if (c.req.raw.cf != undefined && c.req.raw.cf) {
		dataPoint.blobs!.push(c.req.raw.cf.clientTrustScoretr as string);
		asn = c.req.raw.cf.asn as string;
		dataPoint.blobs!.push(asn);
		ipAddress = c.req.header('cf-connecting-ip') as string
		dataPoint.blobs!.push(ipAddress);
		dataPoint.blobs!.push(c.req.header('User-Agent') as string);
		if (c.req.raw.cf.city) {
			city = c.req.raw.cf.city as string;
			dataPoint.blobs!.push(city);
		}
		if (c.req.raw.cf.country) {
			dataPoint.blobs!.push(c.req.raw.cf.country as string);
		}
	}
	let isLeech: boolean = false;

	if (leechHandlingActive) {
		const object = await c.env.Data.get("leeches");

		if (object != null) {
			var leeches: string[] = await object.json();
			console.log(`ip-address: ${ipAddress} index: ${leeches.indexOf(ipAddress)} lookup: ${JSON.stringify(leeches)}`);
			if (leeches.indexOf(ipAddress) >= 0) {
				isLeech = true;
			}
		}
	}

	if (!isLeech) {
		return c.req
			.json()
			.then(async (data: any) => {
				let requestBody = JSON.stringify(data);
				let index: string = "";
				if (data.search) {
					index = data.search;
					dataPoint.blobs!.push(data.search);
					dataPoint.blobs!.push("search");
				}
				if (data.filter) {
					let filter: string = data.filter;
					if (filter.indexOf("(podcastName eq '") == 0) {
						let query = filter.slice(17, -2);
						if (index) {
							index += " podcast=" + query;
						} else {
							index = "podcast=" + query;
						}
						dataPoint.blobs!.push(query);
						dataPoint.blobs!.push("podcast");
					} else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
						let query = filter.slice(22, - 2);
						if (index) {
							index += " subject=" + query;
						} else {
							index = "subject=" + query;
						}
						dataPoint.blobs!.push(query);
						dataPoint.blobs!.push("subject");
					} else {
						console.log("Unrecognised search filter");
					}
				}
				dataPoint.indexes!.push(index);

				if (!data.search && !data.filter) {
					console.log("Unrecognised search request");
				}
				if (dataPoint) {
					dataPoint.blobs?.push(data.skip);
					dataPoint.blobs?.push(data.orderby);
				}


				let response = await fetch(url, {
					cf: {
						cacheEverything: true,
						cacheTtl: 600
					},
					headers: {
						"api-key": c.env.apikey,
						"content-type": "application/json;charset=UTF-8",
					},
					body: requestBody,
					method: "POST"
				});
				if (dataPoint) {
					dataPoint.blobs?.push(response.status.toString());
					c.env.Analytics.writeDataPoint(dataPoint);
				}

				c.header("Cache-Control", "max-age=600");
				c.header("Content-Type", "application/json");
				c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin")));
				c.header("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

				if (response.status != 200) {
					return c.json(response.body, 400)
				}

				let body: any = await response.json();
				body["@odata.context"] = null;
				return c.json(body, 200);
			});
	} else {
		const leechResponse = {
			"@odata.context": null,
			"@odata.count": 1,
			"@search.facets": {
				"subjects": [],
				"podcastName": []
			},
			"value": [{
				"@search.score": 1.0,
				"id": "00000000-0000-0000-0000-000000000000",
				"episodeTitle": "Leech Detected",
				"podcastName": "Leech Detected",
				"episodeDescription": "Contact leeching@cultpodcasts.com.",
				"release": "1970-01-01T00:00:00Z",
				"duration": "01:00:00.0000000",
				"explicit": false,
				"spotify": null,
				"apple": null,
				"youtube": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
				"subjects": []
			}]
		};
		c.header("Cache-Control", "max-age=600");
		c.header("Content-Type", "application/json");
		c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin")));
		c.header("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

		dataPoint.blobs!.push("Leech");
		c.env.Analytics.writeDataPoint(dataPoint);
		return c.json(leechResponse, 200);
	}
});

app.get("/submit", async (c) => {
	if (c.req.header("key") != c.env.gatewayKey) {
		return c.json({ message: "Unauthorised" }, 401);
	}
	let submissionIds = c.env.DB
		.prepare("SELECT id FROM urls WHERE state=0");
	let result = await submissionIds.all();
	if (result.success) {
		const inClause = result.results
			.map((urlId) => {
				if (!Number.isInteger(urlId.id)) { throw Error("invalid id, expected an integer"); }
				return urlId.id;
			})
			.join(',');
		let urls = "SELECT id, url, timestamp_date, ip_address, country, user_agent FROM urls WHERE id IN ($urlIds)";
		urls = urls.replace('$urlIds', inClause);
		let urlResults = await c.env.DB
			.prepare(urls)
			.run();
		if (urlResults.success) {
			let update = "UPDATE urls SET state=1 WHERE id IN ($urlIds)";
			update = update.replace('$urlIds', inClause);
			let raiseState = await c.env.DB
				.prepare(update)
				.all();
			if (raiseState.success) {
				return c.json(urlResults);
			} else {
				return c.text("Failure to raise state of new submissons in ids " + result.results.join(", "), 400);
			}
		} else {
			return c.text("Unable to retrieve new submissions", 500);
		}
	} else {
		return c.text(result.error!, 500);
	}
});

app.post("/submit", async (c) => {
	c.header("Cache-Control", "max-age=600");
	c.header("Content-Type", "application/json");
	c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin")));
	c.header("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

	return c.req
		.json()
		.then(async (data: any) => {
			let url: URL | undefined;
			let urlParam = data.url;
			if (urlParam == null) {
				return c.json({ error: "Missing url param." }, 400);
			}
			try {
				url = new URL(urlParam);
			} catch {
				return c.json({ error: `Invalid url '${data.url}'.` }, 400);
			}
			let insert = c.env.DB
				.prepare("INSERT INTO urls (url, timestamp, timestamp_date, ip_address, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
				.bind(url.toString(), Date.now(), new Date().toLocaleString(), c.req.header("CF-Connecting-IP"), c.req.header("CF-IPCountry"), c.req.header("User-Agent"));
			let result = await insert.run();

			if (result.success) {
				return c.json({ success: "Submitted" });
			} else {
				return c.json({ error: "Unable to accept" }, 400);
			}
		});
});

export default app;

async function auth(request: Request) {
	const jwt = request.headers.get('Authorization');
	if (jwt) {
		const issuer = 'https://dev-q3x2z6aofdzbjkkf.us.auth0.com/';
		const audience = 'https://api.cultpodcasts.com/';

		const result = await parseJwt(jwt.slice(7), issuer, audience);
		if (!result.valid) {
			console.log(result.reason);
		} else {
			console.log(result.payload); // { iss, sub, aud, iat, exp, ...claims }
		}
	}
}