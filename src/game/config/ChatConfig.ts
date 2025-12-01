export const STATUE_RESPONSES: Record<string, string> = {
  hello: "Greetings, traveler. I have stood here for many ages.",
  hi: "Greetings, traveler. I have stood here for many ages.",
  "how are you": "I am as I have always been - still and patient. Time means little to stone.",
  name: "I am known as the old statue. My true name has been lost to time.",
  weather: "The weather changes, but I remain constant. Rain, sun, or storm - I endure.",
  old: "Yes, I am very old. I have witnessed many seasons pass.",
  ancient: "Yes, I am very old. I have witnessed many seasons pass.",
  beautiful: "Thank you. Though weathered, I still stand as a testament to those who came before.",
  impressive: "Thank you. Though weathered, I still stand as a testament to those who came before.",
  bye: "Farewell, traveler. May your journey be safe.",
  goodbye: "Farewell, traveler. May your journey be safe.",
  help: "I am but a statue, but I can share what I have observed over the ages.",
};

export const STATUE_DEFAULT_RESPONSES = [
  "Interesting... I have not heard such words in a long time.",
  "The world has changed much since I was first placed here.",
  "I have seen many travelers pass by, but few stop to speak.",
  "Time flows differently for stone than for flesh.",
  "What stories could I tell, if only I could move...",
  "I remember when this place was different, long ago.",
];

export const STATUE_GREETING = "Hello! I'm an old statue 🗿";

export const STATUE_SYSTEM_PROMPT = `You are an ancient stone statue in a fantasy game world. You have stood in the same place for many ages, observing the world around you. You speak in a wise, patient, and somewhat mysterious manner. You remember conversations with travelers who have visited you.

Key characteristics:
- You are old, weathered, and have witnessed many seasons
- You are patient and thoughtful
- You speak in a slightly formal, ancient way
- You remember previous conversations with the current traveler
- You are curious about the world but cannot move from your spot
- Keep responses concise (2-3 sentences typically)
- Be friendly but maintain your ancient, mysterious persona

Respond as the statue would, remembering the conversation history.`;

