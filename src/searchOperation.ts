import { searchMode } from "./searchMode";

export interface searchOperation {
    leech?: boolean;
    searchStatus?: number;
    orderBy?: string;
    skip?: number;
    subject?: string;
    podcastName?: string;
    episodeId?: string;
    mode?: searchMode;
    country?: string;
    city?: string;
    userAgent?: string;
    clientTrustScoretr?: string;
    asn?: string;
    ipAddress?: string;
    query?: string;
    unrecognisedSearchFilter?: boolean;
    filter?: string;
    missingSearch?: boolean;
    modeStr?: string;
    verifiedBotCategory?: string;
    asOrganization?: string;
}
