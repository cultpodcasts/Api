/** Strip // and /* *\/ comments from JSONC without touching string contents. */
export function parseJsonc(text: string): any {
	let out = "";
	let i = 0;
	let inString = false;
	while (i < text.length) {
		const ch = text[i];
		const next = text[i + 1];
		if (inString) {
			out += ch;
			if (ch === "\\") {
				out += next;
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i++;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i++;
			continue;
		}
		if (ch === "/" && next === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			i = text.indexOf("*/", i + 2) + 2;
			continue;
		}
		out += ch;
		i++;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
