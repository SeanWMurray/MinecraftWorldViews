type WorkerReply = { ok: true; result: unknown } | { ok: false; error: string };

interface PendingTask {
  message: unknown;
  transfer: Transferable[];
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Fixed pool of Web Workers with a FIFO task queue. Each task is one
 * request/response round trip; payloads move via the transfer list, never
 * by structured-clone copy. One worker handles one task at a time.
 */
export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly active = new Map<Worker, PendingTask>();
  private readonly queue: PendingTask[] = [];

  constructor(factory: () => Worker, size: number = WorkerPool.defaultSize()) {
    for (let i = 0; i < size; i++) {
      const worker = factory();
      worker.onmessage = (ev: MessageEvent<WorkerReply>) => this.settle(worker, ev.data);
      worker.onerror = (ev) =>
        this.settle(worker, { ok: false, error: ev.message || 'uncaught worker error' });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** All cores but one — the spare stays free for the UI/render thread. */
  static defaultSize(): number {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
    return Math.max(1, (cores || 4) - 1);
  }

  get size(): number {
    return this.workers.length;
  }

  run<T>(message: unknown, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: PendingTask = {
        message,
        transfer,
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      const worker = this.idle.pop();
      if (worker !== undefined) {
        this.dispatch(worker, task);
      } else {
        this.queue.push(task);
      }
    });
  }

  private dispatch(worker: Worker, task: PendingTask): void {
    this.active.set(worker, task);
    worker.postMessage(task.message, task.transfer);
  }

  private settle(worker: Worker, reply: WorkerReply): void {
    const task = this.active.get(worker);
    this.active.delete(worker);
    const next = this.queue.shift();
    if (next !== undefined) {
      this.dispatch(worker, next);
    } else {
      this.idle.push(worker);
    }
    if (task === undefined) return;
    if (reply.ok) {
      task.resolve(reply.result);
    } else {
      task.reject(new Error(reply.error));
    }
  }

  terminate(): void {
    for (const worker of this.workers) worker.terminate();
    const err = new Error('worker pool terminated');
    for (const task of this.queue.splice(0)) task.reject(err);
    for (const task of this.active.values()) task.reject(err);
    this.active.clear();
    this.idle.length = 0;
    this.workers.length = 0;
  }
}
