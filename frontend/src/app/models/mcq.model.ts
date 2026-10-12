export interface BamsQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number; // 0, 1, 2, or 3
  isHighPriority: boolean;     // Main priority / high-yield questions allowed to repeat
  subject: string;             // e.g., 'Charaka Samhita', 'Sushruta Samhita', 'Dravyaguna', 'Rasa Shastra', 'Roganidana', 'Shalya Tantra'
  sthana?: string;             // e.g., 'Sutra Sthana', 'Sharira Sthana', 'Chikitsa Sthana', 'Uttaratantra'
  reference: string;           // e.g., 'Charaka Sutra 1/42', 'Sushruta Sharira 5/18'
  explanation: string;         // Detailed Ayurvedic explanation and reasoning
  yearOrExam?: string;         // e.g., 'AIAPGET 2023', 'NIA PG 2022', 'BHU Entrance'
}

export interface UserAnswer {
  selectedOption: number | null;
  markedForReview: boolean;
  timeSpentSeconds: number;
}

export interface SubjectStats {
  subject: string;
  total: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}

export interface McqTestResult {
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  markedForReviewCount: number;
  score: number;             // +4 for correct, -1 for incorrect
  maxScore: number;          // total * 4
  percentage: number;
  timeTakenSeconds: number;
  subjectBreakdown: SubjectStats[];
}
