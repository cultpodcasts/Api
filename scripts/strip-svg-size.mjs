import fs from "node:fs";

const path = "src/assets/cultpodcasts.svg";
let svg = fs.readFileSync(path, "utf8");
svg = svg.replace(/\s+width="[^"]*"/, "").replace(/\s+height="[^"]*"/, "");
fs.writeFileSync(path, svg);
console.log(svg.slice(0, 140));
