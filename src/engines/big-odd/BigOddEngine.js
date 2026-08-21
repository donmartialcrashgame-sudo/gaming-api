import { EventEmitter } from "node:events";
import crypto from "node:crypto";

export class BigOddEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dailyLimit = options.dailyLimit ?? 10;
    this.generated = [];
    this.current = null;
  }

  generateScheduledOdd({ scheduledAt } = {}) {
    if (this.generated.length >= this.dailyLimit) {
      throw new Error("daily_big_odd_limit_reached");
    }

    const odd = Number((10 + Math.random() * 990).toFixed(2));
    const result = {
      id: `BO-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      odd,
      scheduled_at: scheduledAt ?? new Date().toISOString(),
      generated_at: new Date().toISOString(),
      status: "scheduled"
    };

    this.generated.push(result);
    this.current = result;
    this.emit("generated", { ...result });
    return { ...result };
  }

  getCurrent() {
    return this.current ? { ...this.current } : null;
  }

  getHistory(limit = 10) {
    return [...this.generated].reverse().slice(0, limit);
  }

  resetDaily() {
    this.generated = [];
    this.current = null;
  }
}
