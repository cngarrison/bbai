import { join, normalize, resolve } from '@std/path';
import * as diff from 'diff';
import { ensureDir, exists } from '@std/fs';

import { LLMFactory } from '../llms/llmProvider.ts';
import LLMConversation, { FileMetadata } from '../llms/conversation.ts';
import LLM from '../llms/providers/baseLLM.ts';
import { logger } from 'shared/logger.ts';
import { PromptManager } from '../prompts/promptManager.ts';
import { LLMProvider, LLMProviderMessageResponse, LLMSpeakWithOptions } from '../types.ts';
import LLMTool from '../llms/tool.ts';
import { ConversationPersistence } from '../utils/conversationPersistence.utils.ts';
import { GitUtils } from 'shared/git.ts';
import { createError, ErrorType } from '../utils/error.utils.ts';
import { FileHandlingErrorOptions } from '../errors/error.ts';
import { generateCtags, readCtagsFile } from 'shared/ctags.ts';

export class ProjectEditor {
	private conversation: LLMConversation | null = null;
	private promptManager: PromptManager;
	private llmProvider!: LLM;
	private projectRoot: string;

	constructor(private cwd: string) {
		this.promptManager = new PromptManager(this);
		this.projectRoot = '.';
	}

	public async init(): Promise<void> {
		try {
			this.projectRoot = await this.getProjectRoot();
			this.llmProvider = LLMFactory.getProvider(this);
		} catch (error) {
			console.error('Failed to initialize LLMProvider:', error);
			throw error;
		}
	}

	public async getProjectRoot(): Promise<string> {
		const gitRoot = await GitUtils.findGitRoot(this.cwd);
		if (!gitRoot) {
			throw new Error('Not in a git repository');
		}
		return gitRoot;
	}

	public async getBbaiDir(): Promise<string> {
		const bbaiDir = join(this.projectRoot, '.bbai');
		await ensureDir(bbaiDir);
		return bbaiDir;
	}

	public async getBbaiCacheDir(): Promise<string> {
		const bbaiDir = await this.getBbaiDir();
		const repoCacheDir = join(bbaiDir, 'cache');
		await ensureDir(repoCacheDir);
		return repoCacheDir;
	}

	public async writeToBbaiDir(filename: string, content: string): Promise<void> {
		const bbaiDir = await this.getBbaiDir();
		const filePath = join(bbaiDir, filename);
		await Deno.writeTextFile(filePath, content);
	}

	public async readFromBbaiDir(filename: string): Promise<string | null> {
		const bbaiDir = await this.getBbaiDir();
		const filePath = join(bbaiDir, filename);
		try {
			return await Deno.readTextFile(filePath);
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) {
				return null;
			}
			throw error;
		}
	}

	public async removeFromBbaiDir(filename: string): Promise<void> {
		const bbaiDir = await this.getBbaiDir();
		const filePath = join(bbaiDir, filename);
		try {
			await Deno.remove(filePath);
		} catch (error) {
			if (!(error instanceof Deno.errors.NotFound)) {
				throw error;
			}
		}
	}

	private addDefaultTools(): void {
		const requestFilesTool: LLMTool = {
			name: 'request_files',
			description: 'Request files to be added to the chat',
			input_schema: {
				type: 'object',
				properties: {
					fileNames: {
						type: 'array',
						items: { type: 'string' },
						description: 'Array of file names to be added to the chat',
					},
				},
				required: ['fileNames'],
			},
		};

		const vectorSearchTool: LLMTool = {
			name: 'vector_search',
			description: 'Perform a vector search on the project files',
			input_schema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The search query to use for vector search',
					},
				},
				required: ['query'],
			},
		};

		const applyPatchTool: LLMTool = {
			name: 'apply_patch',
			description: 'Apply a patch to a file',
			input_schema: {
				type: 'object',
				properties: {
					filePath: {
						type: 'string',
						description: 'The path of the file to be patched',
					},
					patch: {
						type: 'string',
						description: 'The patch to be applied in diff format',
					},
				},
				required: ['filePath', 'patch'],
			},
		};

		this.conversation?.addTool(requestFilesTool);
		//this.conversation?.addTool(vectorSearchTool);
		this.conversation?.addTool(applyPatchTool);
	}

	private isPathWithinProject(filePath: string): boolean {
		const normalizedPath = normalize(filePath);
		const resolvedPath = resolve(this.projectRoot, normalizedPath);
		return resolvedPath.startsWith(this.projectRoot);
	}

	private determineStorageLocation(filePath: string, content: string, source: 'tool' | 'user'): 'system' | 'message' {
		if (source === 'tool') {
			return 'message';
		}
		const fileSize = new TextEncoder().encode(content).length;
		const fileCount = this.conversation?.listFiles().length || 0;

		if (fileCount < 10 && fileSize < 50 * 1024) {
			return 'system';
		} else {
			return 'message';
		}
	}

	async speakWithLLM(prompt: string, provider?: LLMProvider, model?: string, conversationId?: string): Promise<any> {
		if (conversationId) {
			try {
				const persistence = new ConversationPersistence(conversationId, this);
				await persistence.init();
				this.conversation = await this.llmProvider.loadConversation(conversationId);
				logger.info(`Loaded existing conversation: ${conversationId}`);
			} catch (error) {
				logger.warn(`Failed to load conversation ${conversationId}: ${error.message}`);
				this.conversation = null;
			}
		}

		if (!this.conversation) {
			const systemPrompt = await this.promptManager.getPrompt('system', {
				userDefinedContent: 'You are an AI assistant helping with code and project management.',
			});

			this.conversation = this.llmProvider.createConversation();
			this.conversation.baseSystem = systemPrompt;
			if (model) this.conversation.model = model;

			// Update ctags
			await this.updateCtags();

			this.addDefaultTools();

			logger.info(`Created new conversation: ${this.conversation.id}`);
		}

		const speakOptions: LLMSpeakWithOptions = {
			temperature: 0.7,
			maxTokens: 1000,
		};

		// TODO: There is a `building-fast` branch that has the previous "optimized, but buggy" solution.
		// This current implementation is simpler but may be less efficient.

		const maxTurns = 5; // Maximum number of turns for the run loop
		let currentTurn = 0;
		let currentResponse: LLMProviderMessageResponse = await this.conversation.speakWithLLM(prompt, speakOptions);
		logger.info('currentResponse', currentResponse);

		// Save the conversation immediately after the first response
		if (this.conversation) {
			const persistence = new ConversationPersistence(this.conversation.id, this);
			await persistence.saveConversation(this.conversation);
			logger.info(`Saved conversation: ${this.conversation.id}`);
		}

		while (currentTurn < maxTurns) {
			// Handle tool calls and collect feedback
			let toolFeedback = '';
			if (currentResponse.toolsUsed && currentResponse.toolsUsed.length > 0) {
				for (const tool of currentResponse.toolsUsed) {
					logger.info('Handling tool', tool);
					const feedback = await this.handleToolUse(tool, currentResponse);
					toolFeedback += feedback + '\n';
				}
			}

			// If there's tool feedback, send it back to the LLM
			if (toolFeedback) {
				prompt =
					`Tool use feedback:\n${toolFeedback}\nPlease acknowledge this feedback and continue the conversation.`;
				currentTurn++;
				currentResponse = await this.conversation.speakWithLLM(prompt, speakOptions);
				logger.info('tool response', currentResponse);

				// Save the conversation after each turn
				if (this.conversation) {
					const persistence = new ConversationPersistence(this.conversation.id, this);
					await persistence.saveConversation(this.conversation);
					logger.info(`Saved conversation after turn ${currentTurn}: ${this.conversation.id}`);
				}
			} else {
				// No more tool feedback, exit the loop
				break;
			}
		}

		if (currentTurn >= maxTurns) {
			logger.warn(`Reached maximum number of turns (${maxTurns}) in conversation.`);
		}

		// Final save of the entire conversation at the end of the loop
		if (this.conversation) {
			const persistence = new ConversationPersistence(this.conversation.id, this);
			await persistence.saveConversation(this.conversation);
			logger.info(`Final save of conversation: ${this.conversation.id}`);
		}

		return currentResponse;
	}

	private async handleToolUse(tool: any, response: any): Promise<string> {
		let feedback = '';
		switch (tool.toolName) {
			case 'request_files':
				const fileNames = (tool.toolInput as { fileNames: string[] }).fileNames;
				const filesAdded = await this.handleRequestFiles(fileNames, tool.toolUseId);
				feedback = `Files added to the conversation: ${filesAdded.join(', ')}`;
				break;
			case 'vector_search':
				const query = (tool.toolInput as { query: string }).query;
				const searchResults = await this.handleVectorSearch(query, tool.toolUseId);
				response.searchResults = searchResults;
				feedback = `Vector search completed for query: "${query}". ${searchResults.length} results found.`;
				break;
			case 'apply_patch':
				const { filePath, patch } = tool.toolInput as { filePath: string; patch: string };
				await this.handleApplyPatch(filePath, patch, tool.toolUseId);
				feedback = `Patch applied successfully to file: ${filePath}`;
				break;
			default:
				logger.warn(`Unknown tool used: ${tool.toolName}`);
				feedback = `Unknown tool used: ${tool.toolName}`;
		}
		return feedback;
	}

	async handleRequestFiles(
		fileNames: string[],
		toolUseId: string,
	): Promise<Array<{ fileName: string; metadata: Omit<FileMetadata, 'path' | 'inSystemPrompt'> }>> {
		return await this.addFiles(fileNames, 'tool', toolUseId);
		/*
		const filesAdded = [];
		for (const fileName of fileNames) {

			try {
				const okToAddFile = await this.checkOkToAddFile(fileName);
				if (okToAddFile) {
					filesAdded.push(fileName);
					logger.info(`File ${fileName} added to the chat`);
				}
			} catch (error) {
				logger.error(`Error handling file ${fileName}: ${error.message}`);
			}
		}
		await this.addFiles(fileName, 'tool', toolUseId);
		return filesAdded;
		 */
	}

	async handleVectorSearch(query: string, toolUseId: string): Promise<any> {
		return await this.searchEmbeddings(query);
	}

	async handleApplyPatch(filePath: string, patch: string, toolUseId: string): Promise<void> {
		if (!this.isPathWithinProject(filePath)) {
			throw createError(ErrorType.FileHandling, `Access denied: ${filePath} is outside the project directory`, {
				filePath,
				operation: 'patch',
			} as FileHandlingErrorOptions);
		}

		try {
			const currentContent = await Deno.readTextFile(filePath);

			const patchedContent = diff.applyPatch(currentContent, patch, {
				fuzzFactor: 2,
			});

			if (patchedContent === false) {
				throw createError(
					ErrorType.FileHandling,
					'Failed to apply patch. The patch does not match the current file content.',
					{
						filePath,
						operation: 'patch',
					} as FileHandlingErrorOptions,
				);
			}

			await Deno.writeTextFile(filePath, patchedContent);
			logger.info(`Patch applied to file: ${filePath}`);

			// Log the applied patch
			if (this.conversation) {
				const persistence = new ConversationPersistence(this.conversation.id, this);
				await persistence.logPatch(filePath, patch);
			}

			// Update ctags after applying the patch
			await this.updateCtags();
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) {
				throw createError(ErrorType.FileHandling, `File not found: ${filePath}`, {
					filePath,
					operation: 'read',
				} as FileHandlingErrorOptions);
			} else if (error instanceof Deno.errors.PermissionDenied) {
				throw createError(ErrorType.FileHandling, `Permission denied for file: ${filePath}`, {
					filePath,
					operation: 'write',
				} as FileHandlingErrorOptions);
			} else {
				logger.error(`Error applying patch to ${filePath}: ${error.message}`);
				throw createError(ErrorType.FileHandling, `Failed to apply patch to ${filePath}`, {
					filePath,
					operation: 'patch',
				} as FileHandlingErrorOptions);
			}
		}
	}

	async addFiles(
		fileNames: string[],
		source: 'tool' | 'user',
		toolUseId: string,
	): Promise<Array<{ fileName: string; metadata: Omit<FileMetadata, 'path' | 'inSystemPrompt'> }>> {
		if (!this.conversation) {
			throw new Error('Conversation not started. Call startConversation first.');
		}

		const filesAdded: Array<{ fileName: string; metadata: Omit<FileMetadata, 'path' | 'inSystemPrompt'> }> = [];

		for (const fileName of fileNames) {
			if (!this.isPathWithinProject(fileName)) {
				throw createError(
					ErrorType.FileHandling,
					`Access denied: ${fileName} is outside the project directory`,
					{
						filePath: fileName,
						operation: 'write',
					} as FileHandlingErrorOptions,
				);
			}

			try {
				const fullFilePath = join(this.projectRoot, fileName);
				const content = await Deno.readTextFile(fullFilePath);
				const metadata: Omit<FileMetadata, 'path' | 'inSystemPrompt'> = {
					size: new TextEncoder().encode(content).length,
					lastModified: new Date(),
				};
				filesAdded.push({ fileName, metadata });

				// const storageLocation = this.determineStorageLocation(fullFilePath, content, source);
				// if (storageLocation === 'system') {
				// 	await this.conversation.addFileForSystemPrompt(fileName, metadata);
				// } else {
				// 	await this.conversation.addFileToMessageArray(fileName, metadata, toolUseId);
				// }

				logger.info(`File ${fileName} added to nessages by ${source}`);
			} catch (error) {
				logger.error(`Error adding file ${fileName}: ${error.message}`);
				throw createError(ErrorType.FileHandling, `Failed to add file ${fileName}`, {
					filePath: fileName,
					operation: 'write',
				} as FileHandlingErrorOptions);
			}
		}

		await this.conversation.addFilesToMessageArray(filesAdded, toolUseId);

		return filesAdded;
	}

	async updateFile(filePath: string, content: string): Promise<void> {
		if (!this.isPathWithinProject(filePath)) {
			throw createError(ErrorType.FileHandling, `Access denied: ${filePath} is outside the project directory`, {
				filePath,
				operation: 'write',
			} as FileHandlingErrorOptions);
		}

		// TODO: Implement file update logic
		logger.info(`File ${filePath} updated in the project`);
	}

	async searchEmbeddings(query: string): Promise<any> {
		// TODO: Implement embedding search logic
		logger.info(`Searching embeddings for: ${query}`);
		return [];
	}

	private async updateCtags(): Promise<void> {
		const bbaiDir = await this.getBbaiDir();
		const projectRoot = await this.getProjectRoot();
		await generateCtags(bbaiDir, projectRoot);
		const ctagsContent = await readCtagsFile(bbaiDir);
		if (ctagsContent && this.conversation) {
			this.conversation.ctagsContent = ctagsContent;
		}
	}

	async revertLastPatch(): Promise<void> {
		if (!this.conversation) {
			throw new Error('No active conversation. Cannot revert patch.');
		}

		const persistence = new ConversationPersistence(this.conversation.id, this);
		const patchLog = await persistence.getPatchLog();

		if (patchLog.length === 0) {
			throw new Error('No patches to revert.');
		}

		const lastPatch = patchLog[patchLog.length - 1];
		const { filePath, patch } = lastPatch;

		try {
			const currentContent = await Deno.readTextFile(filePath);

			// Create a reverse patch
			const patchResult = diff.applyPatch(currentContent, patch);
			if (typeof patchResult === 'boolean') {
				throw new Error('Failed to apply original patch. Cannot create reverse patch.');
			}
			const reversePatch = diff.createPatch(filePath, patchResult, currentContent);

			// Apply the reverse patch
			const revertedContent = diff.applyPatch(currentContent, reversePatch);

			if (revertedContent === false) {
				throw new Error('Failed to revert patch. The current file content may have changed.');
			}

			await Deno.writeTextFile(filePath, revertedContent);
			logger.info(`Last patch reverted for file: ${filePath}`);

			// Remove the last patch from the log
			await persistence.removeLastPatch();
		} catch (error) {
			logger.error(`Error reverting last patch: ${error.message}`);
			throw error;
		}
	}
}
