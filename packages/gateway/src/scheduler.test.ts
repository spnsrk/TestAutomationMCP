import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TestScheduler, type ScheduleEntry, type SchedulerConfig, type OnTriggerCallback } from "./scheduler.js";

vi.mock("@test-automation-mcp/core", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    name: "nightly",
    cron: "*/1 * * * *",
    suiteId: "S-001",
    environment: "default",
    enabled: true,
    tags: ["smoke"],
    notification: { type: "slack", target: "#ci" },
    ...overrides,
  };
}

describe("TestScheduler", () => {
  let onTrigger: OnTriggerCallback;

  beforeEach(() => {
    onTrigger = vi.fn().mockResolvedValue(undefined);
  });

  it("should construct without errors", () => {
    const config: SchedulerConfig = { schedules: [makeEntry()] };
    const scheduler = new TestScheduler(config, onTrigger);
    expect(scheduler).toBeDefined();
  });

  describe("getSchedules()", () => {
    it("should return all schedules with nextRunTime populated", () => {
      const config: SchedulerConfig = {
        schedules: [
          makeEntry({ name: "sched-a", cron: "*/1 * * * *" }),
          makeEntry({ name: "sched-b", cron: "0 9 * * 1" }),
        ],
      };
      const scheduler = new TestScheduler(config, onTrigger);
      const schedules = scheduler.getSchedules();

      expect(schedules).toHaveLength(2);
      expect(schedules[0].name).toBe("sched-a");
      expect(schedules[1].name).toBe("sched-b");
      expect(schedules[0].nextRunTime).toBeInstanceOf(Date);
      expect(schedules[1].nextRunTime).toBeInstanceOf(Date);
    });

    it("should return an empty array when no schedules configured", () => {
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);
      expect(scheduler.getSchedules()).toEqual([]);
    });
  });

  describe("addSchedule()", () => {
    it("should add a new schedule", () => {
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);
      expect(scheduler.getSchedules()).toHaveLength(0);

      scheduler.addSchedule(makeEntry({ name: "new-sched" }));

      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].name).toBe("new-sched");
      expect(schedules[0].nextRunTime).toBeInstanceOf(Date);
    });

    it("should replace an existing schedule with the same name", () => {
      const scheduler = new TestScheduler(
        { schedules: [makeEntry({ name: "dup", suiteId: "S-OLD" })] },
        onTrigger,
      );
      scheduler.addSchedule(makeEntry({ name: "dup", suiteId: "S-NEW" }));

      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].suiteId).toBe("S-NEW");
    });
  });

  describe("removeSchedule()", () => {
    it("should remove an existing schedule by name", () => {
      const scheduler = new TestScheduler(
        { schedules: [makeEntry({ name: "to-remove" })] },
        onTrigger,
      );
      expect(scheduler.getSchedules()).toHaveLength(1);

      scheduler.removeSchedule("to-remove");
      expect(scheduler.getSchedules()).toHaveLength(0);
    });

    it("should be a no-op when removing a non-existent name", () => {
      const scheduler = new TestScheduler(
        { schedules: [makeEntry()] },
        onTrigger,
      );
      scheduler.removeSchedule("does-not-exist");
      expect(scheduler.getSchedules()).toHaveLength(1);
    });
  });

  describe("triggerNow()", () => {
    it("should call the onTrigger callback for the given schedule", async () => {
      const entry = makeEntry({ name: "manual-trigger" });
      const scheduler = new TestScheduler({ schedules: [entry] }, onTrigger);

      await scheduler.triggerNow("manual-trigger");

      expect(onTrigger).toHaveBeenCalledTimes(1);
      expect(onTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ name: "manual-trigger", suiteId: "S-001" }),
      );
    });

    it("should throw when the schedule name does not exist", async () => {
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);

      await expect(scheduler.triggerNow("ghost")).rejects.toThrow(
        "Schedule 'ghost' not found",
      );
      expect(onTrigger).not.toHaveBeenCalled();
    });

    it("should set lastResult to 'error' when onTrigger rejects", async () => {
      const failingTrigger = vi.fn().mockRejectedValue(new Error("boom"));
      const scheduler = new TestScheduler(
        { schedules: [makeEntry({ name: "fail-sched" })] },
        failingTrigger,
      );

      await scheduler.triggerNow("fail-sched");

      const schedules = scheduler.getSchedules();
      expect(schedules[0].lastResult).toBe("error");
    });
  });

  describe("start() and stop()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should start an interval timer and call tick immediately", () => {
      const scheduler = new TestScheduler(
        { schedules: [makeEntry({ name: "ticking", enabled: true })] },
        onTrigger,
      );

      scheduler.start();
      scheduler.stop();
    });

    it("should clear the interval timer on stop()", () => {
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);

      scheduler.start();
      scheduler.stop();

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it("should not start a second interval if already started", () => {
      const setSpy = vi.spyOn(globalThis, "setInterval");
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);

      scheduler.start();
      scheduler.start();

      expect(setSpy).toHaveBeenCalledTimes(1);

      scheduler.stop();
      setSpy.mockRestore();
    });

    it("stop() should be safe to call when not started", () => {
      const scheduler = new TestScheduler({ schedules: [] }, onTrigger);
      expect(() => scheduler.stop()).not.toThrow();
    });
  });
});
