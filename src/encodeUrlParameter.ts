export function encodeUrlParameter(parameter: string): string {
    parameter = parameter.replace("/", encodeURIComponent("/"));
    return encodeURIComponent(parameter);
}
