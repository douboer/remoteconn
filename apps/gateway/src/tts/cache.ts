import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TtsCacheEntry {
  cacheKey: string;
  contentType: string;
  bytes: number;
  createdAt: string;
  lastAccessAt: string;
}

interface TtsCacheFileRecord extends TtsCacheEntry {
  version: 1;
}

interface TtsCacheStoreOptions {
  cacheDir: string;
  ttlMs: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

/**
 * 磁盘缓存采用“音频文件 + metadata sidecar”：
 * 1. 命中时不再请求上游 TTS；
 * 2. metadata 只保留必要字段，不记录原始文本；
 * 3. 每次写入后顺带做一次轻量淘汰，维持总量上限。
 */
export class TtsCacheStore {
  private cacheDir: string;
  private ttlMs: number;
  private maxTotalBytes: number;
  private maxFileBytes: number;

  constructor(options: TtsCacheStoreOptions) {
    this.cacheDir = options.cacheDir;
    this.ttlMs = options.ttlMs;
    this.maxTotalBytes = options.maxTotalBytes;
    this.maxFileBytes = options.maxFileBytes;
  }

  private audioPath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.mp3`);
  }

  private metaPath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private async removeCacheKey(cacheKey: string): Promise<void> {
    await Promise.allSettled([rm(this.audioPath(cacheKey), { force: true }), rm(this.metaPath(cacheKey), { force: true })]);
  }

  async get(cacheKey: string): Promise<{ entry: TtsCacheEntry; audioPath: string } | null> {
    await this.ensureDir();
    try {
      const metaRaw = await readFile(this.metaPath(cacheKey), "utf8");
      const parsed = JSON.parse(metaRaw) as Partial<TtsCacheFileRecord>;
      const audioPath = this.audioPath(cacheKey);
      const audioStat = await stat(audioPath);
      const lastAccessAt = parsed.lastAccessAt || parsed.createdAt || new Date().toISOString();
      if (Date.now() - +new Date(lastAccessAt) > this.ttlMs) {
        await this.removeCacheKey(cacheKey);
        return null;
      }
      const nowIso = new Date().toISOString();
      const entry: TtsCacheEntry = {
        cacheKey,
        contentType: String(parsed.contentType || "audio/mpeg"),
        bytes: Number(parsed.bytes) || audioStat.size,
        createdAt: String(parsed.createdAt || nowIso),
        lastAccessAt: nowIso
      };
      await writeFile(
        this.metaPath(cacheKey),
        JSON.stringify(
          {
            version: 1,
            ...entry
          } satisfies TtsCacheFileRecord,
          null,
          2
        ),
        "utf8"
      );
      return { entry, audioPath };
    } catch {
      await this.removeCacheKey(cacheKey);
      return null;
    }
  }

  async put(cacheKey: string, audio: Buffer, contentType: string): Promise<TtsCacheEntry> {
    await this.ensureDir();
    if (audio.length <= 0) {
      throw new Error("audio buffer is empty");
    }
    if (audio.length > this.maxFileBytes) {
      throw new Error("audio file exceeds cache single-file limit");
    }
    const nowIso = new Date().toISOString();
    const entry: TtsCacheEntry = {
      cacheKey,
      contentType: contentType || "audio/mpeg",
      bytes: audio.length,
      createdAt: nowIso,
      lastAccessAt: nowIso
    };
    await writeFile(this.audioPath(cacheKey), audio);
    await writeFile(
      this.metaPath(cacheKey),
      JSON.stringify(
        {
          version: 1,
          ...entry
        } satisfies TtsCacheFileRecord,
        null,
        2
      ),
      "utf8"
    );
    await this.prune();
    return entry;
  }

  async prune(): Promise<void> {
    await this.ensureDir();
    const names = await readdir(this.cacheDir);
    const metaFiles = names.filter((name) => name.endsWith(".json"));
    const rows: Array<TtsCacheEntry & { audioPath: string; metaPath: string; sortValue: number }> = [];
    for (const file of metaFiles) {
      try {
        const metaPath = path.join(this.cacheDir, file);
        const raw = await readFile(metaPath, "utf8");
        const parsed = JSON.parse(raw) as Partial<TtsCacheFileRecord>;
        const cacheKey = file.replace(/\.json$/u, "");
        const audioPath = this.audioPath(cacheKey);
        const audioStat = await stat(audioPath);
        const lastAccessAt = String(parsed.lastAccessAt || parsed.createdAt || new Date(0).toISOString());
        if (Date.now() - +new Date(lastAccessAt) > this.ttlMs) {
          await this.removeCacheKey(cacheKey);
          continue;
        }
        rows.push({
          cacheKey,
          contentType: String(parsed.contentType || "audio/mpeg"),
          bytes: Number(parsed.bytes) || audioStat.size,
          createdAt: String(parsed.createdAt || new Date().toISOString()),
          lastAccessAt,
          audioPath,
          metaPath,
          sortValue: +new Date(lastAccessAt || parsed.createdAt || 0) || 0
        });
      } catch {
        // 单条损坏直接移除，避免拖垮后续缓存命中。
        const cacheKey = file.replace(/\.json$/u, "");
        await this.removeCacheKey(cacheKey);
      }
    }
    let totalBytes = rows.reduce((sum, item) => sum + item.bytes, 0);
    if (totalBytes <= this.maxTotalBytes) {
      return;
    }
    rows.sort((a, b) => a.sortValue - b.sortValue);
    for (const row of rows) {
      if (totalBytes <= this.maxTotalBytes) break;
      await Promise.allSettled([rm(row.audioPath, { force: true }), rm(row.metaPath, { force: true })]);
      totalBytes -= row.bytes;
    }
  }
}
