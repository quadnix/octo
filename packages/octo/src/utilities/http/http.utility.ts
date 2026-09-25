import { TransactionError } from '../../errors/index.js';

/**
 * The one place octo speaks HTTP.
 *
 * A response is handed back whatever its status, so the caller decides what a refusal means instead
 * of catching one. Only a request that never reached a server throws.
 *
 * @internal
 */
export class HttpUtility {
  /**
   * What a refused request said went wrong, as one line. A service that answers a list - a failed
   * validation usually does - is read as a sentence, and a body that is not JSON as its status.
   *
   * @internal
   */
  static async readErrorMessage(response: Response): Promise<string> {
    let body: { message?: string | string[] };
    try {
      body = (await response.json()) as { message?: string | string[] };
    } catch (error) {
      return `${response.status} ${response.statusText}`;
    }

    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return message || `${response.status} ${response.statusText}`;
  }

  /**
   * @internal
   * @throws {@link TransactionError} When the host could not be reached at all, which is a different
   * thing from being refused by it and is the caller's to report differently.
   */
  static async send(
    url: string,
    { body, headers = {}, method = 'GET' }: { body?: BodyInit; headers?: Record<string, string>; method?: string } = {},
  ): Promise<Response> {
    try {
      return await fetch(url, { body, headers, method });
    } catch (error) {
      throw new TransactionError(`Cannot reach "${new URL(url).origin}"!`);
    }
  }

  /**
   * {@link HttpUtility.send} with a JSON body, which is every request octo makes that carries one
   * other than an upload.
   *
   * @internal
   */
  static async sendJson(
    url: string,
    { body, headers = {}, method = 'GET' }: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
  ): Promise<Response> {
    return this.send(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...headers, 'Content-Type': 'application/json' },
      method,
    });
  }
}
