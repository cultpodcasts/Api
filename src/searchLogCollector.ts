import { ActionContext } from "./ActionContext";
import { ISearchResult } from "./ISearchResult";
import { oDataSearchModel } from "./oDataSearchModel";
import { searchLog } from "./searchLog";
import { searchMode } from "./searchMode";
import { searchOperation } from "./searchOperation";

export class searchLogCollector implements searchOperation {
    collectRequest(c: ActionContext) {
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
                this.add({ verifiedBotCategory: c.req.raw.cf.verifiedBotCategory as string })
            }
            if (c.req.raw.cf.asOrganization) {
                this.add({ asOrganization: c.req.raw.cf.asOrganization as string })
            }
        }
    }

    collectSearchRequest(data: oDataSearchModel) {
        if (data.search) {
            this.add({ query: data.search, mode: searchMode.search });
        }
        if (data.filter) {
            let filter: string = data.filter;
            if (filter.indexOf("(podcastName eq '") == 0) {
                const idFilter = "') and (id eq ";
                let filterCutoff = -2;
                let query = filter.slice(17, filterCutoff);
                if (filter.indexOf(idFilter) >= 0) {
                    filterCutoff = filterCutoff = filter.indexOf(idFilter);
                    const episodeId = filter.slice(filterCutoff + idFilter.length + 1, -2);
                    const podcastName =
                        this.add({ mode: searchMode.episode, episodeId: episodeId, filter: filter });
                } else {
                    this.add({ podcastName: query, mode: searchMode.podcast, filter: filter });
                }
            } else if (filter.indexOf("subjects/any(s: s eq '") == 0) {
                let query = filter.slice(22, -2);
                this.add({ subject: query, mode: searchMode.subject });
            } else if (filter.indexOf("(id eq '") == 0) {
                let query = filter.slice(8, -2);
                this.add({ episodeId: query, mode: searchMode.shortnerFallback, filter: filter });
            } else {
                this.add({ unrecognisedSearchFilter: true, filter: filter });
            }
        }
        if (!data.search && !data.filter) {
            this.add({ unrecognisedSearchFilter: true, missingSearch: true });
        }
        if (data.skip) {
            this.add({ skip: parseInt(data.skip) });
        }
        if (data.orderby && data.orderby != "") {
            this.add({ orderBy: data.orderby });
        }
    }

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
        if (props.hasOwnProperty('subject')) {
            this.subject = props.subject;
        }
        if (props.hasOwnProperty('podcastName')) {
            this.podcastName = props.podcastName;
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
        if (props.hasOwnProperty('verifiedBotCategory')) {
            this.verifiedBotCategory = props.verifiedBotCategory;
        }
        if (props.hasOwnProperty('asOrganization')) {
            this.asOrganization = props.asOrganization;
        }
        if (props.hasOwnProperty('searchResult')) {
            this.searchResult = {
                podcastName: props.searchResult!.podcastName,
                episodeTitle: props.searchResult!.episodeTitle
            };
        }
        if (props.hasOwnProperty('results')) {
            this.results = props.results;
        }
    }

    toSearchLog(): searchLog {
        const searchLog: searchLog = {
            query: {
                orderBy: this.orderBy,
                skip: this.skip,
                episodeId: this.episodeId,
                mode: this.mode && Number(this.mode) >= 0 ? searchMode[this.mode] : undefined,
                podcastName: this.podcastName,
                subject: this.subject,
                query: this.query,
                filter: this.filter,
            },
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
        if (this.searchResult) {
            searchLog.searchResult = this.searchResult;
        } else if (this.results) {
            searchLog.results = this.results;
        }
        if (this.error) {
            searchLog.errors = {
                searchStatus: this.searchStatus,
                leech: this.leech,
                unrecognisedSearchFilter: this.unrecognisedSearchFilter,
                missingSearch: this.missingSearch
            };
        }
        return searchLog;
    }

    error: boolean = false;
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
    verifiedBotCategory?: string;
    asOrganization?: string;
    searchResult?: ISearchResult;
    results?: number | undefined | null;
}
