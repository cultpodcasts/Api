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
}
