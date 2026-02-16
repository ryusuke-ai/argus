export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface NoteEntry {
  path: string; // relative to data/ (e.g. "self/values.md")
  category: string; // top-level directory (e.g. "self")
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
  | "identity"
  | "values"
  | "strengths"
  | "thinking"
  | "preferences"
  | "routines";

export interface PersonalService {
  search(query: string): Promise<SearchResult[]>;
  read(path: string): Promise<Result<NoteEntry>>;
  list(
    category?: string,
  ): Promise<{ path: string; name: string; category: string }[]>;
  getPersonalityContext(section?: PersonalitySection): Promise<Result<string>>;
  add(
    category: string,
    name: string,
    content: string,
  ): Promise<Result<NoteEntry>>;
  update(
    path: string,
    content: string,
    mode: "append" | "replace",
  ): Promise<Result<NoteEntry>>;
}
