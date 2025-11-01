import { EventEmitter } from "node:events";

import type {
  ContinuumEvent,
  ContinuumEventName,
  ContinuumEventMap,
} from "../events/schema";

type ContinuumEventListener<K extends ContinuumEventName = ContinuumEventName> = (
  event: ContinuumEvent<K>
) => void;

class ContinuumEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit<K extends ContinuumEventName>(
    type: K,
    data: ContinuumEventMap[K],
    options?: { id?: string; timestamp?: string }
  ) {
    const envelope: ContinuumEvent<K> = {
      type,
      data,
      id: options?.id,
      timestamp: options?.timestamp ?? new Date().toISOString(),
    };

    this.emitter.emit("event", envelope);
    this.emitter.emit(type, envelope);
  }

  subscribe(listener: ContinuumEventListener) {
    this.emitter.on("event", listener);

    return () => {
      this.emitter.off("event", listener);
    };
  }

  subscribeTo<K extends ContinuumEventName>(
    type: K,
    listener: ContinuumEventListener<K>
  ) {
    this.emitter.on(type, listener);

    return () => {
      this.emitter.off(type, listener);
    };
  }
}

export const continuumEventBus = new ContinuumEventBus();

export function emitContinuumEvent<K extends ContinuumEventName>(
  type: K,
  data: ContinuumEventMap[K],
  options?: { id?: string; timestamp?: string }
) {
  continuumEventBus.emit(type, data, options);
}

export function subscribeToContinuumEvents(
  listener: ContinuumEventListener
) {
  return continuumEventBus.subscribe(listener);
}

export function subscribeToContinuumEvent<K extends ContinuumEventName>(
  type: K,
  listener: ContinuumEventListener<K>
) {
  return continuumEventBus.subscribeTo(type, listener);
}
