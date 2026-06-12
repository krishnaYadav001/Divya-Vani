import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScriptureSteeringBlock,
  deterministicQueryThemesForTurn,
  isRomanticRelationshipTurn,
} from "../scriptureSteering";

describe("scriptureSteering", () => {
  it("detects romantic breakup turns", () => {
    assert.equal(
      isRomanticRelationshipTurn(
        "Meri girlfriend ne relation tod diya. Main abhi bhi pyaar karta hoon.",
      ),
      true,
    );
  });

  it("adds love/separation retrieval themes without duty/action drift", () => {
    const themes = deterministicQueryThemesForTurn(
      "My boyfriend ghosted me and I still love him.",
    );

    assert.deepEqual(themes, ["attachment", "longing", "grief", "betrayal"]);
    assert.equal(themes.includes("duty"), false);
    assert.equal(themes.includes("action"), false);
  });

  it("adds marriage and family-conflict themes when commitment pressure is explicit", () => {
    const themes = deterministicQueryThemesForTurn(
      "My girlfriend and I want to marry, but her family disapproves.",
    );

    assert.equal(themes.includes("marriage"), true);
    assert.equal(themes.includes("family-conflict"), true);
  });

  it("emits explicit anti-Arjuna steering for relationship pain", () => {
    const block = buildScriptureSteeringBlock(
      "My girlfriend left me. What should I do?",
    );

    assert.match(block, /romantic love/);
    assert.match(block, /Do NOT invoke Arjuna/);
    assert.match(block, /gopi viraha/);
    assert.match(block, /Rukmini/);
  });

  it("steers the reply through emotion and understanding before the parallel", () => {
    const block = buildScriptureSteeringBlock(
      "My girlfriend ended everything and I still love her. What should I do?",
    );

    assert.match(block, /emotional state/);
    assert.match(block, /current understanding/);
    assert.match(block, /decision path/);
    assert.match(block, /separation without self-erasure/);
  });

  it("does not steer ordinary career doubt into the love lane", () => {
    assert.equal(
      buildScriptureSteeringBlock("I feel lost in my career path."),
      "",
    );
  });

  it("does not let old relationship context override a new career question", () => {
    assert.equal(
      buildScriptureSteeringBlock(
        "What should I do about my career now?",
        "Earlier the user shared grief after his girlfriend ended the relationship.",
      ),
      "",
    );
  });

  it("does not let old relationship context override a new scripture topic", () => {
    assert.equal(
      buildScriptureSteeringBlock(
        "Tell me about Bhagavad Gita chapter two.",
        "Earlier the user shared grief after his girlfriend ended the relationship.",
      ),
      "",
    );
  });

  it("does not treat devotional love for Krishna as romantic heartbreak", () => {
    assert.equal(
      buildScriptureSteeringBlock("Krishna, I love you and trust you."),
      "",
    );
  });
});
