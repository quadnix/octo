import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
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
   * Downloads `url` into `filePath`, streaming it so its size is not bounded by memory. False when the
   * server refused it or the download was cut short, which can leave part of the file behind.
   *
   * @internal
   * @throws {@link TransactionError} When the host could not be reached at all.
   */
  static async downloadToFile(url: string, filePath: string): Promise<boolean> {
    const response = await this.send(url);
    if (!response.ok || !response.body) {
      return false;
    }

    try {
      await pipeline(Readable.fromWeb(response.body as NodeReadableStream), createWriteStream(filePath));
      return true;
    } catch (error) {
      return false;
    }
  }

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
   * A body may be a stream, which is sent as it is read rather than held in memory. A stream's length
   * is unknown to fetch, so a server that needs one is given `Content-Length` in `headers`.
   *
   * @internal
   * @throws {@link TransactionError} When the host could not be reached at all, which is a different
   * thing from being refused by it and is the caller's to report differently.
   */
  static async send(
    url: string,
    { body, headers = {}, method = 'GET' }: { body?: BodyInit; headers?: Record<string, string>; method?: string } = {},
  ): Promise<Response> {
    try {
      // `duplex` is what lets the body be a stream; Node's fetch refuses one without it.
      return await fetch(url, { body, duplex: 'half', headers, method } as RequestInit);
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

  /**
   * PUTs the file at `filePath` to `url`, streaming it so its size is not bounded by memory, with its
   * `Content-Length`, which a presigned URL is usually signed with.
   *
   * @internal
   * @throws {@link TransactionError} When the host could not be reached at all.
   */
  static async uploadFile(url: string, filePath: string, headers: Record<string, string> = {}): Promise<Response> {
    const { size } = await stat(filePath);
    return this.send(url, {
      body: Readable.toWeb(createReadStream(filePath)) as ReadableStream,
      headers: { ...headers, 'Content-Length': String(size) },
      method: 'PUT',
    });
  }
}
