import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── experience level assignment (pure logic, mirrored from worker) ───────────

function assignExperienceLevel(s) {
  const score =
    s.completed_grows * 3 +
    s.seasonal_consistency * 3 +
    s.variety_breadth * 2 +
    s.badge_credibility * 2 +
    s.successful_harvests * 2 +
    Math.floor(s.active_days_last_90 / 10);

  if (score >= 50 && s.completed_grows >= 10 && s.seasonal_consistency >= 2 && s.variety_breadth >= 6) return "advanced";
  if (score >= 18 && s.completed_grows >= 3 && s.variety_breadth >= 2) return "intermediate";
  return "beginner";
}

function bucketPoints(value, steps) {
  let max = 0;
  for (const [min, pts] of steps) if (value >= min && pts > max) max = pts;
  return max;
}

describe("assignExperienceLevel", () => {
  it("returns beginner for zero signals", () => {
    const level = assignExperienceLevel({
      completed_grows: 0, successful_harvests: 0, active_days_last_90: 0,
      seasonal_consistency: 0, variety_breadth: 0, badge_credibility: 0,
    });
    assert.equal(level, "beginner");
  });

  it("returns intermediate for moderate signals", () => {
    const level = assignExperienceLevel({
      completed_grows: 4, successful_harvests: 3, active_days_last_90: 20,
      seasonal_consistency: 1, variety_breadth: 3, badge_credibility: 1,
    });
    assert.equal(level, "intermediate");
  });

  it("returns advanced for high signals", () => {
    const level = assignExperienceLevel({
      completed_grows: 15, successful_harvests: 12, active_days_last_90: 60,
      seasonal_consistency: 4, variety_breadth: 8, badge_credibility: 5,
    });
    assert.equal(level, "advanced");
  });

  it("requires all thresholds for advanced, not just score", () => {
    // High score but low variety_breadth
    const level = assignExperienceLevel({
      completed_grows: 20, successful_harvests: 20, active_days_last_90: 90,
      seasonal_consistency: 5, variety_breadth: 3, badge_credibility: 10,
    });
    assert.equal(level, "intermediate");
  });
});

describe("bucketPoints", () => {
  it("returns 0 when value is below all steps", () => {
    assert.equal(bucketPoints(0, [[1, 8], [3, 16], [5, 24]]), 0);
  });

  it("returns highest matching bucket", () => {
    assert.equal(bucketPoints(5, [[1, 8], [3, 16], [5, 24], [8, 30]]), 24);
  });

  it("returns max bucket when value exceeds all", () => {
    assert.equal(bucketPoints(100, [[1, 8], [3, 16], [5, 24], [8, 30]]), 30);
  });

  it("returns first bucket for value at minimum", () => {
    assert.equal(bucketPoints(1, [[1, 8], [3, 16]]), 8);
  });
});

describe("gardener tier thresholds", () => {
  function tierFromScore(total) {
    if (total >= 80) return "master";
    if (total >= 60) return "pro";
    if (total >= 35) return "intermediate";
    return "novice";
  }

  it("novice for 0 points", () => assert.equal(tierFromScore(0), "novice"));
  it("intermediate at 35", () => assert.equal(tierFromScore(35), "intermediate"));
  it("pro at 60", () => assert.equal(tierFromScore(60), "pro"));
  it("master at 80", () => assert.equal(tierFromScore(80), "master"));
  it("novice at 34", () => assert.equal(tierFromScore(34), "novice"));
});
