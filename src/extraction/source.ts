/** Source identity is separate from the filename used for a generated note. */
export interface ExtractionSource {
	path: string;
	title: string;
}

export function sourceLink(source: ExtractionSource | string): string {
	if (typeof source === "string") return `[[${source}]]`;
	const label = source.title.replace(/[\\[\]]/gu, "\\$&").replace(/[\r\n]+/gu, " ");
	const destination = source.path.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
	return `[${label}](<${destination}>)`;
}
export function sourceTitle(source: ExtractionSource | string): string {
	return typeof source === "string" ? source : source.title;
}
