import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("scheduler");

export interface NotificationTarget {
  type: "slack" | "teams" | "email";
  target: string;
}

export interface ScheduleEntry {
  name: string;
  cron: string;
  suiteId: string;
  environment: string;
  enabled: boolean;
  tags: string[];
  notification: {
    type: string;
    target: string;
  };
}

export interface SchedulerConfig {
  schedules: ScheduleEntry[];
}

interface ParsedCron {
  minute: number[] | "*";
  hour: number[] | "*";
  dayOfMonth: number[] | "*";
  month: number[] | "*";
  dayOfWeek: number[] | "*";
}

interface ScheduleWithNextRun extends ScheduleEntry {
  nextRunTime: Date | null;
  lastRunTime?: Date;
  lastResult?: "success" | "failure" | "error";
}

function parseCronField(
  field: string,
  min: number,
  max: number
): number[] | "*" {
  const trimmed = field.trim();
  if (trimmed === "*") return "*";

  const stepMatch = trimmed.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    if (isNaN(step) || step <= 0) return "*";
    const values: number[] = [];
    for (let i = min; i <= max; i += step) {
      values.push(i);
    }
    return values;
  }

  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= min && num <= max) {
    return [num];
  }
  return "*";
}

function parseCron(cronExpr: string): ParsedCron | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

function matchesCron(parsed: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  const match = (field: number[] | "*", value: number) =>
    field === "*" || field.includes(value);

  if (!match(parsed.minute, minute)) return false;
  if (!match(parsed.hour, hour)) return false;
  if (!match(parsed.dayOfMonth, dayOfMonth)) return false;
  if (!match(parsed.month, month)) return false;
  if (!match(parsed.dayOfWeek, dayOfWeek)) return false;

  return true;
}

function getNextRunTime(parsed: ParsedCron, from: Date): Date | null {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 32; i++) {
    if (matchesCron(parsed, next)) return new Date(next);
    next.setMinutes(next.getMinutes() + 1);
  }
  return null;
}

export type OnTriggerCallback = (entry: ScheduleEntry) => Promise<void>;

export class TestScheduler {
  private config: SchedulerConfig;
  private onTrigger: OnTriggerCallback;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private scheduleState: Map<string, ScheduleWithNextRun> = new Map();
  private parsedCrons: Map<string, ParsedCron | null> = new Map();
  private lastCheckMinute = -1;

  constructor(config: SchedulerConfig, onTrigger: OnTriggerCallback) {
    this.config = { ...config };
    this.onTrigger = onTrigger;
    for (const entry of this.config.schedules) {
      this.parsedCrons.set(entry.name, parseCron(entry.cron));
      this.scheduleState.set(entry.name, {
        ...entry,
        nextRunTime: null,
      });
    }
  }

  start(): void {
    if (this.intervalId) {
      logger.warn("Scheduler already started");
      return;
    }
    logger.info("Starting test scheduler");
    this.intervalId = setInterval(() => this.tick(), 60 * 1000);
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Scheduler stopped");
    }
  }

  private tick(): void {
    const now = new Date();
    const currentMinute = now.getMinutes() + now.getHours() * 60;
    if (currentMinute === this.lastCheckMinute) return;
    this.lastCheckMinute = currentMinute;

    for (const [name, state] of this.scheduleState) {
      if (!state.enabled) continue;
      const parsed = this.parsedCrons.get(name);
      if (!parsed) continue;
      if (matchesCron(parsed, now)) {
        logger.info({ schedule: name }, "Triggering scheduled run");
        this.executeSchedule(name);
      }
    }
  }

  private async executeSchedule(name: string): Promise<void> {
    const state = this.scheduleState.get(name);
    if (!state) return;
    state.lastRunTime = new Date();
    try {
      await this.onTrigger(state);
      state.lastResult = "success";
    } catch (err) {
      logger.error({ schedule: name, error: err }, "Scheduled run failed");
      state.lastResult = "error";
    }
    const parsed = this.parsedCrons.get(name);
    if (parsed) {
      state.nextRunTime = getNextRunTime(parsed, new Date());
    }
  }

  getSchedules(): ScheduleWithNextRun[] {
    const now = new Date();
    const result: ScheduleWithNextRun[] = [];
    for (const [name, state] of this.scheduleState) {
      const parsed = this.parsedCrons.get(name);
      const nextRun = parsed ? getNextRunTime(parsed, now) : null;
      result.push({
        ...state,
        nextRunTime: nextRun,
      });
    }
    return result;
  }

  addSchedule(entry: ScheduleEntry): void {
    if (this.scheduleState.has(entry.name)) {
      logger.warn({ name: entry.name }, "Schedule already exists, replacing");
    }
    this.config.schedules = this.config.schedules.filter((s) => s.name !== entry.name);
    this.config.schedules.push(entry);
    this.parsedCrons.set(entry.name, parseCron(entry.cron));
    this.scheduleState.set(entry.name, {
      ...entry,
      nextRunTime: null,
    });
    logger.info({ name: entry.name }, "Schedule added");
  }

  removeSchedule(name: string): void {
    this.config.schedules = this.config.schedules.filter((s) => s.name !== name);
    this.parsedCrons.delete(name);
    this.scheduleState.delete(name);
    logger.info({ name }, "Schedule removed");
  }

  async triggerNow(name: string): Promise<void> {
    const state = this.scheduleState.get(name);
    if (!state) {
      throw new Error(`Schedule '${name}' not found`);
    }
    logger.info({ schedule: name }, "Manually triggering schedule");
    await this.executeSchedule(name);
  }
}
