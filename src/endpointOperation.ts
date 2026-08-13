import { EndpointLogOutcome } from "./endpointLog";

export interface endpointOperation {
	event?: string;
	outcome?: EndpointLogOutcome;
	route?: string;
	message?: string;
	messages?: string[];
	status?: number;
	country?: string;
	city?: string;
	userAgent?: string;
	clientTrustScoretr?: string;
	asn?: string;
	ipAddress?: string;
	verifiedBotCategory?: string;
	asOrganization?: string;
}
