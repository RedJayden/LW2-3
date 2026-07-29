
export interface IPipelineStep {
  title: string;
  run(): Promise<void>;
}
export class Pipeline {
  constructor(private steps: IPipelineStep[]){ }
  async execute(onStep?: (i:number, title:string)=>void) {
    for (let i=0;i<this.steps.length;i++){
      onStep?.(i, this.steps[i].title);
      await this.steps[i].run();
    }
  }
}
