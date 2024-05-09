import { parseJwt } from '@cfworker/jwt';
import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { stream } from 'hono/streaming'
import { createMiddleware } from 'hono/factory'
import { Auth0JwtPayload } from './Auth0JwtPayload';
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaD1 } from "@prisma/adapter-d1";

type Env = {
	Content: R2Bucket;
	Data: R2Bucket;
	Analytics: AnalyticsEngineDataset;
	DB: D1Database;
	apiDB: D1Database;
	apikey: string;
	apihost: string;
	gatewayKey: string;
	auth0Issuer: string;
	auth0Audience: string;
	secureSubmitEndpoint: string;
}

const allowedOrigins: Array<string> = [
	"https://cultpodcasts.com",
	"http://localhost:4200",
	"https://local.cultpodcasts.com:4200",
	"https://localhost:4200",
	"https://feature-api-authorisation.website-83e.pages.dev"
];

function getOrigin(origin: string | null | undefined) {
	if (origin == null || allowedOrigins.indexOf(origin.toLowerCase()) == -1) {
		origin = allowedOrigins[0];
	}
	return origin;
}

const app = new Hono<{ Bindings: Env }>();

const auth0Middleware = createMiddleware<{
	Bindings: Env,
	Variables: {
		auth0: (payload: any) => any
	}
}>(async (c, next) => {
	const authorization = c.req.header('Authorization');
	const bearer = "Bearer ";
	c.set('auth0', (payload) => { })
	if (authorization && authorization.startsWith(bearer)) {
		const token = authorization.slice(bearer.length);
		const result = await parseJwt(token, c.env.auth0Issuer, c.env.auth0Audience);
		if (result.valid) {
			c.set('auth0', (payload) => result.payload as Auth0JwtPayload)
		} else {
			console.log(result.reason);
		}
	}
	await next()
})

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
		stream.onAbort(() => {
			console.log('Aborted!')
		})
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

app.get("/submit", auth0Middleware, async (c) => {
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');

	if (auth0Payload?.permissions && auth0Payload.permissions.includes('submit')) {
		try {
			const submissionIds = await prisma.submissions.findMany({
				where: {
					state: 0
				},
				select: {
					id: true
				}
			})
			const urlResults = await prisma.submissions.findMany({
				where: {
					id: { in: submissionIds.map((record) => record.id) },
				}
			})
			const updates = await prisma.submissions.updateMany({
				where: {
					id: { in: submissionIds.map((record) => record.id) }
				},
				data: {
					state: 1,
				},
			});
			return c.json(urlResults);
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError) {
				console.log(`PrismaClientKnownRequestError code: '${e.code}'`, e);
			}
			return c.json({ error: "Unable to accept" }, 400);
		}
	} else {
		return c.json({ message: "Unauthorised" }, 401);
	}
});

app.post("/submit", auth0Middleware, async (c) => {
	const auth0Payload: Auth0JwtPayload = c.var.auth0('payload');
	c.header("Cache-Control", "max-age=600");
	c.header("Content-Type", "application/json");
	c.header("Access-Control-Allow-Origin", getOrigin(c.req.header("Origin")));
	c.header("Access-Control-Allow-Methods", "POST,GET,OPTIONS");

	const data = await c.req.json();
	if (auth0Payload?.permissions && auth0Payload.permissions.includes('submit')) {
		const authorisation:string= c.req.header("Authorization")!;
		console.log(`Using auth header '${authorisation.slice(0, 20)}..'`);
		const resp = await fetch(c.env.secureSubmitEndpoint, {
			headers: {
				'authorisation': authorisation,
				"content-type": "application/json;charset=UTF-8",
			},
			body: data,
			method: "POST"
		});
		if (resp.status == 200) {
			console.log(`Successfully used secure enpoint.`);
			return c.json({ success: "Submitted" });
		} else {
			console.log(`Failed to use secure submit endpoint. Response code: '${resp.status}'.`);
		}
	}

	console.log(`Storing submission in d1.`);
	const adapter = new PrismaD1(c.env.apiDB);
	const prisma = new PrismaClient({ adapter });
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

	try {
		const record = {
			url: url.toString(),
			ip_address: c.req.header("CF-Connecting-IP") ?? null,
			user_agent: c.req.header("User-Agent") ?? null,
			country: c.req.header("CF-IPCountry") ?? null
		};
		const submission = await prisma.submissions.create({
			data: record
		});
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError) {
			console.log(`PrismaClientKnownRequestError code: '${e.code}'`, e);
		}
		return c.json({ error: "Unable to accept" }, 400);
	}
	return c.json({ success: "Submitted" });
});


export default app;
