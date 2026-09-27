import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import logger from './log';

// Compose Octokit with desired plugins
const MyOctokit = Octokit.plugin(throttling, retry);

/**
 * Longest wait the throttle may sleep before one retry. When the hourly quota
 * is gone GitHub's retry-after is the time to reset (often 20-60 minutes);
 * sleeping that long froze a sync mid-way with no feedback. Past this, the
 * request fails so the caller can stop and say when the quota resets.
 */
export const MAX_THROTTLE_WAIT_SECONDS = 60;

export function shouldRetryAfterThrottle(retryAfter: number, retryCount: number): boolean {
    return retryCount === 0 && retryAfter <= MAX_THROTTLE_WAIT_SECONDS;
}

/**
 * Creates and configures an Octokit client instance with throttling and retry plugins
 * @param token - GitHub personal access token
 * @returns Configured Octokit instance
 */
export function createOctokitClient(token: string) {
    return new MyOctokit({
        auth: token,
        throttle: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onRateLimit: (retryAfter: number, options: any) => {
                logger.warn(
                    `Request quota exhausted for request ${options.method} ${options.url}`
                );
                if (shouldRetryAfterThrottle(retryAfter, options.request.retryCount)) {
                    logger.debug(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
                logger.warn(`Not waiting ${retryAfter}s for the rate limit to reset; failing the request`);
                return false;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onSecondaryRateLimit: (retryAfter: number, options: any) => {
                logger.warn(
                    `SecondaryRateLimit detected for request ${options.method} ${options.url}`
                );
            },
        },
    });
}
