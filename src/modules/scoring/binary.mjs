import {
  AnswerKeySchema,
  InteractionSchema,
  SectionSchema,
  parseResponseForInteraction,
} from "../../../packages/contracts/src/index.ts";

const POLICY_VERSION = "practice-binary-v1";

function invalidInput() {
  throw new TypeError("Invalid grading input");
}

function parseSchema(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalidInput();
  return parsed.data;
}

function parseResponse(interaction, value) {
  try {
    return parseResponseForInteraction(interaction, value);
  } catch {
    invalidInput();
  }
}

function sameIdSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every((id) => rightSet.has(id));
}

function earnedFor(interaction, answerKey, rawResponse) {
  const key = parseSchema(AnswerKeySchema, answerKey);
  if (key.type !== interaction.type) invalidInput();
  if (interaction.type === "SINGLE_CHOICE") {
    if (!interaction.options.some((option) => option.id === key.optionId)) invalidInput();
  } else if (interaction.type === "MULTIPLE_CHOICE") {
    const allowedIds = new Set(interaction.options.map((option) => option.id));
    if (
      key.optionIds.length < interaction.minSelections ||
      key.optionIds.length > interaction.maxSelections ||
      new Set(key.optionIds).size !== key.optionIds.length ||
      key.optionIds.some((id) => !allowedIds.has(id))
    ) {
      invalidInput();
    }
  } else if (interaction.type === "TRUE_FALSE_GROUP") {
    const statementIds = interaction.statements.map((statement) => statement.id);
    const keyIds = Object.keys(key.values);
    if (!sameIdSet(statementIds, keyIds)) invalidInput();
  } else {
    invalidInput();
  }

  if (rawResponse === null) return 0;
  const response = parseResponse(interaction, rawResponse);
  if (interaction.type === "SINGLE_CHOICE" && response.type === "SINGLE_CHOICE") {
    return response.optionId !== null && response.optionId === key.optionId ? 1 : 0;
  }
  if (interaction.type === "MULTIPLE_CHOICE" && response.type === "MULTIPLE_CHOICE") {
    return sameIdSet(key.optionIds, response.optionIds) ? 1 : 0;
  }
  if (interaction.type === "TRUE_FALSE_GROUP" && response.type === "TRUE_FALSE_GROUP") {
    return Object.keys(key.values).every((id) => response.values[id] !== null && response.values[id] === key.values[id])
      ? 1
      : 0;
  }
  invalidInput();
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact practice-binary-v1 percentage, rounded half-up without floating point. */
export function percentage(correctCount, totalCount) {
  if (!Number.isSafeInteger(correctCount) || !Number.isSafeInteger(totalCount)) {
    throw new RangeError("Score counts must be safe integers");
  }
  if (totalCount <= 0 || correctCount < 0 || correctCount > totalCount) {
    throw new RangeError("Score counts are outside the valid range");
  }

  const denominator = BigInt(totalCount);
  const scaled = 10_000n * BigInt(correctCount);
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  const hundredths = quotient + (2n * remainder >= denominator ? 1n : 0n);
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** Scores a frozen SQL grading-input projection; malformed persisted data is rejected. */
export function scoreAttempt(input) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    input.policyVersion !== POLICY_VERSION ||
    !Array.isArray(input.slots) ||
    input.slots.length === 0
  ) {
    invalidInput();
  }

  const seenSlotIds = new Set();
  const seenOrdinals = new Set();
  let sectionId;
  let section;
  const items = input.slots.map((slot) => {
    if (slot === null || typeof slot !== "object" || Array.isArray(slot)) invalidInput();
    if (
      typeof slot.slotId !== "string" || slot.slotId.trim().length === 0 ||
      typeof slot.sectionId !== "string" || slot.sectionId.trim().length === 0 ||
      !Number.isSafeInteger(slot.ordinal) || slot.ordinal < 0
    ) {
      invalidInput();
    }
    const parsedSection = parseSchema(SectionSchema, slot.section);
    if (sectionId === undefined) {
      sectionId = slot.sectionId;
      section = parsedSection;
    } else if (sectionId !== slot.sectionId || section !== parsedSection) {
      invalidInput();
    }
    if (seenSlotIds.has(slot.slotId) || seenOrdinals.has(slot.ordinal)) invalidInput();
    seenSlotIds.add(slot.slotId);
    seenOrdinals.add(slot.ordinal);

    const interaction = parseSchema(InteractionSchema, slot.interaction);
    const earned = earnedFor(interaction, slot.answerKey, slot.response);
    return { slotId: slot.slotId, ordinal: slot.ordinal, earned };
  });

  items.sort((left, right) => left.ordinal - right.ordinal || compareText(left.slotId, right.slotId));
  const correctCount = items.reduce((sum, item) => sum + item.earned, 0);
  const totalCount = items.length;

  return {
    correctCount,
    totalCount,
    percentage: percentage(correctCount, totalCount),
    sections: [{ sectionId, section, correctCount, totalCount }],
    items: items.map(({ slotId, earned }) => ({ slotId, earned })),
  };
}
