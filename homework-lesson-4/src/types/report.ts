export interface ReportSection {
  title: string;
  content: string;
}

export interface ResearchReport {
  topic: string;
  summary: string;
  sections: ReportSection[];
  sources: string[];
}
