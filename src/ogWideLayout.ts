/** Preview-only wide chrome (`wl=`). Default `columns` is the live card. */
export type WideLayoutId = "footer" | "columns" | "stack" | "inline";

export function parseWideLayout(value: string | undefined | null): WideLayoutId {
	if (value === "footer" || value === "stack" || value === "inline") {
		return value;
	}
	return "columns";
}
