import { searchLog } from "./searchLog";
import { searchMode } from "./searchMode";
import { searchOperation } from "./searchOperation";

export class searchOperationCollector implements searchOperation {
    add(props: searchOperation): void {
        if (props.hasOwnProperty('leech')) {
            this.leech = props.leech;
            this.error = true;
        }
        if (props.hasOwnProperty('searchStatus')) {
            this.searchStatus = props.searchStatus;
            if (this.searchStatus != 200) {
                this.error = true;
            }
        }
        if (props.hasOwnProperty('orderBy')) {
            this.orderBy = props.orderBy;
        }
        if (props.hasOwnProperty('skip')) {
            this.skip = props.skip;
        }
        if (props.hasOwnProperty('additionalQuery')) {
            this.additionalQuery = props.additionalQuery;
        }
        if (props.hasOwnProperty('episodeId')) {
            this.episodeId = props.episodeId;
        }
        if (props.hasOwnProperty('mode')) {
            this.mode = props.mode;
        }
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
        if (props.hasOwnProperty('query')) {
            this.query = props.query;
        }
        if (props.hasOwnProperty('unrecognisedSearchFilter')) {
            this.unrecognisedSearchFilter = props.unrecognisedSearchFilter;
            this.error = true;
        }
        if (props.hasOwnProperty('filter')) {
            this.filter = props.filter;
        }
        if (props.hasOwnProperty('missingSearch')) {
            this.missingSearch = props.missingSearch;
            this.error = true;
        }
    }

    toSearchLog(): searchLog {
        return {
            query: {
                orderBy: this.orderBy,
                skip: this.skip,
                episodeId: this.episodeId,
                mode: this.mode && Number(this.mode) >= 0 ? searchMode[this.mode] : undefined,
                additionalQuery: this.additionalQuery,
                query: this.query,
                filter: this.filter,
            },
            errors: {
                leech: this.leech,
                unrecognisedSearchFilter: this.unrecognisedSearchFilter,
                missingSearch: this.missingSearch
            },
            searchStatus: this.searchStatus,
            request: {
                country: this.country,
                city: this.city,
                userAgent: this.userAgent,
                clientTrustScoretr: this.clientTrustScoretr,
                asn: this.asn,
                ipAddress: this.ipAddress,
            }
        };
    }

    error: boolean = false;
    leech?: boolean;
    searchStatus?: number;
    orderBy?: string;
    skip?: number;
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
    unrecognisedSearchFilter?: boolean;
    filter?: string;
    missingSearch?: boolean;
}
