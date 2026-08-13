/** Read PNG / JPEG pixel size from raw bytes (no decode). */
export function readImageSize(bytes: ArrayBuffer): { width: number; height: number } | null {
	const u8 = new Uint8Array(bytes);
	if (u8.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
		const width = ((u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19]) >>> 0;
		const height = ((u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]) >>> 0;
		if (width > 0 && height > 0) {
			return { width, height };
		}
		return null;
	}
	if (u8.length > 4 && u8[0] === 0xff && u8[1] === 0xd8) {
		let i = 2;
		while (i < u8.length - 8) {
			if (u8[i] !== 0xff) {
				i++;
				continue;
			}
			const marker = u8[i + 1];
			if (marker === 0xd9 || marker === 0xda) {
				break;
			}
			const len = (u8[i + 2] << 8) | u8[i + 3];
			if (
				(marker >= 0xc0 && marker <= 0xc3) ||
				(marker >= 0xc5 && marker <= 0xc7) ||
				(marker >= 0xc9 && marker <= 0xcb) ||
				(marker >= 0xcd && marker <= 0xcf)
			) {
				const height = (u8[i + 5] << 8) | u8[i + 6];
				const width = (u8[i + 7] << 8) | u8[i + 8];
				if (width > 0 && height > 0) {
					return { width, height };
				}
				return null;
			}
			if (len < 2) {
				break;
			}
			i += 2 + len;
		}
	}
	return null;
}

/** Fit source pixels inside maxW×maxH without cropping or stretching. */
export function fitArtWithin(
	srcWidth: number,
	srcHeight: number,
	maxWidth: number,
	maxHeight: number
): { width: number; height: number } {
	if (srcWidth <= 0 || srcHeight <= 0) {
		return { width: maxWidth, height: maxHeight };
	}
	const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
	return {
		width: Math.max(1, Math.round(srcWidth * scale)),
		height: Math.max(1, Math.round(srcHeight * scale))
	};
}
