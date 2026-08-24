/** Preview-only wide chrome (`wl=`). Default `footer` is the live card. */
export type WideLayoutId = "footer" | "columns" | "stack" | "inline";

export function parseWideLayout(value: string | undefined | null): WideLayoutId {
	if (value === "columns" || value === "stack" || value === "inline") {
		return value;
	}
	return "footer";
}
