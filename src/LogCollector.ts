import { ActionContext } from "./ActionContext";
import { Auth0ActionContext } from "./Auth0ActionContext";
import { endpointLog } from "./endpointLog";
import { endpointOperation } from "./endpointOperation";

export class LogCollector implements endpointOperation {
    collectRequest(c: Auth0ActionContext | ActionContext) {
        if (c.req.raw.cf != undefined && c.req.raw.cf) {
            this.add({
                clientTrustScoretr: c.req.raw.cf.clientTrustScoretr as string,
                asn: c.req.raw.cf.asn as string,
                ipAddress: c.req.header('cf-connecting-ip') as string,
                userAgent: c.req.header('User-Agent') as string
            });
            if (c.req.raw.cf.city) {
                this.add({ city: c.req.raw.cf.city as string });
            }
            if (c.req.raw.cf.country) {
                this.add({ country: c.req.raw.cf.country as string });
            }
            if (c.req.raw.cf.verifiedBotCategory) {
                this.add({ verifiedBotCategory: c.req.raw.cf.verifiedBotCategory as string });
            }
            if (c.req.raw.cf.asOrganization) {
                this.add({ asOrganization: c.req.raw.cf.asOrganization as string });
            }
        }
    }

    add(props: endpointOperation): void {
        if (props.hasOwnProperty('country')) {
            this.country = props.country;
        }
        if (props.hasOwnProperty('city')) {
            this.city = props.city;
        }
        if (props.hasOwnProperty('userAgent')) {
            this.userAgent = props.userAgent;
        }
        if (props.hasOwnProperty('clientTrustScoretr')) {
            this.clientTrustScoretr = props.clientTrustScoretr;
        }
        if (props.hasOwnProperty('asn)')) {
            this.asn = props.asn;
        }
        if (props.hasOwnProperty('ipAddress')) {
            this.ipAddress = props.ipAddress;
        }
        if (props.hasOwnProperty('verifiedBotCategory')) {
            this.verifiedBotCategory = props.verifiedBotCategory;
        }
        if (props.hasOwnProperty('asOrganization')) {
            this.asOrganization = props.asOrganization;
        }
        if (props.hasOwnProperty('message')) {
            this.message = props.message;
        }
        if (props.hasOwnProperty('status')) {
            this.status = props.status;
        }
    }

    toEndpointLog(): endpointLog {
        const endpointLog: endpointLog = {
            request: {
                country: this.country,
                city: this.city,
                userAgent: this.userAgent,
                clientTrustScoretr: this.clientTrustScoretr,
                asn: this.asn,
                ipAddress: this.ipAddress,
                verifiedBotCategory: this.verifiedBotCategory,
                asOrganization: this.asOrganization
            }
        };
        if (this.message) {
            endpointLog.message = this.message;
        }
        if (this.status) {
            endpointLog.status = this.status;
        }
        return endpointLog;
    }

    message?: string;
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
