//import { consoleSize } from '@std/console';
import { join } from '@std/path';
import { BufReader } from '@std/io';

import { getBbaiDir } from 'shared/dataDir.ts';

const ANSI_RESET = '\x1b[0m';
const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_BLUE = '\x1b[34m';

const USER_ICON = '👤';
const ASSISTANT_ICON = '🤖';
const TOOL_ICON = '🔧';
const AUXILIARY_ICON = '📎';
const ERROR_ICON = '❌';
const UNKNOWN_ICON = '❓';

export class LogFormatter {
	private static readonly ENTRY_SEPARATOR = '<<<BBAI_LOG_ENTRY_SEPARATOR>>>';

	private maxLineLength: number;

	constructor(maxLineLength?: number) {
		this.maxLineLength = this.getMaxLineLength(maxLineLength);
	}

	private getMaxLineLength(userDefinedLength?: number): number {
		if (userDefinedLength && userDefinedLength > 0) {
			return userDefinedLength;
		}
		const { columns, rows: _rows } = Deno.consoleSize();
		return columns > 0 ? columns : 120; // Default to 120 if unable to determine console width
	}

	private wrapText(text: string, indent: string, tail: string): string {
		const effectiveMaxLength = this.maxLineLength - indent.length - tail.length;
		const paragraphs = text.split('\n');
		const wrappedParagraphs = paragraphs.map((paragraph, index) => {
			if (paragraph.trim() === '') {
				// Preserve empty lines between paragraphs, but not at the start or end
				return index > 0 && index < paragraphs.length - 1 ? indent + tail : '';
			} else {
				let remainingText = paragraph;
				const lines = [];

				while (remainingText.length > 0) {
					if (remainingText.length <= effectiveMaxLength) {
						lines.push(remainingText);
						break;
					}

					let splitIndex = remainingText.lastIndexOf(' ', effectiveMaxLength);
					if (splitIndex === -1 || splitIndex === 0) {
						// If no space found or space is at the beginning, force split at max length
						splitIndex = effectiveMaxLength;
					}

					lines.push(remainingText.slice(0, splitIndex));
					remainingText = remainingText.slice(splitIndex).trim();

					// If the remaining text starts with a space, remove it
					if (remainingText.startsWith(' ')) {
						remainingText = remainingText.slice(1);
					}
				}

				return lines.map((l) => `${indent}${l}${tail}`).join('\n');
			}
		});

		// Remove any empty lines at the start and end
		return wrappedParagraphs.filter((p, i) => p !== '' || (i > 0 && i < wrappedParagraphs.length - 1)).join('\n');
	}

	static createRawEntry(type: string, timestamp: string, message: string): string {
		// [TODO] add token usage to header line
		return `## ${type} [${timestamp}]\n${message.trim()}`;
	}
	static createRawEntryWithSeparator(type: string, timestamp: string, message: string): string {
		let rawEntry = LogFormatter.createRawEntry(type, timestamp, message);
		// Ensure entry ends with a single newline and the separator
		rawEntry = rawEntry.trimEnd() + '\n' + LogFormatter.getEntrySeparator() + '\n';
		return rawEntry;
	}

	static getTimestamp(): string {
		return new Date().toISOString();
	}

	formatLogEntry(type: string, timestamp: string, message: string): string {
		let icon: string;
		let color: string;

		switch (type) {
			case 'User Message':
				icon = USER_ICON;
				color = ANSI_GREEN;
				break;
			case 'Assistant Message':
				icon = ASSISTANT_ICON;
				color = ANSI_BLUE;
				break;
			case 'Auxiliary Message':
				icon = AUXILIARY_ICON;
				color = ANSI_CYAN;
				break;
			case 'Tool Use':
			case 'Tool Result':
			case 'Diff Patch':
				icon = TOOL_ICON;
				color = ANSI_YELLOW;
				break;
			case 'Error':
				icon = ERROR_ICON;
				color = ANSI_RED;
				break;
			default:
				icon = UNKNOWN_ICON;
				color = ANSI_RESET;
		}

		const header = `${color}╭─ ${icon}   ${type} [${timestamp}]${ANSI_RESET}`;
		const footer = `${color}╰${'─'.repeat(this.maxLineLength - 1)}${ANSI_RESET}`;
		const wrappedMessage = this.wrapText(message.trim(), `${color}│ `, ANSI_RESET);

		return `${header}\n${wrappedMessage}\n${footer}`;
	}

	formatRawLogEntry(entry: string): string {
		const [header, ...messageLines] = entry.split('\n');
		if (typeof header !== 'undefined' && typeof messageLines !== 'undefined') {
			const [type, timestamp] = header.replace('## ', '').split(' [');
			if (typeof type !== 'undefined' && typeof timestamp !== 'undefined') {
				return this.formatLogEntry(type, timestamp.replace(']', ''), messageLines.join('\n').trim());
			} else {
				return messageLines.join('\n');
			}
		} else {
			return messageLines.join('\n');
		}
	}

	formatSeparator(): string {
		return `${ANSI_BLUE}${'─'.repeat(this.maxLineLength)}${ANSI_RESET}\n`;
	}

	static getEntrySeparator(): string {
		return this.ENTRY_SEPARATOR.trim();
	}
}

export async function displayFormattedLogs(
	conversationId: string,
	callback?: (formattedEntry: string) => void,
	follow = false,
): Promise<void> {
	const formatter = new LogFormatter();
	const bbaiDir = await getBbaiDir(Deno.cwd());
	const logFile = join(bbaiDir, 'cache', 'conversations', conversationId, 'conversation.log');

	const processEntry = (entry: string) => {
		//console.debug('Debug: Raw entry before processing:\n', entry.trimStart());
		if (entry.trim() !== '') {
			const formattedEntry = formatter.formatRawLogEntry(entry.trim());
			if (callback) {
				callback(formattedEntry);
			} else {
				console.log(formattedEntry);
			}
			//console.debug('Debug: Formatted entry:\n' + formattedEntry);
		}
	};

	const readAndProcessEntries = async (startPosition = 0) => {
		let file: Deno.FsFile | null = null;
		try {
			file = await Deno.open(logFile, { read: true });
			await file.seek(startPosition, Deno.SeekMode.Start);
			const bufReader = new BufReader(file);

			let entry = '';
			let line: string | null;
			while ((line = await bufReader.readString('\n')) !== null) {
				//console.debug('Debug: Read line:', line.trimEnd());
				if (line.includes(LogFormatter.getEntrySeparator())) {
					processEntry(entry);
					entry = '';
					//console.debug('Debug: Entry separator found, resetting entry');
				} else {
					entry += line;
				}
			}
			if (entry.trim() !== '') {
				processEntry(entry);
			}
			return file.seek(0, Deno.SeekMode.Current);
		} finally {
			file?.close();
		}
	};

	try {
		let lastPosition = await readAndProcessEntries();

		if (follow) {
			const watcher = Deno.watchFs(logFile);
			for await (const event of watcher) {
				if (event.kind === 'modify') {
					lastPosition = await readAndProcessEntries(lastPosition);
				}
			}
		}
	} catch (error) {
		console.error(`Error reading log file: ${error.message}`);
	}
}

export async function writeLogEntry(
	conversationId: string,
	type: string,
	message: string,
): Promise<void> {
	const bbaiDir = await getBbaiDir(Deno.cwd());
	const logFile = join(bbaiDir, 'cache', 'conversations', conversationId, 'conversation.log');

	const timestamp = new Date().toISOString();
	const entry = LogFormatter.createRawEntryWithSeparator(type, timestamp, message);

	try {
		// Append the entry to the log file
		await Deno.writeTextFile(logFile, entry, { append: true });
	} catch (error) {
		console.error(`Error writing log entry: ${error.message}`);
	}
}

export async function countLogEntries(conversationId: string): Promise<number> {
	const bbaiDir = await getBbaiDir(Deno.cwd());
	const logFile = join(bbaiDir, 'cache', 'conversations', conversationId, 'conversation.log');

	try {
		const content = await Deno.readTextFile(logFile);
		const entries = content.split(LogFormatter.getEntrySeparator());
		// Filter out any empty entries
		return entries.filter((entry) => entry.trim() !== '').length;
	} catch (error) {
		console.error(`Error counting log entries: ${error.message}`);
		return 0;
	}
}
