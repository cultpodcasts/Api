import { searchMode } from "./searchMode";

export interface searchLog {
    leech?: boolean;
    searchStatus?: string;
    orderBy?: any;
    skip?: any;
    additionalQuery?: string;
    episodeId?: string;
    mode?: searchMode;
    country?: string;
    city?: string;
    userAgent?: string;
    clientTrustScoretr?: string;
    asn?: string;
    ipAddress?: string;
    query?: string;
}
