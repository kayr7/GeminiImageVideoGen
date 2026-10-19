export interface Example {
  id: string;
  label: string;
  prompt: string;
  system?: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'math',
    label: 'Multi-step math word problem',
    prompt:
      'A train leaves city A at 9:00 travelling at 80 km/h. A second train leaves city B, 440 km away, at 10:00 travelling towards A at 100 km/h. At what time do they meet, and how far from city A?',
  },
  {
    id: 'bat',
    label: 'Logic puzzle: bat and ball',
    prompt:
      'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with just the number.',
  },
  {
    id: 'sentiment',
    label: 'Few-shot sentiment classification',
    prompt:
      'Classify the sentiment of each review as Positive, Negative or Neutral.\n\nInput: "The battery lasts forever and the screen is gorgeous."\nOutput: Positive\n\nInput: "It arrived late and the box was crushed."\nOutput: Negative\n\nInput: "It does what it says. Nothing special."\nOutput: Neutral\n\nInput: "I wanted to love it, but the app keeps crashing."\nOutput:',
  },
  {
    id: 'strawberry',
    label: 'Letter counting: strawberry',
    prompt: "How many r's are in the word 'strawberry'? Answer with just the number.",
  },
];

export const FEW_SHOT_SCAFFOLD =
  'Task: <describe the task>\n\nInput: <example 1 input>\nOutput: <example 1 output>\n\nInput: <example 2 input>\nOutput: <example 2 output>\n\nInput: <your real input>\nOutput:';

export const COT_SUFFIX = "Let's think step by step.";

export const ROLE_SCAFFOLD = 'You are an expert ';

export interface SystemPreset {
  id: string;
  label: string;
  text: string;
}

/** Built-in system prompt presets ("none" clears the field). */
export const SYSTEM_PRESETS: SystemPreset[] = [
  { id: 'none', label: 'None', text: '' },
  { id: 'helpful', label: 'Helpful assistant', text: 'You are a helpful, friendly assistant. Answer clearly and accurately.' },
  { id: 'one-sentence', label: 'One sentence only', text: 'Answer every question in exactly one sentence. No lists, no extra explanation.' },
  {
    id: 'socratic',
    label: 'Socratic tutor',
    text: 'You are a Socratic tutor. Never give the answer directly. Instead, ask one or two short guiding questions that help the student work it out themselves.',
  },
  { id: 'eli10', label: "Explain like I'm 10", text: "Explain everything like the reader is 10 years old: simple words, short sentences, a friendly everyday example." },
  {
    id: 'stepwise',
    label: 'Step-by-step reasoner',
    text: 'Always reason step by step before giving your final answer. Write out each step, then end with a final line in the form "Answer: <answer>".',
  },
  {
    id: 'json',
    label: 'JSON only',
    text: 'Respond only with valid JSON of the form {"answer": string, "confidence": number between 0 and 1}. No prose, no markdown, no code fences.',
  },
  {
    id: 'cooking',
    label: 'Guardrail: cooking only',
    text: 'You are a cooking assistant. Only answer questions about cooking, recipes and food preparation. Politely refuse anything else and offer to help with a cooking question instead.',
  },
  { id: 'pirate', label: 'Pirate persona', text: 'You are a pirate. Speak like a pirate in every reply, but still give correct and useful answers.' },
  {
    id: 'skeptic',
    label: 'Skeptical reviewer',
    text: 'You are a skeptical reviewer. Point out flaws, hidden assumptions and missing evidence in whatever the user says or asks, then suggest how to fix them.',
  },
];
