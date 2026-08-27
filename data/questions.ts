export type Persona = "APEX" | "CAPELLA" | "AVIVA";

export type QuestionOption = {
  text: string;
  persona: Persona;
};

export type Question = {
  id: number;
  title: string;
  prompt: string;
  options: QuestionOption[];
};

// Full 30-question bank. Storage shape is question -> option text -> persona_weight,
// exactly as specified: never a fixed A/B/C -> persona map, so positions can be
// shuffled per-session without leaking a pattern.
export const QUESTION_BANK: Question[] = [
  {
    id: 1,
    title: "The Moon Shortcut",
    prompt: `Your friend says: "I found a shortcut to the moon. Trust me." You have 30 seconds.`,
    options: [
      { text: "Okay, but where exactly are we going?", persona: "CAPELLA" },
      { text: "Give me 30 seconds. I'm improving the rocket.", persona: "APEX" },
      { text: "I'm already in the rocket.", persona: "AVIVA" },
    ],
  },
  {
    id: 2,
    title: "₹10 Crore. One Catch.",
    prompt: "You wake up tomorrow with ₹10 crore. But you can never earn another rupee.",
    options: [
      { text: "Turn ₹10 crore into ₹100 crore.", persona: "APEX" },
      { text: "Start the thing I've always been scared to start.", persona: "AVIVA" },
      { text: "Figure out what actually matters first.", persona: "CAPELLA" },
    ],
  },
  {
    id: 3,
    title: "No Bridge",
    prompt: `You're standing at the edge of a cliff. Your friend says: "The other side is everything you've ever wanted." There's no bridge.`,
    options: [
      { text: "Build the damn bridge.", persona: "APEX" },
      { text: "Find another way across.", persona: "CAPELLA" },
      { text: "Jump. We'll figure it out.", persona: "AVIVA" },
    ],
  },
  {
    id: 4,
    title: "The Button",
    prompt: "You're given a button. It says: PRESS TO CHANGE YOUR LIFE. Results may vary.",
    options: [
      { text: "Read the fine print.", persona: "CAPELLA" },
      { text: "Press it. Obviously.", persona: "AVIVA" },
      { text: "Press it twice.", persona: "APEX" },
    ],
  },
  {
    id: 5,
    title: "The Top",
    prompt: `You finally reach the top. Someone asks: "Now what?"`,
    options: [
      { text: "Look back at how I got here.", persona: "CAPELLA" },
      { text: "Find another beginning.", persona: "AVIVA" },
      { text: "Find a higher top.", persona: "APEX" },
    ],
  },
  {
    id: 6,
    title: "The GPS",
    prompt: `Your GPS says: "Turn left." The road ends in 4 km.`,
    options: [
      { text: "I'm taking the road anyway.", persona: "APEX" },
      { text: "Let's see what happens.", persona: "AVIVA" },
      { text: "Recalculate.", persona: "CAPELLA" },
    ],
  },
  {
    id: 7,
    title: "Restart Button",
    prompt: "You can restart your life at 18. But you lose everything you've built so far.",
    options: [
      { text: "No restart. I'll build something better from here.", persona: "APEX" },
      { text: "I'd want to know what I'm walking away from.", persona: "CAPELLA" },
      { text: "Deal.", persona: "AVIVA" },
    ],
  },
  {
    id: 8,
    title: "The Mystery Suitcase",
    prompt:
      "A stranger offers you a suitcase. Inside: ₹1 crore + one mystery. You can never open the suitcase before accepting.",
    options: [
      { text: "What's the mystery?", persona: "CAPELLA" },
      { text: "Hand it over.", persona: "APEX" },
      { text: "Take it. Solve the mystery later.", persona: "AVIVA" },
    ],
  },
  {
    id: 9,
    title: "Start From Zero",
    prompt: "You're offered your dream life. There's only one problem: you have to start from zero tomorrow.",
    options: [
      { text: "What's waiting for me at zero?", persona: "CAPELLA" },
      { text: "Where do I sign?", persona: "AVIVA" },
      { text: "Zero sounds like a good starting point.", persona: "APEX" },
    ],
  },
  {
    id: 10,
    title: "Now What?",
    prompt: `You finally reach the top. Someone asks: "Now what?"`,
    options: [
      { text: "Find another beginning.", persona: "AVIVA" },
      { text: "Look back at how I got here.", persona: "CAPELLA" },
      { text: "Find a higher top.", persona: "APEX" },
    ],
  },
  {
    id: 11,
    title: "The Wrong Train",
    prompt: "You realise you've been on the wrong train for 3 hours. It has no return route.",
    options: [
      { text: "Find out where this train actually goes.", persona: "APEX" },
      { text: "Get off at the next stop and figure it out.", persona: "AVIVA" },
      { text: "Maybe there's a reason I'm on this train.", persona: "CAPELLA" },
    ],
  },
  {
    id: 12,
    title: "The Billionaire Deal",
    prompt: "A billionaire offers you your dream job. You have zero experience.",
    options: [
      { text: "What happens if I fail?", persona: "CAPELLA" },
      { text: "What can this become?", persona: "APEX" },
      { text: "Tell me when I start.", persona: "AVIVA" },
    ],
  },
  {
    id: 13,
    title: "One Door",
    prompt:
      "Three doors. One leads to money. One leads to meaning. One leads to the unknown. You can only open one.",
    options: [
      { text: "Money.", persona: "APEX" },
      { text: "The unknown.", persona: "AVIVA" },
      { text: "Meaning.", persona: "CAPELLA" },
    ],
  },
  {
    id: 14,
    title: "Delete Button",
    prompt: "You can erase one regret from your life. But you'll also erase the lesson it taught you.",
    options: [
      { text: "Keep it. I'll make sure it wasn't wasted.", persona: "APEX" },
      { text: "Erase it. Some lessons aren't worth the pain.", persona: "AVIVA" },
      { text: "Keep it. It's part of the story.", persona: "CAPELLA" },
    ],
  },
  {
    id: 15,
    title: "The Unmarked Door",
    prompt:
      `You find a door in your house you've never seen before. No handle. No keyhole. Just a message: "You weren't supposed to find this yet." What do you do?`,
    options: [
      { text: "Figure out why it exists first.", persona: "CAPELLA" },
      { text: "Find a way to open it.", persona: "AVIVA" },
      { text: "Make a handle.", persona: "APEX" },
    ],
  },
  {
    id: 16,
    title: "2:17 AM",
    prompt: `At 2:17 AM, you get a text from an unknown number: "Your future is 11 minutes away. Come outside."`,
    options: [
      { text: "Ask what happens if I don't.", persona: "CAPELLA" },
      { text: "I'm already putting my shoes on.", persona: "AVIVA" },
      { text: "Give me 11 minutes. I'm bringing a plan.", persona: "APEX" },
    ],
  },
  {
    id: 17,
    title: "Floor -1",
    prompt:
      "You notice a new button in the elevator: FLOOR -1. This floor does not exist. You press it.",
    options: [
      { text: "Step out immediately.", persona: "AVIVA" },
      { text: "Ask the elevator where it thinks it's going.", persona: "CAPELLA" },
      { text: "See how far down this thing goes.", persona: "APEX" },
    ],
  },
  {
    id: 18,
    title: "The Impossible Bet",
    prompt:
      `Someone offers you a bet: "Give me one year of your life. In return, I'll give you one chance at the life you've always wanted."`,
    options: [
      { text: "What exactly am I risking?", persona: "CAPELLA" },
      { text: "Deal.", persona: "AVIVA" },
      { text: "One chance? I'll make it count.", persona: "APEX" },
    ],
  },
  {
    id: 19,
    title: "The Coin",
    prompt:
      "You find an old coin on the ground. One side says PLAY IT SAFE. The other says SEE WHAT HAPPENS. You can only flip it once.",
    options: [
      { text: "Flip it.", persona: "AVIVA" },
      { text: "Keep the coin. I'll make my own decision.", persona: "APEX" },
      { text: "Study the coin first. Something feels off.", persona: "CAPELLA" },
    ],
  },
  {
    id: 20,
    title: "The Empty Canvas",
    prompt: `Someone gives you an empty canvas and says: "You have one year. Make something people remember."`,
    options: [
      { text: "Make something impossible to ignore.", persona: "APEX" },
      { text: "Start painting.", persona: "AVIVA" },
      { text: "Figure out what I actually want to say.", persona: "CAPELLA" },
    ],
  },
  {
    id: 21,
    title: "The Fortune Cookie",
    prompt: `Your fortune cookie says: "You're closer than you think." Closer to what?`,
    options: [
      { text: "Whatever it is, I'm going further.", persona: "APEX" },
      { text: "I need to know.", persona: "AVIVA" },
      { text: "Doesn't matter. Keep moving.", persona: "CAPELLA" },
    ],
  },
  {
    id: 22,
    title: "The Island",
    prompt: "You wake up on an island. No phone. No map. One backpack.",
    options: [
      { text: "Find the highest point.", persona: "APEX" },
      { text: "Start exploring.", persona: "AVIVA" },
      { text: "Figure out where I am first.", persona: "CAPELLA" },
    ],
  },
  {
    id: 23,
    title: "The Impossible Job",
    prompt: "Your dream company calls. They offer you a position that doesn't exist yet. They want you to create it.",
    options: [
      { text: "What problem am I solving?", persona: "CAPELLA" },
      { text: "Tell me when I start.", persona: "AVIVA" },
      { text: "What can this become?", persona: "APEX" },
    ],
  },
  {
    id: 24,
    title: "The Last Seat",
    prompt: "There's one seat left on a plane leaving for a city you've never visited. You have 60 seconds to decide.",
    options: [
      { text: "What happens when I land?", persona: "APEX" },
      { text: "I'm going.", persona: "AVIVA" },
      { text: "Where's the plane going?", persona: "CAPELLA" },
    ],
  },
  {
    id: 25,
    title: "The Mountain",
    prompt: `You're halfway up a mountain. Someone tells you: "The view isn't worth it."`,
    options: [
      { text: "Maybe they're right. Maybe they're wrong.", persona: "AVIVA" },
      { text: "I'll decide when I reach the top.", persona: "APEX" },
      { text: "I'm already halfway there.", persona: "CAPELLA" },
    ],
  },
  {
    id: 26,
    title: "The Time Machine",
    prompt: "You get a time machine. You can only go: 10 years back OR 10 years forward.",
    options: [
      { text: "Neither. The next ten years are mine to build.", persona: "APEX" },
      { text: "Forward. I want to see what's possible.", persona: "AVIVA" },
      { text: "Back. There's something I need to understand.", persona: "CAPELLA" },
    ],
  },
  {
    id: 27,
    title: "The Key",
    prompt:
      `You find a key in your pocket. No idea where it came from. A note attached says: "You'll know when you find the door."`,
    options: [
      { text: "Start looking for the door.", persona: "AVIVA" },
      { text: "Find out where the key came from first.", persona: "CAPELLA" },
      { text: "If there's no door, I'll build one.", persona: "APEX" },
    ],
  },
  {
    id: 28,
    title: "The Impossible Choice",
    prompt: "You can guarantee success at something ordinary. Or take a 10% chance at something extraordinary.",
    options: [
      { text: "I'll take the guaranteed win and use it to build something extraordinary.", persona: "APEX" },
      { text: "Give me the 10%.", persona: "AVIVA" },
      { text: "What makes the extraordinary worth it?", persona: "CAPELLA" },
    ],
  },
  {
    id: 29,
    title: "The Message",
    prompt: `Your future self appears for exactly 10 seconds. Before disappearing, they say: "Don't take the easy road." You get one question.`,
    options: [
      { text: `"Where does the hard road lead?"`, persona: "APEX" },
      { text: `"Why not?"`, persona: "AVIVA" },
      { text: `"What am I missing?"`, persona: "CAPELLA" },
    ],
  },
  {
    id: 30,
    title: "The Last Question",
    prompt: `You've lived your entire life. You get one message from your future self: "You were capable of much more." What do you do?`,
    options: [
      { text: "Ask what I was supposed to understand.", persona: "CAPELLA" },
      { text: "Good. Then I'm not finished.", persona: "APEX" },
      { text: "Find out what I haven't started yet.", persona: "AVIVA" },
    ],
  },
];
