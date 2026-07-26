import { describe, expect, it } from "vitest";
import { azureEpisodePathSuffix } from "../src/azureEpisodePathSuffix";

describe("azureEpisodePathSuffix", () => {
	it("keeps podcast name + episode id when the name has no slash", () => {
		expect(azureEpisodePathSuffix("Cult Psychology", "efbc1f08-eebd-43ed-b69b-ebffc45e1440"))
			.toBe("/Cult%20Psychology/efbc1f08-eebd-43ed-b69b-ebffc45e1440");
	});

	it("falls back to episode-id-only when the podcast name contains a slash", () => {
		expect(
			azureEpisodePathSuffix(
				"The FOX True Crime Podcast w/ Emily Compagno",
				"efbc1f08-eebd-43ed-b69b-ebffc45e1440"
			)
		).toBe("/efbc1f08-eebd-43ed-b69b-ebffc45e1440");
	});
});
