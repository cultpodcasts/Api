import { AddResponseHeaders } from "./AddResponseHeaders";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { Endpoint } from "./Endpoint";
import { proxyJsonCommandToAzure } from "./proxyJsonCommandToAzure";

/**
 * POST /newsorganisation/:id/reports/move - curator move of news reports from this news organisation into another
 * (RPP #1397, `NewsOrganisationReportsMove`). Azure plans every id before writing; 404/409 refuse with nothing written.
 */
export async function moveNewsOrganisationReports(c: Auth0ActionContext): Promise<Response> {
	const id = c.req.param("id");
	AddResponseHeaders(c, { methods: ["POST", "OPTIONS"] });
	return proxyJsonCommandToAzure(
		c,
		{
			permission: "curate",
			endpoint: Endpoint.newsOrganisation,
			method: "POST",
			pathSuffix: `/${encodeURIComponent(id)}/reports/move`,
			successStatuses: [202],
			forwardStatuses: [400, 404, 409, 500],
			logName: "secure-newsorganisation-reports-move-endpoint"
		},
		"\"targetNewsOrganisationId\": string, \"reportIds\"?: string[], \"moveYouTubeChannels\"?: boolean"
	);
}
