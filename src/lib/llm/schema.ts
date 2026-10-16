/** JSON schema for structured output (same as the lab's armctl/llm_author.py PLAYABLE_SCHEMA). */
export const PLAYABLE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "lowercase slug, letters digits and '-'" },
    space: { type: "string", enum: ["joint"] },
    start: { type: "string", enum: ["ready"] },
    keyframes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          t: { type: "number" },
          q: { type: "array", items: { type: "number" } },
          grip: { type: "number" },
          ease: { type: "string", enum: ["cubic", "linear", "hold"] },
        },
        required: ["t", "q", "grip", "ease"],
        additionalProperties: false,
      },
    },
    loop: { type: "integer" },
    speed: { type: "number" },
    notes: { type: "string", description: "one sentence on what the motion does" },
  },
  required: ["name", "space", "start", "keyframes", "loop", "speed", "notes"],
  additionalProperties: false,
} as const;

/** Gemini / Vertex responseSchema (OpenAPI subset: no additionalProperties). */
export const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    space: { type: "STRING", enum: ["joint"] },
    start: { type: "STRING", enum: ["ready"] },
    keyframes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          t: { type: "NUMBER" },
          q: { type: "ARRAY", items: { type: "NUMBER" } },
          grip: { type: "NUMBER" },
          ease: { type: "STRING", enum: ["cubic", "linear", "hold"] },
        },
        required: ["t", "q", "grip", "ease"],
        propertyOrdering: ["t", "q", "grip", "ease"],
      },
    },
    loop: { type: "INTEGER" },
    speed: { type: "NUMBER" },
    notes: { type: "STRING" },
  },
  required: ["name", "space", "start", "keyframes", "loop", "speed", "notes"],
  propertyOrdering: ["name", "notes", "space", "start", "keyframes", "loop", "speed"],
} as const;
