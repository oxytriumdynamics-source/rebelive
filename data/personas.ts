import { Persona } from "./questions";

export type PersonaTheme = {
  bgClass: string;
  textPrimary: string;
  textSub: string;
  accentText: string;
  textBody: string;
  borderClass: string;
  panelClass: string;
  buttonBg: string;
  buttonText: string;
  logoTone: "dark" | "light";
  winnerHighlight: string;
};

export type PersonaProfile = {
  id: Persona;
  name: string;
  title: string;
  cardSubtitle: string;
  tagline: string;
  description: string;
  coordinate: string;
  bg: "dark" | "light";
  motif: "topo" | "constellation" | "pulse" | "cherry";
  frontImage: string;
  fontFamily: string;
  backQuote1: string;
  backQuote2: string;
  privilegeHeader: string;
  privilegeCases: string;
  formula: string;
  issuedText: string;
  fuelTagline: string;
  theme: PersonaTheme;
};

export const PERSONAS: Record<Persona, PersonaProfile> = {
  APEX: {
    id: "APEX",
    name: "APEX",
    title: "The Summit Chaser",
    cardSubtitle: "ASCEND",
    tagline: "You are Built to climb. Driven to go further.",
    description:
      "You are Built to climb. Driven to go further. The peak isn't the end. It's proof you can go higher.",
    coordinate: "27°59'17\"N 86°55'31\"E",
    bg: "dark",
    motif: "topo",
    frontImage: "/brand/APEX.png",
    fontFamily: "var(--font-apex)",
    backQuote1: "You are Built to climb. Driven to go further.",
    backQuote2: "The peak isn't the end. It's proof you can go higher.",
    privilegeHeader: "PRIVILEGES:",
    privilegeCases: "N CASES OF APEX / YEAR",
    formula: "N = 0, 1, 2, 3, … 8,848",
    issuedText: "ISSUED: DD.MM.YYYY",
    fuelTagline: "Your journey comes with its own fuel.",
    theme: {
      bgClass: "bg-[#0a0a0a]",
      textPrimary: "text-white",
      textSub: "text-white/50",
      accentText: "text-white/70",
      textBody: "text-white/65",
      borderClass: "border-white/10",
      panelClass: "bg-white/[0.04]",
      buttonBg: "bg-white",
      buttonText: "text-[#0a0a0a]",
      logoTone: "dark",
      winnerHighlight: "text-white",
    },
  },
  CAPELLA: {
    id: "CAPELLA",
    name: "CAPELLA",
    title: "The Signal Reader",
    cardSubtitle: "NAVIGATOR",
    tagline: "Some paths aren't meant to be understood all at once.",
    description:
      "Some paths aren't meant to be understood all at once. Keep moving. One day, it will all make sense.",
    coordinate: "RA 05h 16m 41.4s | Dec +45° 59' 53\"",
    bg: "light",
    motif: "constellation",
    frontImage: "/brand/Capella.png",
    fontFamily: "var(--font-capella)",
    backQuote1: "Some paths aren't meant to be understood all at once.",
    backQuote2: "Keep moving. One day, it will all make sense.",
    privilegeHeader: "PRIVILEGES:",
    privilegeCases: "N CASES OF CAPELLA / YEAR",
    formula: "N = 0, 1, 2, 3, … 8,848",
    issuedText: "ISSUED: DD.MM.YYYY",
    fuelTagline: "Your journey comes with its own fuel.",
    theme: {
      bgClass: "bg-[#f7f7f5]",
      textPrimary: "text-[#111110]",
      textSub: "text-[#111110]/45",
      accentText: "text-[#c8922a]",
      textBody: "text-[#111110]/70",
      borderClass: "border-[#111110]/10",
      panelClass: "bg-black/[0.03]",
      buttonBg: "bg-[#111110]",
      buttonText: "text-white",
      logoTone: "light",
      winnerHighlight: "text-[#c8922a]",
    },
  },
  AVIVA: {
    id: "AVIVA",
    name: "AVIVA",
    title: "The Live Wire",
    cardSubtitle: "CATALYST",
    tagline: "Every new chapter begins with a decision.",
    description:
      "Every new chapter begins with a decision. Take the leap. The rest comes after.",
    coordinate: "35°30'04.3\"N, 138°48'05.0\"E",
    bg: "light",
    motif: "cherry",
    frontImage: "/brand/Aviva.png",
    fontFamily: "var(--font-aviva)",
    backQuote1: "Every new chapter begins with a decision.",
    backQuote2: "Take the leap. The rest comes after.",
    privilegeHeader: "PRIVILEGES:",
    privilegeCases: "N CASES OF AVIVA / YEAR",
    formula: "N = 0, 1, 2, 3, … 8,848",
    issuedText: "ISSUED: DD.MM.YYYY",
    fuelTagline: "Your journey comes with its own fuel.",
    theme: {
      bgClass: "bg-white",
      textPrimary: "text-[#111110]",
      textSub: "text-[#111110]/45",
      accentText: "text-[#e8628a]",
      textBody: "text-[#111110]/70",
      borderClass: "border-[#111110]/10",
      panelClass: "bg-black/[0.02]",
      buttonBg: "bg-[#111110]",
      buttonText: "text-white",
      logoTone: "light",
      winnerHighlight: "text-[#e8628a]",
    },
  },
};
