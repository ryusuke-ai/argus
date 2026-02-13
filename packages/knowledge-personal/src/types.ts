export interface NoteEntry {
  path: string; // relative to data/ (e.g. "personality/value.md")
  category: string; // top-level directory (e.g. "personality")
  name: string; // filename without extension
  content: string;
}

export interface SearchResult {
  path: string;
  name: string;
  matches: MatchLine[];
}

export interface MatchLine {
  line: number;
  text: string;
  context: string[]; // surrounding lines
}

export type PersonalitySection =
  | "values"
  | "strengths"
  | "weaknesses"
  | "habits"
  | "thinking"
  | "likes"
  | "dislikes";

export interface PersonalService {
  search(query: string): Promise<SearchResult[]>;
  read(path: string): Promise<NoteEntry>;
  list(
    category?: string,
  ): Promise<{ path: string; name: string; category: string }[]>;
  getPersonalityContext(section?: PersonalitySection): Promise<string>;
  add(category: string, name: string, content: string): Promise<NoteEntry>;
  update(
    path: string,
    content: string,
    mode: "append" | "replace",
  ): Promise<NoteEntry>;
}
