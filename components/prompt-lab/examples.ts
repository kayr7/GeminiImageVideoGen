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
