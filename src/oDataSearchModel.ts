export interface oDataSearchModel {
    search?: string;
    filter?: string;
    skip?: string;
    orderby?: string;
    top?: number;
    count?: boolean;
    /** Azure Search facet expressions (field names may be rewritten for legacy clients). */
    facets?: string | string[];
    /** Azure Search $select field list. */
    select?: string;
    searchMode?: string;
    /** Azure Search query language. Set to full when an unquoted phrase is boosted (RPP #1434). */
    queryType?: string;
}
