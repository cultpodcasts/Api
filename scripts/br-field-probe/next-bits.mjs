import fs from "fs";

for (const f of ["direct", "br-episode"]) {
	const h = fs.readFileSync(`out/${f}.html`, "utf8");
	const programmeTitle = (h.match(/"programmeTitle":"([^"]+)/) || [])[1];
	const episodeId = (h.match(/"episodeId":"([^"]+)/) || [])[1];
	console.log(f, {
		len: h.length,
		hasNextData: h.includes("__NEXT_DATA__"),
		programmeTitle,
		episodeId
	});
}
