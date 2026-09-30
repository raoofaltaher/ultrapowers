import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for pi";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsDir = resolve(packageRoot, "skills");
const bootstrapSkillPath = resolve(skillsDir, "using-ultrapowers", "SKILL.md");

let cachedBootstrap: string | null | undefined;

const NUDGE_SCAFFOLD = "This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.";
const NUDGE_REPAIR = "This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.";

let cachedPluginVersion: string | null | undefined;

function pluginVersion(): string | null {
	if (cachedPluginVersion !== undefined) return cachedPluginVersion;
	try {
		const pkg = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as { version?: unknown };
		cachedPluginVersion = typeof pkg.version === "string" ? pkg.version : null;
	} catch {
		cachedPluginVersion = null;
	}
	return cachedPluginVersion;
}

function versionLess(a: string, b: string): boolean {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
	}
	return false;
}

function projectNudge(directory: string): string | null {
	try {
		let current = resolve(directory);
		let markerFile: string | null = null;
		while (!markerFile) {
			const candidate = resolve(current, ".agents", "ultrapowers.json");
			if (existsSync(candidate)) markerFile = candidate;
			else if (dirname(current) === current) return NUDGE_SCAFFOLD;
			else current = dirname(current);
		}
		let marker: unknown;
		try {
			marker = JSON.parse(readFileSync(markerFile, "utf8"));
		} catch {
			return NUDGE_REPAIR;
		}
		const recorded = (marker as { pluginVersion?: unknown } | null)?.pluginVersion;
		// The marker is project content; only a plain dotted version may reach the bootstrap.
		if (typeof recorded !== "string" || !/^[0-9]+([.][0-9]+){0,3}$/.test(recorded)) return NUDGE_REPAIR;
		const version = pluginVersion();
		if (version && versionLess(recorded, version)) {
			return `This project's ultrapowers scaffold is from version ${recorded}; the plugin is ${version}. Offer /ultrapowers:init to upgrade before other work.`;
		}
		return null;
	} catch {
		return null;
	}
}

function withProjectNudge(bootstrap: string, directory: string): string {
	const nudge = projectNudge(directory);
	if (!nudge) return bootstrap;
	const close = "</EXTREMELY_IMPORTANT>";
	const at = bootstrap.lastIndexOf(close);
	return at === -1 ? `${bootstrap}\n\n${nudge}` : `${bootstrap.slice(0, at)}\n${nudge}\n${bootstrap.slice(at)}`;
}

export default function ultrapowersPiExtension(pi: ExtensionAPI) {
	let injectBootstrap = true;

	pi.on("resources_discover", async () => ({
		skillPaths: [skillsDir],
	}));

	pi.on("session_start", async () => {
		injectBootstrap = true;
	});

	pi.on("session_compact", async () => {
		injectBootstrap = true;
	});

	pi.on("agent_end", async () => {
		injectBootstrap = false;
	});

	pi.on("context", async (event, ctx) => {
		if (!injectBootstrap) return;
		if (event.messages.some(messageContainsBootstrap)) return;

		const bootstrap = getBootstrapContent();
		if (!bootstrap) return;

		const bootstrapMessage = {
			role: "user" as const,
			content: [{ type: "text" as const, text: withProjectNudge(bootstrap, ctx?.cwd ?? process.cwd()) }],
			timestamp: Date.now(),
		};

		const insertAt = firstNonCompactionSummaryIndex(event.messages);
		return {
			messages: [
				...event.messages.slice(0, insertAt),
				bootstrapMessage,
				...event.messages.slice(insertAt),
			],
		};
	});
}

function getBootstrapContent(): string | null {
	if (cachedBootstrap !== undefined) return cachedBootstrap;

	try {
		const skillContent = readFileSync(bootstrapSkillPath, "utf8");
		const body = stripFrontmatter(skillContent);
		cachedBootstrap = `${EXTREMELY_IMPORTANT_MARKER}
${BOOTSTRAP_MARKER}

You have ultrapowers.

The using-ultrapowers skill content is included below and is already loaded for this Pi session. Follow it now. Do not try to load using-ultrapowers again.

${body}

${piToolMapping()}
</EXTREMELY_IMPORTANT>`;
		return cachedBootstrap;
	} catch {
		cachedBootstrap = null;
		return null;
	}
}

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return (match ? match[1] : content).trim();
}

function piToolMapping(): string {
	return `## Pi tool mapping

Pi has native skills but does not expose Claude Code's \`Skill\` tool. When an Ultrapowers instruction says to invoke a skill, use Pi's native skill system instead: load the relevant \`SKILL.md\` with \`read\` when the skill applies, or let a human invoke \`/skill:name\` explicitly.

Pi's built-in coding tools are lowercase: \`read\`, \`write\`, \`edit\`, \`bash\`, plus optional \`grep\`, \`find\`, and \`ls\`. Use those for the corresponding actions: read a file, create or edit files, run shell commands, search file contents, find files by name, and list directories.

Pi does not ship a standard subagent tool. If a subagent tool such as \`subagent\` from \`pi-subagents\` is available, use it for Ultrapowers subagent workflows. If no subagent tool is available, do the work in this session or explain the missing capability instead of inventing \`Task\` calls.

Pi does not ship a standard task-list tool. If an installed todo/task tool is available, use it. Otherwise track work in plan files or a repo-local \`TODO.md\` when task tracking is needed. Treat older \`TodoWrite\` references as this task-tracking action.`;
}

function messageContainsBootstrap(message: unknown): boolean {
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content.includes(BOOTSTRAP_MARKER);
	if (!Array.isArray(content)) return false;
	return content.some((part) => {
		return (
			part &&
			typeof part === "object" &&
			(part as { type?: unknown }).type === "text" &&
			typeof (part as { text?: unknown }).text === "string" &&
			(part as { text: string }).text.includes(BOOTSTRAP_MARKER)
		);
	});
}

function firstNonCompactionSummaryIndex(messages: unknown[]): number {
	let index = 0;
	while ((messages[index] as { role?: unknown } | undefined)?.role === "compactionSummary") {
		index += 1;
	}
	return index;
}
