
export interface ICommand {
  readonly name: string;
  execute(): Promise<void>;
}
export class CommandInvoker {
  private queue: ICommand[] = [];
  enqueue(cmd: ICommand) { this.queue.push(cmd); }
  async runAll() {
    for (const c of this.queue) await c.execute();
    this.queue = [];
  }
}
