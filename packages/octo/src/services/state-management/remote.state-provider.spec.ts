import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { RemoteStateProvider } from './remote.state-provider.js';

/**
 * What the backend holds for one app: its locks, a record per commit, the uploads asked for and not
 * yet claimed, and the objects S3 holds.
 */
interface Backend {
  /**
   * Whether S3 serves bytes other than the ones stored, standing in for a download cut short.
   */
  corruptsDownloads?: boolean;
  /**
   * What the next upload asked for is refused with, standing in for the limits an app is held to.
   */
  limitRefusal?: string;
  locks: { commitId: string; context: string; lockId: string; scope: string[]; takenAt: number; takenBy: string }[];
  objects: { [key: string]: string };
  /**
   * Whether S3 refuses every PUT, standing in for an upload that does not land.
   */
  refusesObjects?: boolean;
  requests: string[];
  states: {
    commitId: string;
    createdAt: number;
    files: { [stateFileName: string]: string };
    phase: 'apply' | 'commit';
    sealedAt?: number;
  }[];
  uploads: { [uploadId: string]: { commitId: string; files: { filename: string; sha256: string }[] } };
}

const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('base64');

/**
 * A stand-in for the state management service and the bucket behind it, answering the routes the
 * provider uses the way they do. It is a real server rather than a mocked `fetch`, because a write
 * is three requests and a PUT to a URL the service signed, and that conversation is the half worth
 * testing. S3 sits under `/s3`, outside the service's routes.
 */
async function startBackend(backend: Backend): Promise<{ close: () => Promise<void>; url: string }> {
  let clock = 0;
  let uploadCount = 0;
  const appUrl = '/state/organization/an-organization/app/an-app';
  let origin = '';

  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    const answer = (status: number, payload?: unknown): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(payload === undefined ? undefined : JSON.stringify(payload));
    };
    const refuse = (status: number, message: string): void =>
      answer(status, { error: 'Error', message, statusCode: status });

    // Store and serve objects, refusing bytes that do not match the digest and size a PUT was signed
    // with. S3 refuses a PUT without a length, which a streamed body has unless it is given one.
    if (request.url!.startsWith('/s3/')) {
      const key = decodeURIComponent(request.url!.slice('/s3/'.length));
      backend.requests.push(`${request.method} /s3`);
      if (request.method === 'PUT') {
        if (
          backend.refusesObjects ||
          request.headers['content-length'] !== String(body.length) ||
          request.headers['x-amz-checksum-sha256'] !== sha256(body)
        ) {
          refuse(400, 'BadDigest');
          return;
        }
        backend.objects[key] = body.toString();
        answer(200);
      } else if (backend.objects[key] === undefined) {
        refuse(404, 'NoSuchKey');
      } else {
        response.writeHead(200);
        response.end(backend.corruptsDownloads ? backend.objects[key].slice(1) : backend.objects[key]);
      }
      return;
    }

    const route = `${request.method} ${request.url!.slice(appUrl.length) || '/'}`;
    backend.requests.push(route);

    const describe = (state: Backend['states'][0]): object => ({ commitId: state.commitId, phase: state.phase });
    const answerFiles = (state: Backend['states'][0]): void => {
      answer(200, {
        state: describe(state),
        stateFiles: Object.entries(state.files).map(([filename, content]) => {
          backend.objects[`${state.commitId}/${filename}`] = content;
          return {
            downloadUrl: `${origin}/s3/${encodeURIComponent(`${state.commitId}/${filename}`)}`,
            filename,
            sha256: sha256(content),
            sizeInBytes: content.length,
          };
        }),
      });
    };

    if (route === 'POST /lock') {
      const { commitId, context, scope } = JSON.parse(body.toString());
      if (backend.states.find((s) => s.commitId === commitId)?.phase === 'commit') {
        refuse(409, `Commit "${commitId}" is already sealed!`);
      } else if (backend.locks.length > 0) {
        refuse(409, `App lock conflicts on "app", held since ${new Date(0).toISOString()}!`);
      } else {
        const lock = {
          commitId,
          context,
          lockId: `${'a'.repeat(63)}${backend.requests.length % 10}`,
          scope,
          takenAt: 0,
          takenBy: 'an-account',
        };
        backend.locks.push(lock);
        answer(201, lock);
      }
      return;
    }

    if (route === 'GET /locks') {
      answer(200, { locks: backend.locks });
      return;
    }

    const unlock = route.match(/^POST \/lock\/(\w+)\/unlock$/);
    if (unlock) {
      const lock = backend.locks.find((l) => l.lockId === unlock[1]);
      if (!lock) {
        refuse(404, 'Lock not found!');
        return;
      }
      const state = backend.states.find((s) => s.commitId === lock.commitId);
      if (state) {
        state.phase = 'commit';
        state.sealedAt = ++clock;
      }
      backend.locks = backend.locks.filter((l) => l !== lock);
      answer(204);
      return;
    }

    const upload = route.match(/^POST \/lock\/(\w+)\/upload$/);
    if (upload) {
      const lock = backend.locks.find((l) => l.lockId === upload[1]);
      if (!lock) {
        refuse(404, 'Lock not found!');
        return;
      }
      const state = backend.states.find((s) => s.commitId === lock.commitId);
      if (state?.phase === 'commit') {
        refuse(409, 'State is sealed and cannot be written!');
        return;
      }
      if (backend.limitRefusal) {
        refuse(400, backend.limitRefusal);
        return;
      }

      const { stateFiles } = JSON.parse(body.toString()) as { stateFiles: { filename: string; sha256: string }[] };
      const uploadId = `upload-${++uploadCount}`;
      backend.uploads[uploadId] = { commitId: lock.commitId, files: stateFiles };
      answer(201, {
        uploadId,
        uploads: stateFiles
          .filter(
            (file) => state?.files[file.filename] === undefined || sha256(state.files[file.filename]) !== file.sha256,
          )
          .map((file) => ({
            filename: file.filename,
            headers: [{ name: 'x-amz-checksum-sha256', value: file.sha256 }],
            url: `${origin}/s3/${encodeURIComponent(`${uploadId}/${file.filename}`)}`,
          })),
      });
      return;
    }

    const claim = route.match(/^POST \/lock\/(\w+)\/upload\/([\w-]+)\/claim$/);
    if (claim) {
      const pending = backend.uploads[claim[2]];
      if (!pending) {
        refuse(404, 'Upload not found!');
        return;
      }
      delete backend.uploads[claim[2]];
      const state = backend.states.find((s) => s.commitId === pending.commitId);

      const files: { [stateFileName: string]: string } = {};
      for (const file of pending.files) {
        const content = backend.objects[`${claim[2]}/${file.filename}`] ?? state?.files[file.filename];
        if (content === undefined || sha256(content) !== file.sha256) {
          refuse(400, `State file "${file.filename}" was not uploaded as declared!`);
          return;
        }
        files[file.filename] = content;
      }

      if (state) {
        state.files = files;
        answer(200, describe(state));
      } else {
        const openedState = { commitId: pending.commitId, createdAt: ++clock, files, phase: 'apply' as const };
        backend.states.push(openedState);
        answer(200, describe(openedState));
      }
      return;
    }

    if (route === 'GET /latest') {
      const latest = backend.states.filter((s) => s.phase === 'commit').sort((a, b) => b.sealedAt! - a.sealedAt!)[0];
      if (!latest) {
        refuse(404, 'State not found!');
        return;
      }
      answerFiles(latest);
      return;
    }

    const commitFiles = route.match(/^GET \/commit\/([\w-]+)\/files$/);
    if (commitFiles) {
      const state = backend.states.find((s) => s.commitId === commitFiles[1]);
      if (!state) {
        refuse(404, 'State not found!');
        return;
      }
      answerFiles(state);
      return;
    }

    if (route === 'GET ?limit=1') {
      const newest = [...backend.states].sort((a, b) => b.createdAt - a.createdAt)[0];
      answer(200, { states: newest ? [describe(newest)] : [] });
      return;
    }

    refuse(404, 'Not found!');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  origin = `http://127.0.0.1:${port}`;

  return {
    close: (): Promise<void> => new Promise((resolve) => server.close(() => resolve())),
    url: `http://127.0.0.1:${port}`,
  };
}

describe('RemoteStateProvider UT', () => {
  let backend: Backend;
  let close: () => Promise<void>;
  let localStateDirectoryPath: string;
  let otherLocalStateDirectoryPath: string;
  let remoteStateProvider: RemoteStateProvider;
  let url: string;

  const build = (path: string): RemoteStateProvider =>
    new RemoteStateProvider({
      appId: 'an-app',
      localStateDirectoryPath: path,
      lockContext: 'a-context',
      organizationId: 'an-organization',
      sessionId: 'a-session',
      stateManagementServiceUrl: `${url}/state/`,
    });

  const seal = (commitId: string, files: { [stateFileName: string]: string }): void => {
    const sealedAt = backend.states.length + 100;
    backend.states.push({ commitId, createdAt: sealedAt, files, phase: 'commit', sealedAt });
  };

  const stateFileNames = async (path: string): Promise<string[]> =>
    (await readdir(path)).filter((name) => !name.startsWith('.') && !name.endsWith('.lock')).sort();

  beforeEach(async () => {
    backend = { locks: [], objects: {}, requests: [], states: [], uploads: {} };
    ({ close, url } = await startBackend(backend));

    localStateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-remote-state-'));
    otherLocalStateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-remote-state-'));
    remoteStateProvider = build(localStateDirectoryPath);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await close();
    await rm(localStateDirectoryPath, { force: true, recursive: true });
    await rm(otherLocalStateDirectoryPath, { force: true, recursive: true });
  });

  describe('getAppLock()', () => {
    it('should return undefined when the app is unlocked', async () => {
      expect(await remoteStateProvider.getAppLock()).toBeUndefined();
    });

    it('should return the lock held', async () => {
      const { lockId } = await remoteStateProvider.lockApp();

      expect(await remoteStateProvider.getAppLock()).toBe(lockId);
    });
  });

  describe('isAppLocked()', () => {
    it('should throw when a different lock is held', async () => {
      await remoteStateProvider.lockApp();

      await expect(remoteStateProvider.isAppLocked('b'.repeat(64))).rejects.toThrow('Invalid lock ID!');
    });

    it('should throw when the lock was not taken in this state directory', async () => {
      const { lockId } = await remoteStateProvider.lockApp();

      await expect(build(otherLocalStateDirectoryPath).isAppLocked(lockId)).rejects.toThrow(
        `Lock "${lockId}" was not taken in this state directory`,
      );
    });

    it('should return false when the app is unlocked', async () => {
      expect(await remoteStateProvider.isAppLocked('b'.repeat(64))).toBe(false);
    });

    it('should return true for the lock held', async () => {
      const { lockId } = await remoteStateProvider.lockApp();

      expect(await remoteStateProvider.isAppLocked(lockId)).toBe(true);
    });
  });

  describe('lockApp()', () => {
    it('should throw naming the holder when the app is locked', async () => {
      const { lockId } = await remoteStateProvider.lockApp();

      await expect(build(otherLocalStateDirectoryPath).lockApp()).rejects.toThrow(
        `App already locked with lock ID "${lockId}", taken by "a-context" since ${new Date(0).toISOString()}!`,
      );
      await expect(build(otherLocalStateDirectoryPath).lockApp()).rejects.toMatchObject({
        holder: { commitId: backend.locks[0].commitId, context: 'a-context', lockId, takenAt: 0 },
        reason: 'held',
      });
    });

    it('should throw and release the lock when the state moved since the last refresh', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await remoteStateProvider.refreshState();
      seal('commit-2', { 'a.json': '{"a":2}' });

      await expect(remoteStateProvider.lockApp()).rejects.toThrow('App state moved since it was last refreshed!');
      await expect(remoteStateProvider.lockApp()).rejects.toMatchObject({
        newestCommitId: 'commit-2',
        reason: 'state-moved',
        refreshedCommitId: 'commit-1',
      });
      expect(backend.locks).toEqual([]);
    });

    it('should throw when the state was never refreshed', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });

      await expect(remoteStateProvider.lockApp()).rejects.toThrow('App state moved since it was last refreshed!');
    });

    it('should name a new commit on every lock', async () => {
      const { lockId: firstLockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.unlockApp(firstLockId);
      await remoteStateProvider.lockApp();

      expect(backend.locks[0].commitId).toMatch(/^\d{8}T\d{9}Z-[0-9a-f]{8}$/);
      expect(backend.requests.filter((r) => r === 'POST /lock')).toHaveLength(2);
    });

    it('should take the lock on a first run, writing nothing when the directory is empty', async () => {
      const { commitId, lockId } = await remoteStateProvider.lockApp();

      expect(commitId).toBe(backend.locks[0].commitId);
      expect(backend.locks).toMatchObject([{ context: 'a-context', lockId, scope: ['app'] }]);
      expect(backend.states).toEqual([]);
    });

    it('should open the run with everything the directory holds', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await remoteStateProvider.refreshState();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"generated":true}'), stateFileName: 'models.json' }]);

      await remoteStateProvider.lockApp();

      expect(backend.states[1]).toMatchObject({
        files: { 'a.json': '{"a":1}', 'models.json': '{"generated":true}' },
        phase: 'apply',
      });
    });

    describe('with a lock ID', () => {
      it('should throw when the lock is not held', async () => {
        await expect(remoteStateProvider.lockApp('b'.repeat(64))).rejects.toThrow(
          `App is not locked with lock ID "${'b'.repeat(64)}"!`,
        );
        await expect(remoteStateProvider.lockApp('b'.repeat(64))).rejects.toMatchObject({ reason: 'not-held' });
      });

      it('should take the journal the run wrote, and keep and upload the journal of this machine', async () => {
        const { commitId, lockId } = await remoteStateProvider.lockApp();
        await remoteStateProvider.saveStates([{ data: Buffer.from('{"j":1}'), stateFileName: 'journal.c.apply.json' }]);
        await writeFile(join(otherLocalStateDirectoryPath, 'journal.d.validate.json'), '{"j":2}');

        const resumed = await build(otherLocalStateDirectoryPath).lockApp(lockId);

        expect(resumed).toEqual({ commitId, lockId, resumedFrom: 'run' });
        expect(await stateFileNames(otherLocalStateDirectoryPath)).toEqual([
          'journal.c.apply.json',
          'journal.d.validate.json',
        ]);
        expect(backend.states[0].files).toEqual({
          'journal.c.apply.json': '{"j":1}',
          'journal.d.validate.json': '{"j":2}',
        });
      });

      it('should continue in the state directory the lock was taken in', async () => {
        const { lockId } = await remoteStateProvider.lockApp();

        await expect(remoteStateProvider.lockApp(lockId)).resolves.toMatchObject({ resumedFrom: 'directory' });
      });

      it('should read what the run wrote into another state directory', async () => {
        const { lockId } = await remoteStateProvider.lockApp();
        await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
        await writeFile(join(otherLocalStateDirectoryPath, 'stale.json'), '{}');

        const otherRemoteStateProvider = build(otherLocalStateDirectoryPath);
        await otherRemoteStateProvider.lockApp(lockId);

        expect(await stateFileNames(otherLocalStateDirectoryPath)).toEqual(['a.json']);
        expect(await otherRemoteStateProvider.isAppLocked(lockId)).toBe(true);
      });

      it('should write through the same lock after resuming', async () => {
        const { lockId } = await remoteStateProvider.lockApp();
        await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);

        const otherRemoteStateProvider = build(otherLocalStateDirectoryPath);
        await otherRemoteStateProvider.lockApp(lockId);
        await otherRemoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
        await otherRemoteStateProvider.unlockApp(lockId);

        expect(backend.states[0]).toMatchObject({
          files: { 'a.json': '{"a":1}', 'b.json': '{"b":1}' },
          phase: 'commit',
        });
      });

      it('should start from the newest sealed state when the run wrote nothing', async () => {
        seal('commit-1', { 'a.json': '{"a":1}', 'journal.c.commit.json': '{"j":1}' });
        await remoteStateProvider.refreshState();
        const { lockId } = await remoteStateProvider.lockApp();
        backend.states = backend.states.filter((s) => s.phase === 'commit');

        await expect(build(otherLocalStateDirectoryPath).lockApp(lockId)).resolves.toMatchObject({
          resumedFrom: 'sealed',
        });

        expect(await stateFileNames(otherLocalStateDirectoryPath)).toEqual(['a.json']);
        expect(backend.states[1]).toMatchObject({ phase: 'apply' });
        expect(backend.states[1].files).toEqual({ 'a.json': '{"a":1}' });
      });
    });
  });

  describe('refreshState()', () => {
    it('should leave the directory alone when nothing is sealed', async () => {
      await writeFile(join(localStateDirectoryPath, 'a.json'), '{}');

      await remoteStateProvider.refreshState();

      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json']);
    });

    it('should replace the directory with the newest sealed state', async () => {
      seal('commit-1', { 'a.json': '{"a":1}', 'b.json': '{"b":1}' });
      await writeFile(join(localStateDirectoryPath, 'stale.json'), '{}');

      const refreshed = await remoteStateProvider.refreshState();

      expect(refreshed).toEqual({ commitId: 'commit-1', previousCommitId: undefined, replaced: true });
      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'b.json']);
      expect((await remoteStateProvider.getState('a.json')).toString()).toBe('{"a":1}');
    });

    it('should throw and leave the directory alone when a file does not download whole', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await writeFile(join(localStateDirectoryPath, 'b.json'), '{}');
      backend.corruptsDownloads = true;

      await expect(remoteStateProvider.refreshState()).rejects.toThrow(
        'Failed to read the app state: state file "a.json" did not download whole!',
      );
      expect(await readdir(localStateDirectoryPath)).toEqual(['b.json']);
    });

    it('should neither replace nor take journal files', async () => {
      seal('commit-1', { 'a.json': '{"a":1}', 'journal.c.r.json': '{"j":1}' });
      await writeFile(join(localStateDirectoryPath, 'journal.d.r.json'), '{"j":2}');

      await remoteStateProvider.refreshState();

      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'journal.d.r.json']);
    });

    it('should name the commit it replaced the directory from', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await remoteStateProvider.refreshState();
      seal('commit-2', { 'a.json': '{"a":2}' });

      expect(await remoteStateProvider.refreshState()).toEqual({
        commitId: 'commit-2',
        previousCommitId: 'commit-1',
        replaced: true,
      });
      expect(await remoteStateProvider.refreshState()).toEqual({ commitId: 'commit-2', replaced: false });
    });

    it('should not download a state the directory already holds', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await remoteStateProvider.refreshState();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'models.json' }]);

      await remoteStateProvider.refreshState();

      expect(backend.requests.filter((r) => r === 'GET /latest')).toHaveLength(1);
      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'models.json']);
    });

    it('should keep the directory of a run still holding its lock', async () => {
      seal('commit-1', { 'a.json': '{"a":1}' });
      await remoteStateProvider.refreshState();
      await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'b.json' }]);

      await remoteStateProvider.refreshState();

      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'b.json']);
    });

    it('should read the newest sealed state once a run was finished elsewhere', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      const otherRemoteStateProvider = build(otherLocalStateDirectoryPath);
      await otherRemoteStateProvider.lockApp(lockId);
      await otherRemoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
      await otherRemoteStateProvider.unlockApp(lockId);

      await remoteStateProvider.refreshState();

      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'b.json']);
    });
  });

  describe('saveStates()', () => {
    it('should throw on a name the backend does not accept', async () => {
      await expect(
        remoteStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'a b.json' }]),
      ).rejects.toThrow('State file name "a b.json" is not accepted by the remote state!');
      await expect(
        remoteStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'a.yaml' }]),
      ).rejects.toThrow('State file name "a.yaml" is not accepted by the remote state!');
    });

    it('should throw having written nothing when the backend would refuse one file', async () => {
      await expect(
        remoteStateProvider.saveStates([
          { data: Buffer.from('{"a":1}'), stateFileName: 'a.json' },
          { data: Buffer.from('{}'), stateFileName: 'b.yaml' },
        ]),
      ).rejects.toThrow('State file name "b.yaml" is not accepted by the remote state!');

      expect(await stateFileNames(localStateDirectoryPath)).toEqual([]);
    });

    it('should throw the refusal of a write the backend holds the app back from', async () => {
      await remoteStateProvider.lockApp();
      backend.limitRefusal = 'An upload may name at most 1 files!';

      await expect(
        remoteStateProvider.saveStates([
          { data: Buffer.from('{}'), stateFileName: 'a.json' },
          { data: Buffer.from('{}'), stateFileName: 'b.json' },
        ]),
      ).rejects.toThrow('Failed to write the app state: An upload may name at most 1 files!');
    });

    it('should throw without claiming the upload when a file does not upload', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.lockApp();
      backend.refusesObjects = true;

      await expect(
        remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]),
      ).rejects.toThrow('Failed to write the app state: state file "b.json" did not upload!');
      expect(backend.states[0].files).toEqual({ 'a.json': '{"a":1}' });
      expect(backend.requests.filter((r) => r.endsWith('/claim'))).toHaveLength(1);
      expect(await readdir(localStateDirectoryPath)).toEqual(['a.json', 'b.json', 'remote-state.lock']);
    });

    it('should write only to the directory when no run is open', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);

      expect(await readFile(join(localStateDirectoryPath, 'a.json'), 'utf-8')).toBe('{"a":1}');
      expect(backend.requests).toEqual([]);
    });

    it('should write into the open run, uploading only what changed', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.lockApp();

      await remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);

      expect(backend.states[0].files).toEqual({ 'a.json': '{"a":1}', 'b.json': '{"b":1}' });
      expect(backend.requests.filter((r) => r.endsWith('/claim'))).toHaveLength(2);
      expect(backend.requests.filter((r) => r === 'PUT /s3')).toHaveLength(2);
      expect(await readdir(localStateDirectoryPath)).toEqual(['a.json', 'b.json', 'remote-state.lock']);
    });

    it('should write and delete in one upload into the open run', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.lockApp();

      await remoteStateProvider.saveStates([
        { data: undefined, stateFileName: 'a.json' },
        { data: Buffer.from('{"b":1}'), stateFileName: 'b.tfstate' },
        { data: Buffer.from('{"c":1}'), stateFileName: 'c.tfstate' },
      ]);

      expect(backend.states[0].files).toEqual({ 'b.tfstate': '{"b":1}', 'c.tfstate': '{"c":1}' });
      expect(backend.requests.filter((r) => r.endsWith('/claim'))).toHaveLength(2);
    });

    it('should remove the file from the open run', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
      await remoteStateProvider.lockApp();

      await remoteStateProvider.saveStates([{ data: undefined, stateFileName: 'b.json' }]);

      expect(backend.states[0].files).toEqual({ 'a.json': '{"a":1}' });
    });

    it('should not reach the backend when nothing changed', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.tfstate' }]);
      await remoteStateProvider.lockApp();
      const requestCount = backend.requests.length;

      await remoteStateProvider.saveStates([
        { data: Buffer.from('{"a":1}'), stateFileName: 'a.tfstate' },
        { data: undefined, stateFileName: 'b.tfstate' },
      ]);

      expect(backend.requests).toHaveLength(requestCount);
    });

    it('should keep a nested name on the machine, even while a run is open', async () => {
      await remoteStateProvider.lockApp();
      const requestCount = backend.requests.length;

      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'archives/c/r.json' }]);

      expect(await readFile(join(localStateDirectoryPath, 'archives', 'c', 'r.json'), 'utf-8')).toBe('{"a":1}');
      expect((await remoteStateProvider.getState('archives/c/r.json')).toString()).toBe('{"a":1}');
      expect(backend.requests).toHaveLength(requestCount);

      await remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
      expect(backend.states[0].files).toEqual({ 'b.json': '{"b":1}' });
    });

    it('should keep every write of concurrent writers', async () => {
      await remoteStateProvider.lockApp();
      const otherProcess = build(localStateDirectoryPath);

      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          (i % 2 ? otherProcess : remoteStateProvider).saveStates([
            { data: Buffer.from(`{"i":${i}}`), stateFileName: `${i}.json` },
          ]),
        ),
      );

      expect(Object.keys(backend.states[0].files)).toHaveLength(10);
    });
  });

  describe('unlockApp()', () => {
    it('should throw when a different lock is held', async () => {
      await remoteStateProvider.lockApp();

      await expect(remoteStateProvider.unlockApp('b'.repeat(64))).rejects.toThrow('Invalid lock ID!');
    });

    it('should not throw when the app is unlocked', async () => {
      await expect(remoteStateProvider.unlockApp('b'.repeat(64))).resolves.toBeUndefined();
    });

    it('should seal the run and release its lock', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);

      await remoteStateProvider.unlockApp(lockId);

      expect(backend.locks).toEqual([]);
      expect(backend.states[0]).toMatchObject({ files: { 'a.json': '{"a":1}' }, phase: 'commit' });
    });

    it('should seal the record as last written, and write a later change to the directory alone', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([
        { data: Buffer.from('{"a":1}'), stateFileName: 'a.json' },
        { data: Buffer.from('{"j":1}'), stateFileName: 'journal.c.commit.json' },
      ]);

      await remoteStateProvider.unlockApp(lockId);
      const requestCount = backend.requests.length;
      await remoteStateProvider.saveStates([
        { data: Buffer.from('{"j":1}'), stateFileName: `archives/${lockId}/journal.c.commit.json` },
        { data: undefined, stateFileName: 'journal.c.commit.json' },
      ]);

      expect(backend.requests.length).toBe(requestCount);
      expect(backend.states[0]).toMatchObject({
        files: { 'a.json': '{"a":1}', 'journal.c.commit.json': '{"j":1}' },
        phase: 'commit',
      });
      expect(await stateFileNames(localStateDirectoryPath)).toEqual(['a.json', 'archives']);
    });

    it('should write the directory into the record before sealing it, when a write failed', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      backend.refusesObjects = true;
      await expect(
        remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]),
      ).rejects.toThrow('Failed to write the app state: state file "a.json" did not upload!');
      backend.refusesObjects = false;

      await remoteStateProvider.unlockApp(lockId);

      expect(backend.locks).toEqual([]);
      expect(backend.states[0]).toMatchObject({ files: { 'a.json': '{"a":1}' }, phase: 'commit' });
    });

    it('should throw and keep the lock held when the directory cannot be written into the record', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"b":1}'), stateFileName: 'b.json' }]);
      const { lockId } = await remoteStateProvider.lockApp();
      backend.refusesObjects = true;
      await expect(
        remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]),
      ).rejects.toThrow('did not upload!');

      await expect(remoteStateProvider.unlockApp(lockId)).rejects.toThrow(
        'Failed to write the app state: state file "a.json" did not upload!',
      );
      expect(backend.locks.map((lock) => lock.lockId)).toEqual([lockId]);
      expect(backend.states[0]).toMatchObject({ files: { 'b.json': '{"b":1}' }, phase: 'apply' });
    });

    it('should leave neither lock file behind, and upload neither', async () => {
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.refreshState();
      const { lockId } = await remoteStateProvider.lockApp();
      expect((await readdir(localStateDirectoryPath)).sort()).toEqual(['a.json', 'remote-state.lock']);

      await remoteStateProvider.unlockApp(lockId);

      expect(await readdir(localStateDirectoryPath)).toEqual(['a.json']);
      expect(Object.keys(backend.states[0].files)).toEqual(['a.json']);
    });

    it('should require a refresh before the next run locks', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await remoteStateProvider.unlockApp(lockId);

      await expect(remoteStateProvider.lockApp()).rejects.toThrow('App state moved since it was last refreshed!');
      await remoteStateProvider.refreshState();
      await expect(remoteStateProvider.lockApp()).resolves.toBeDefined();
    });

    it('should seal the record as it stands from a directory the run was not taken in', async () => {
      const { lockId } = await remoteStateProvider.lockApp();
      await remoteStateProvider.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'a.json' }]);
      await writeFile(join(otherLocalStateDirectoryPath, 'b.json'), '{}');

      await build(otherLocalStateDirectoryPath).unlockApp(lockId);

      expect(backend.states[0]).toMatchObject({ files: { 'a.json': '{"a":1}' }, phase: 'commit' });
    });
  });
});
