export type ScrapeResult = {
  url: string;
  title: string | null;
  description: string | null;
  logoUrl: string | null;
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
};
