import { localId } from "./local-id";
import { DEFAULT_SETTINGS, normalizeSettings, settingsProblem, type ProseToolkitSettings } from "./settings";

/** Public adapter contract also checked by FolderToolkit's settings-writer native fixtures. */
export interface SettingsFiles {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	process(path: string, edit: (data: string) => string): Promise<string>;
	copy(source: string, target: string): Promise<void>;
	remove(path: string): Promise<void>;
}
export class SettingsConflictError extends Error {}
const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof ProseToolkitSettings>;
function checked(raw: string): Record<string, unknown> {
	const value: unknown = JSON.parse(raw);
	const problem = settingsProblem(value);
	if (problem) throw new SettingsConflictError(problem);
	return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function sibling(path: string, name: string) {
	return path.slice(0, Math.max(0, path.lastIndexOf("/") + 1)) + name;
}
function alive(canPublish: () => boolean) {
	if (!canPublish()) throw new SettingsConflictError("The settings owner closed. No settings were published.");
}
async function immutable(files: SettingsFiles, path: string, data: string) {
	const staged = path + ".staged";
	if (await files.exists(staged)) throw new SettingsConflictError("Recovery staging name already exists.");
	await files.write(staged, data);
	try {
		await files.copy(staged, path);
		if (await files.read(path) !== data) throw new SettingsConflictError("Recovery verification failed.");
	} finally {
		// Only the UUID-owned staging file can be removed; the confirmed recovery stays.
		if (await files.exists(staged)) await files.remove(staged);
	}
}
export async function publishSettings(files: SettingsFiles, path: string, base: unknown, draft: ProseToolkitSettings, canPublish = () => true) {
	const intended = Object.freeze(normalizeSettings(draft));
	const previous = normalizeSettings(base);
	const changed = keys.filter((key) => intended[key] !== previous[key]);
	alive(canPublish);
	const exists = await files.exists(path);
	const original = exists ? await files.read(path) : null;
	if (original !== null) checked(original);
	if (!changed.length) {
		alive(canPublish);
		const data = original === null ? {} : checked(original);
		return { data, settings: normalizeSettings(data), recoveryPath: null };
	}
	const id = localId();
	const recoveryPath = sibling(path, ".prose-toolkit-recovery-" + id + ".json");
	await immutable(files, recoveryPath, JSON.stringify({ schemaVersion: 1, reason: "Before settings change", original, intended }));
	alive(canPublish);
	if (!exists) {
		const staged = sibling(path, ".prose-toolkit-bootstrap-" + id + ".json");
		await files.write(staged, JSON.stringify(DEFAULT_SETTINGS));
		try {
			alive(canPublish);
			try { await files.copy(staged, path); }
			catch (error) { if (!(await files.exists(path))) throw error; }
		} finally { if (await files.exists(staged)) await files.remove(staged); }
	}
	let proposed = "";
	try {
		const result = await files.process(path, (raw) => {
			alive(canPublish);
			const current = checked(raw), currentKnown = normalizeSettings(current);
			for (const key of changed) {
				if (currentKnown[key] !== previous[key] && currentKnown[key] !== intended[key])
					throw new SettingsConflictError("Settings changed in another vault instance: " + key + ". Your draft is kept in " + recoveryPath);
			}
			const merged: Record<string, unknown> = { ...current, schemaVersion: 1, settingsWriteId: id };
			for (const key of changed) merged[key] = intended[key];
			proposed = JSON.stringify(merged);
			return proposed;
		});
		const data = checked(result);
		return { data, settings: normalizeSettings(data), recoveryPath };
	} catch (error) {
		// A rejected response can follow a durable write. Confirm only this exact request.
		if (proposed) {
			try {
				const raw = await files.read(path);
				if (raw === proposed) { const data = checked(raw); return { data, settings: normalizeSettings(data), recoveryPath }; }
			} catch { /* Keep the prepared recovery and original error when confirmation is unavailable. */ }
		}
		throw error;
	}
}
export async function restoreDefaultSettings(files: SettingsFiles, path: string, canPublish = () => true, expectedRaw?: string) {
	alive(canPublish);
	const original = await files.read(path);
	if (expectedRaw !== undefined && original !== expectedRaw) throw new SettingsConflictError("Saved settings changed after recovery was selected. Open recovery again.");
	const recoveryPath = sibling(path, ".prose-toolkit-recovery-" + localId() + ".json");
	await immutable(files, recoveryPath, JSON.stringify({ schemaVersion: 1, reason: "Explicit settings recovery", original }));
	alive(canPublish);
	const result = await files.process(path, (raw) => {
		alive(canPublish);
		if (raw !== original) throw new SettingsConflictError("Saved settings changed during recovery. No defaults were published.");
		return JSON.stringify({ ...DEFAULT_SETTINGS, schemaVersion: 1 });
	});
	return { data: checked(result), settings: normalizeSettings(checked(result)), recoveryPath };
}
