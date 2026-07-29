
import type { ICommand } from "../../core/patterns/command";
export class ZoomSetCommand implements ICommand {
  readonly name="ZoomSetCommand";
  constructor(private set:(z:number)=>void, private value:number){}
  async execute(){ this.set(this.value); }
}
