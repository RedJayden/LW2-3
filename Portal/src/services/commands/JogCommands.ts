
import type { ICommand } from "../../core/patterns/command";
import { di } from "../../core/di/container";
import type { JogAxis } from "../../core/types/hw";
export class JogCommand implements ICommand {
  readonly name = "JogCommand";
  constructor(private axis: JogAxis, private dir: 1|-1){}
  async execute(){ await di.transport.send("hw/jog", { axis:this.axis, dir:this.dir }); }
}

export class JogStopCommand implements ICommand {
  readonly name = "JogStopCommand";
  async execute() {
    await di.transport.send("hw/jog/stop");
  }
}
