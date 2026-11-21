// 多音词的语境例句（点读时在单词后补读一句）
export const CONTEXT_SENTENCES: Record<string, string> = {
  "read": "I like to read books.",
  "live": "We live in a big city.",
  "close": "Please close the door.",
  "wind": "The wind is very strong today.",
  "minute": "Wait a minute, please.",
  "present": "I got a birthday present.",
  "record": "Keep a record of your reading.",
  "desert": "Camels live in the desert.",
  "excuse": "Excuse me, where is the station?",
  "project": "We did a science project.",
  "use": "Can I use your pen?",
  "perfect": "Your English is perfect!",
  "subject": "Math is my favorite subject.",
  "house": "This is my house.",
  "transport": "Buses and trains are public transport.",
  "discount": "Can I get a discount?",
  "entrance": "Meet me at the main entrance.",
  "address": "What's your address?"
};

// PET 中存在多音的词（点读时复用其 PET 例句）
export const PET_HOMOGRAPHS: readonly string[] = [
  "tear",
  "object",
  "row",
  "refuse",
  "produce",
  "permit",
  "separate",
  "contract",
  "increase",
  "decrease",
  "progress",
  "graduate",
  "contest"
];
