import {
  Briefcase,
  Brush,
  Car,
  Dog,
  Dumbbell,
  Heart,
  Laptop,
  Scissors,
  Search,
  Shield,
  Smartphone,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Pick a service-themed icon from the service name.
 *
 * Keyword-based — fast, no DB lookup, no dependency on category presence.
 * If nothing matches, fall back to the generic Briefcase.
 */
export function iconForService(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/(clean|maint|janitor|wash)/.test(n)) return Brush;
  if (/(install|setup|wrench|plumb|electric|fix)/.test(n)) return Wrench;
  if (/(prevent|special|secur|protect|shield)/.test(n)) return Shield;
  if (/(inspect|check|exam|diagnos|repair)/.test(n)) return Search;
  if (/(hair|cut|color|barber|salon)/.test(n)) return Scissors;
  if (/(spa|massage|sauna|wellness|relax)/.test(n)) return Sparkles;
  if (/(car|auto|tire|detailing)/.test(n)) return Car;
  if (/(gym|fitness|train|yoga|workout)/.test(n)) return Dumbbell;
  if (/(pet|groom|vet|dog|cat)/.test(n)) return Dog;
  if (/(phone|mobile)/.test(n)) return Smartphone;
  if (/(laptop|computer|pc)/.test(n)) return Laptop;
  if (/(love|partner|couple)/.test(n)) return Heart;
  return Briefcase;
}
