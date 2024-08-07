import { Context } from '@oak/oak';
import { logger } from 'shared/logger.ts';
import { ProjectEditor } from '../../editor/projectEditor.ts';
import { ConversationPersistence } from '../../utils/conversationPersistence.utils.ts';

/**
 * @openapi
 * /api/v1/conversation:
 *   post:
 *     summary: Start a new conversation
 *     description: Initiates a new conversation with the AI assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *               - startDir
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The initial prompt to start the conversation
 *               provider:
 *                 type: string
 *                 description: The LLM provider to use (optional)
 *               model:
 *                 type: string
 *                 description: The specific model to use (optional)
 *               startDir:
 *                 type: string
 *                 description: The starting directory for the project
 *     responses:
 *       200:
 *         description: Successful response with conversation details
 *       400:
 *         description: Bad request, missing required parameters
 *       500:
 *         description: Internal server error
 */
export const startConversation = async (ctx: Context) => {
	logger.debug('startConversation called');

	try {
		const body = await ctx.request.body.json();
		const { prompt, provider, model, startDir } = body;

		if (!prompt) {
			ctx.response.status = 400;
			ctx.response.body = { error: 'Missing prompt' };
			return;
		}

		if (!startDir) {
			ctx.response.status = 400;
			ctx.response.body = { error: 'Missing startDir' };
			return;
		}

		logger.debug(`Creating ProjectEditor for dir: ${startDir}`);
		const projectEditor = new ProjectEditor(startDir);
		await projectEditor.init();

		const response = await projectEditor.speakWithLLM(prompt, provider, model);

		ctx.response.body = response;
	} catch (error) {
		logger.error(`Error in startConversation: ${error.message}`, error);
		if (error instanceof Error && 'status' in error) {
			ctx.response.status = error.status as number;
		} else {
			ctx.response.status = 500;
		}
		ctx.response.body = {
			error: 'Failed to generate response',
			details: error.message,
			type: error.name || 'UnknownError',
		};
	}
};

/**
 * @openapi
 * /api/v1/conversation/{id}:
 *   post:
 *     summary: Continue an existing conversation
 *     description: Continues an existing conversation with the AI assistant
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to continue
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *               - startDir
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The prompt to continue the conversation
 *               startDir:
 *                 type: string
 *                 description: The starting directory for the project
 *     responses:
 *       200:
 *         description: Successful response with conversation continuation
 *       400:
 *         description: Bad request, missing required parameters
 *       500:
 *         description: Internal server error
 */
export const continueConversation = async (
	{ params, request, response }: {
		params: { id: string };
		request: Context['request'];
		response: Context['response'];
	},
) => {
	logger.debug('continueConversation called');

	try {
		const { id: conversationId } = params;
		const body = await request.body.json();
		const { prompt, startDir } = body;

		logger.info(
			`Continuing conversation. ConversationId: ${conversationId}, Prompt: "${prompt?.substring(0, 50)}..."`,
		);

		if (!prompt) {
			logger.warn('Missing prompt');
			response.status = 400;
			response.body = { error: 'Missing prompt' };
			return;
		}

		if (!startDir) {
			logger.warn('Missing startDir');
			response.status = 400;
			response.body = { error: 'Missing startDir' };
			return;
		}

		logger.debug(`Creating ProjectEditor for dir: ${startDir}`);
		const projectEditor = new ProjectEditor(startDir);
		await projectEditor.init();

		logger.info(`Calling speakWithLLM for conversation: ${conversationId}`);
		const result = await projectEditor.speakWithLLM(prompt, undefined, undefined, conversationId);

		logger.debug('Response received from speakWithLLM');
		response.body = result;
	} catch (error) {
		logger.error(`Error in continueConversation: ${error.message}`, error);
		response.status = 500;
		response.body = { error: 'Failed to generate response', details: error.message };
	}
};

/**
 * @openapi
 * /api/v1/conversation/{id}:
 *   get:
 *     summary: Get conversation details
 *     description: Retrieves details of a specific conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve
 *     responses:
 *       200:
 *         description: Successful response with conversation details
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
export const getConversation = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	try {
		const { id: conversationId } = params;
		/*
		const conversation = await persistence.loadConversation();

		response.status = 200;
		response.body = {
			id: conversation.id,
			llmProviderName: conversation.llmProviderName,
			system: conversation.baseSystem,
			model: conversation.model,
			maxTokens: conversation.maxTokens,
			temperature: conversation.temperature,
			turnCount: conversation.turnCount,
			totalTokenUsage: conversation.totalTokenUsage,
			messages: conversation.getMessages(),
		};
 */
	} catch (error) {
		logger.error(`Error in getConversation: ${error.message}`);
		response.status = 404;
		response.body = { error: 'Conversation not found' };
	}
};

/**
 * @openapi
 * /api/v1/conversation/{id}:
 *   delete:
 *     summary: Delete a conversation
 *     description: Deletes a specific conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to delete
 *     responses:
 *       200:
 *         description: Successful response with deletion confirmation
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
export const deleteConversation = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	// Delete conversation
	response.body = { message: `Conversation ${params.id} deleted` };
};

/**
 * @openapi
 * /api/v1/conversations:
 *   get:
 *     summary: List conversations
 *     description: Retrieves a list of conversations with pagination and filtering options
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter conversations starting from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter conversations up to this date
 *       - in: query
 *         name: llmProviderName
 *         schema:
 *           type: string
 *         description: Filter conversations by LLM provider name
 *     responses:
 *       200:
 *         description: Successful response with list of conversations
 *       500:
 *         description: Internal server error
 */
export const listConversations = async (
	{ request, response }: { request: Context['request']; response: Context['response'] },
) => {
	try {
		const params = request.url.searchParams;
		const page = params.get('page') || '1';
		const pageSize = params.get('pageSize') || '10';
		const startDate = params.get('startDate');
		const endDate = params.get('endDate');
		const llmProviderName = params.get('llmProviderName');

		const conversations = await ConversationPersistence.listConversations({
			page: parseInt(page),
			pageSize: parseInt(pageSize),
			startDate: startDate ? new Date(startDate) : undefined,
			endDate: endDate ? new Date(endDate) : undefined,
			llmProviderName: llmProviderName || undefined,
		});

		response.status = 200;
		response.body = {
			conversations,
			pagination: {
				page: parseInt(page),
				pageSize: parseInt(pageSize),
				totalPages: Math.ceil(conversations.length / parseInt(pageSize)),
				totalItems: conversations.length,
			},
		};
	} catch (error) {
		logger.error(`Error in listConversations: ${error.message}`);
		response.status = 500;
		response.body = { error: 'Failed to list conversations' };
	}
};

export const addMessage = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	// Add a message to the conversation
	response.body = { message: `Message added to conversation ${params.id}` };
};

export const clearConversation = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	// Clear conversation history
	response.body = { message: `Conversation ${params.id} cleared` };
};

export const undoConversation = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	// Undo last change in conversation
	response.body = { message: `Last change in conversation ${params.id} undone` };
};

export const addFile = async (
	{ params, request, response }: {
		params: { id: string };
		request: Context['request'];
		response: Context['response'];
	},
) => {
	try {
		const { id: conversationId } = params;
		const body = await request.body;
		const form: FormData = await body.formData();
		const fileObj: File = form.get('file') as File;
		const filePath = fileObj.name;
		const fileSize = fileObj.size;
		const fileData = await fileObj.stream;

		if (!filePath) {
			response.status = 400;
			response.body = { error: 'Missing filePath in request body' };
			return;
		}

		// TODO: Implement file addition logic
		// For now, we'll just log the file addition
		logger.info(`File ${filePath} added to conversation ${conversationId}`);

		response.status = 200;
		response.body = { message: 'File added to conversation', conversationId, filePath };
	} catch (error) {
		logger.error(`Error in addFile: ${error.message}`);
		response.status = 500;
		response.body = { error: 'Failed to add file to conversation' };
	}
};

export const removeFile = async (
	{ params, response }: { params: { id: string; fileId: string }; response: Context['response'] },
) => {
	try {
		const { id: conversationId, fileId } = params;

		if (!fileId) {
			response.status = 400;
			response.body = { error: 'Missing fileId in request parameters' };
			return;
		}

		// TODO: Implement file removal logic
		// For now, we'll just log the file removal
		logger.info(`File ${fileId} removed from conversation ${conversationId}`);

		response.status = 200;
		response.body = { message: `File ${fileId} removed from conversation`, conversationId, fileId };
	} catch (error) {
		logger.error(`Error in removeFile: ${error.message}`);
		response.status = 500;
		response.body = { error: 'Failed to remove file from conversation' };
	}
};

export const listFiles = async (
	{ params, response }: { params: { id: string }; response: Context['response'] },
) => {
	try {
		const { id: conversationId } = params;

		// TODO: Implement file listing logic
		// For now, we'll return a mock list of files
		const mockFiles = ['file1.txt', 'file2.js', 'file3.py'];

		response.status = 200;
		response.body = { conversationId, files: mockFiles };
	} catch (error) {
		logger.error(`Error in listFiles: ${error.message}`);
		response.status = 500;
		response.body = { error: 'Failed to list files in conversation' };
	}
};
