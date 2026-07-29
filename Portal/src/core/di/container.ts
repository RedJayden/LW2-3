import { TransportCEF } from "../ipc/TransportCEF";
import type { ITransport } from "../ipc/ITransport";
import { MockTransport } from "../../platform/transport/MockTransport";

class Container {
  transport: ITransport = new MockTransport();
}

export const di = {
  transport: import.meta.env.DEV ? new MockTransport() : new TransportCEF(),
};

// To switch to CEF transport:
// di.transport = new CefTransport();
