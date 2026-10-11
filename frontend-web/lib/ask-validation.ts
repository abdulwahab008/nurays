/**
 * What is wrong with the answer typed into an "ask" window (components/ui/Dialogs.tsx), if anything. Pure, so the rules
 * are tested without a browser.
 */
export interface AskRules {
  /** The exact text that must be typed, such as DELETE. */
  mustEqual?: string;
  /** An empty answer is accepted. */
  optional?: boolean;
  /** The fewest characters accepted. */
  minLength?: number;
}

export type AskProblem = 'mustEqual' | 'required' | 'minLength' | null;

export function askProblem(rules: AskRules, answer: string): AskProblem {
  if (rules.mustEqual !== undefined) return answer === rules.mustEqual ? null : 'mustEqual';
  if (answer.length === 0) return rules.optional ? null : 'required';
  if (rules.minLength && answer.length < rules.minLength) return 'minLength';
  return null;
}
