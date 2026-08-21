import { EventEmitter } from "node:events";
import crypto from "node:crypto";

const STATES = Object.freeze({
  WAITING: "waiting",
  BETTING: "betting",
  RUNNING: "running",
  CRASHED: "crashed"
});

export class CrashEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bettingDurationMs = options.bettingDurationMs ?? 5000;
    this.runningTickMs = options.runningTickMs ?? 100;
    this.historyLimit = options.historyLimit ?? 100;
    this.rounds = new Map();
    this.currentRound = null;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.createRound();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  createRound() {
    if (!this.running) return;

    const round = {
      round_id: `CR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      status: STATES.WAITING,
      multiplier: 1,
      crash_point: null,
      created_at: new Date().toISOString(),
      betting_ends_at: null,
      started_at: null,
      crashed_at: null
    };

    this.currentRound = round;
    this.saveRound(round);
    this.emitEvent("round.waiting", round);

    this.timer = setTimeout(() => this.startBetting(round), 1000);
  }

  startBetting(round) {
    if (!this.running || this.currentRound !== round) return;

    round.status = STATES.BETTING;
    round.betting_ends_at = new Date(Date.now() + this.bettingDurationMs).toISOString();
    this.saveRound(round);
    this.emitEvent("round.betting", round);

    this.timer = setTimeout(() => this.startRunning(round), this.bettingDurationMs);
  }

  startRunning(round) {
    if (!this.running || this.currentRound !== round) return;

    round.status = STATES.RUNNING;
    round.started_at = new Date().toISOString();
    round.crash_point = this.generateCrashPoint();
    round.multiplier = 1;
    this.saveRound(round);
    this.emitEvent("round.running", round);

    this.runTick(round);
  }

  runTick(round) {
    if (!this.running || this.currentRound !== round || round.status !== STATES.RUNNING) return;

    const elapsedSeconds = (Date.now() - new Date(round.started_at).getTime()) / 1000;
    round.multiplier = Number(Math.max(1, Math.exp(0.16 * elapsedSeconds)).toFixed(2));

    if (round.multiplier >= round.crash_point) {
      round.multiplier = round.crash_point;
      round.status = STATES.CRASHED;
      round.crashed_at = new Date().toISOString();
      this.saveRound(round);
      this.emitEvent("round.crashed", round);

      this.timer = setTimeout(() => this.createRound(), 1500);
      return;
    }

    this.emitEvent("round.multiplier", round);
    this.timer = setTimeout(() => this.runTick(round), this.runningTickMs);
  }

  generateCrashPoint() {
    // Demo engine only. Replace with the production game's approved
    // deterministic/provably-fair result generation before real-money use.
    const value = 1 + Math.random() * 9;
    return Number(value.toFixed(2));
  }

  saveRound(round) {
    this.rounds.set(round.round_id, { ...round });

    while (this.rounds.size > this.historyLimit) {
      const oldest = this.rounds.keys().next().value;
      this.rounds.delete(oldest);
    }
  }

  emitEvent(event, round) {
    this.emit("event", {
      event,
      timestamp: new Date().toISOString(),
      data: { ...round }
    });
  }

  getCurrentRound() {
    return this.currentRound ? { ...this.currentRound } : null;
  }

  getRounds(limit = 50) {
    return Array.from(this.rounds.values()).reverse().slice(0, limit);
  }

  getRound(roundId) {
    return this.rounds.get(roundId) ? { ...this.rounds.get(roundId) } : null;
  }
}

export { STATES as CRASH_STATES };
