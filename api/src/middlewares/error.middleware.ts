import { Context, State, Status } from '@oak/oak';
import type { Middleware } from '@oak/oak';
import { APIError, isAPIError } from '../errors/error.ts';
import { logger } from 'shared/logger.ts';
import { config } from 'shared/configManager.ts';

/**
 * Error Handler Middleware function
 * @param ctx
 * @param next
 * @returns Promise<void>
 */

export const errorHandler: Middleware = async (
	ctx: Context<State, Record<string, unknown>>,
	next: () => Promise<unknown>,
): Promise<void> => {
	try {
		await next();
	} catch (err) {
		if (isAPIError(err)) {
			const error: APIError = err;
			const message: string = error.message || 'An error occurred';
			const status: Status = error.status ?? Status.InternalServerError;

			const responseBody: { message: string; name?: string; path?: string; args?: object; status?: Status } = {
				message: '',
			};

			if (config.api?.environment === 'production') { // || config.api?.environment === 'docker'
				responseBody.message = message;
			} else {
				const name: string = error.name || 'Error';
				const path: string = error.options?.path || 'Unknown path';
				const args: object = error.options?.args || error.options || {};

				if (
					config.api?.environment === 'local' || config.api?.environment === 'development'
				) {
					logger.error(error.message, args);
				}

				responseBody.message = message;
				responseBody.name = name;
				responseBody.path = path;
				responseBody.args = args;
				responseBody.status = status;
			}

			ctx.response.status = status;
			ctx.response.body = responseBody;
		} else {
			/**
			 * considering all non-API errors as internal server error,
			 * do not want to share internal server errors to
			 * end user in non "development" mode
			 */
			const message = config.api?.environment === 'local' ||
					config.api?.environment === 'development'
				? (err.message ?? 'Unknown error occurred')
				: 'Internal Server Error';

			ctx.response.status = Status.InternalServerError;
			ctx.response.body = { message };
		}
	}
};
