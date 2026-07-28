export type PostAuthor = {
  id: string;
  alias: string;
  helpful_score?: number;
};

export type Post = {
  id: string;
  author: PostAuthor;
  title: string;
  content: string;
  mood: string;
  audience: string;
  created_at: string;
  reactions: Record<string, number>;
  reaction_total: number;
  my_reaction: string | null;
  comment_count: number;
  pulse_options?: string[] | null;
  pulse_votes?: number[] | null;
  my_pulse_vote?: number | null;
  images?: string[];
  is_bookmarked?: boolean;
  bookmark_count?: number;
};

