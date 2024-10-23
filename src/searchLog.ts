import { searchMode } from "./searchMode";

export interface searchLog {
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
    modeStr?: string;
}

export class searchLogImpl implements searchLog {
    add(props: searchLog): void {

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
        if (props.hasOwnProperty('additionalQuery')) {
            this.additionalQuery = props.additionalQuery;
        }
        if (props.hasOwnProperty('episodeId')) {
            this.episodeId = props.episodeId;
        }
        if (props.hasOwnProperty('mode')) {
            this.mode = props.mode;
            this.modeStr = searchMode[this.mode!];
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
    error: any;
    leech?: boolean;
    searchStatus?: number;
    orderBy?: string;
    skip?: number;
    additionalQuery?: string;
    episodeId?: string;
    mode?: searchMode;
    modeStr?: string;
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
