import { ApiError } from '../../core/errors';

/**
 * Не больше `maxRunning` задач одновременно; следующие ждут в очереди
 * длиной до `maxWaiting`, сверх неё — сразу 429.
 */
export class ConcurrencyLimit {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly maxRunning: number,
    private readonly maxWaiting: number,
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running < this.maxRunning) {
      this.running += 1;
    } else {
      if (this.waiting.length >= this.maxWaiting) throw new ApiError('too_many_requests');
      // Слот передаёт завершившийся вызов — между ним и ждущим никто не вклинится
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}
