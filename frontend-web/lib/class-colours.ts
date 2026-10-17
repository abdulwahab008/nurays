// Whether a className asks for its own text or border colour (text-red-700, border-slate-300, text-white, text-[#0c1016]).
// Size classes such as text-sm or text-[15px] and prefixed ones such as hover:text-white do not count.
const TEXT_COLOUR = /(?:^|\s)text-(?:white|black|inherit|current|[a-z]+-\d{2,3}(?:\/\d+)?|\[(?:#|rgb)[^\]]*\])(?=\s|$)/;
const BORDER_COLOUR = /(?:^|\s)border-(?:white|black|transparent|current|[a-z]+-\d{2,3}(?:\/\d+)?|\[(?:#|rgb)[^\]]*\])(?=\s|$)/;

export const asksForTextColour = (className?: string): boolean => !!className && TEXT_COLOUR.test(className);
export const asksForBorderColour = (className?: string): boolean => !!className && BORDER_COLOUR.test(className);
