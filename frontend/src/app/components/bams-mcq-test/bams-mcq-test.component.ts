import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { McqService, TestGenerationResult } from '../../services/mcq.service';
import { BamsQuestion, UserAnswer, McqTestResult, SubjectStats } from '../../models/mcq.model';

@Component({
  selector: 'app-bams-mcq-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bams-mcq-test.component.html',
  styleUrls: ['./bams-mcq-test.component.scss']
})
export class BamsMcqTestComponent implements OnInit, OnDestroy {
  @Output() exit = new EventEmitter<void>();

  // View state
  viewState: 'lobby' | 'exam' | 'result' = 'lobby';
  isLoading = false;
  errorMessage = '';

  // Lobby Statistics & Settings
  totalPoolCount = 0;
  highPriorityPoolCount = 0;
  unattemptedNormalCount = 0;
  testCount = 0;
  selectedTimerMinutes = 20; // 15, 20, 30, 0 (untimed)
  customUrl = '';
  showSettings = false;

  // Active Exam State
  questions: BamsQuestion[] = [];
  currentIndex = 0;
  userAnswers: { [qId: string]: UserAnswer } = {};
  timeRemainingSeconds = 0;
  private timerInterval: any = null;
  timeSpentTotalSeconds = 0;

  // Exam UI State
  showSubmitModal = false;
  isPaletteOpenMobile = false;
  cycleResetHappened = false;

  // Results & Analytics
  testResult: McqTestResult | null = null;
  reviewFilter: 'all' | 'incorrect' | 'marked' = 'all';

  constructor(public mcqService: McqService) {}

  ngOnInit(): void {
    this.customUrl = this.mcqService.getActiveSourceUrl();
    this.loadLobbyStats();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  loadLobbyStats(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.mcqService.fetchAllQuestions().subscribe({
      next: (all) => {
        this.totalPoolCount = all.length;
        this.highPriorityPoolCount = all.filter(q => q.isHighPriority).length;
        const attempted = this.mcqService.getAttemptedIds();
        const normalPool = all.filter(q => !q.isHighPriority);
        this.unattemptedNormalCount = normalPool.filter(q => !attempted.includes(q.id)).length;
        this.testCount = this.mcqService.getTestCount();
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'Could not load questions. Check your internet connection or URL.';
        this.isLoading = false;
      }
    });
  }

  saveSourceUrl(): void {
    this.mcqService.setCustomSourceUrl(this.customUrl.trim() || null);
    this.loadLobbyStats();
    this.showSettings = false;
  }

  resetSourceUrlToDefault(): void {
    this.mcqService.setCustomSourceUrl(null);
    this.customUrl = this.mcqService.getActiveSourceUrl();
    this.loadLobbyStats();
    this.showSettings = false;
  }

  // --- Start Exam ---
  startTest(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Request 20 questions, 7 high-priority (repeatable), 13 fresh (non-repeatable)
    this.mcqService.generateTest(20, 7).subscribe({
      next: (res: TestGenerationResult) => {
        this.questions = res.questions;
        this.cycleResetHappened = res.cycleReset;
        this.currentIndex = 0;
        this.userAnswers = {};

        // Initialize answer objects
        this.questions.forEach(q => {
          this.userAnswers[q.id] = {
            selectedOption: null,
            markedForReview: false,
            timeSpentSeconds: 0
          };
        });

        // Initialize Timer
        this.timeSpentTotalSeconds = 0;
        if (this.selectedTimerMinutes > 0) {
          this.timeRemainingSeconds = this.selectedTimerMinutes * 60;
          this.startTimer();
        } else {
          this.timeRemainingSeconds = -1; // untimed
        }

        this.viewState = 'exam';
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'Failed to generate test. Please try again.';
        this.isLoading = false;
      }
    });
  }

  startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.timeRemainingSeconds > 0) {
        this.timeRemainingSeconds--;
        this.timeSpentTotalSeconds++;
      } else {
        // Time expired! Auto submit exam
        this.stopTimer();
        this.submitExam(true);
      }
    }, 1000);
  }

  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  get currentQuestion(): BamsQuestion | null {
    return this.questions[this.currentIndex] || null;
  }

  get formattedTime(): string {
    if (this.timeRemainingSeconds < 0) return 'Untimed';
    const mins = Math.floor(this.timeRemainingSeconds / 60);
    const secs = this.timeRemainingSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Question Interactions ---
  selectOption(optionIndex: number): void {
    if (!this.currentQuestion) return;
    this.userAnswers[this.currentQuestion.id].selectedOption = optionIndex;
  }

  toggleMarkForReview(): void {
    if (!this.currentQuestion) return;
    const ans = this.userAnswers[this.currentQuestion.id];
    ans.markedForReview = !ans.markedForReview;
  }

  clearCurrentResponse(): void {
    if (!this.currentQuestion) return;
    this.userAnswers[this.currentQuestion.id].selectedOption = null;
  }

  goToQuestion(index: number): void {
    if (index >= 0 && index < this.questions.length) {
      this.currentIndex = index;
      this.isPaletteOpenMobile = false;
    }
  }

  nextQuestion(): void {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
    }
  }

  prevQuestion(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
  }

  // --- Palette Status Helpers ---
  getQuestionStatus(index: number): 'answered' | 'marked' | 'unattempted' {
    const q = this.questions[index];
    if (!q) return 'unattempted';
    const ans = this.userAnswers[q.id];
    if (!ans) return 'unattempted';
    if (ans.markedForReview) return 'marked';
    if (ans.selectedOption !== null) return 'answered';
    return 'unattempted';
  }

  get answeredCount(): number {
    return Object.values(this.userAnswers).filter(a => a.selectedOption !== null).length;
  }

  get markedCount(): number {
    return Object.values(this.userAnswers).filter(a => a.markedForReview).length;
  }

  get unattemptedCount(): number {
    return this.questions.length - this.answeredCount;
  }

  // --- Exam Submission & Evaluation ---
  submitExam(isAutoSubmit = false): void {
    this.stopTimer();
    this.showSubmitModal = false;

    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let marked = 0;
    const subjectMap: { [sub: string]: SubjectStats } = {};

    this.questions.forEach(q => {
      // Subject tracking
      if (!subjectMap[q.subject]) {
        subjectMap[q.subject] = {
          subject: q.subject,
          total: 0,
          correct: 0,
          incorrect: 0,
          unattempted: 0
        };
      }
      subjectMap[q.subject].total++;

      const ans = this.userAnswers[q.id];
      if (ans.markedForReview) marked++;

      if (ans.selectedOption === null) {
        unattempted++;
        subjectMap[q.subject].unattempted++;
      } else if (ans.selectedOption === q.correctAnswerIndex) {
        correct++;
        subjectMap[q.subject].correct++;
      } else {
        incorrect++;
        subjectMap[q.subject].incorrect++;
      }
    });

    // AIAPGET Scoring Standard: +4 for correct, -1 for wrong, 0 for skipped
    const score = (correct * 4) - (incorrect * 1);
    const maxScore = this.questions.length * 4;
    const percentage = Math.max(0, Math.round((score / maxScore) * 100));

    this.testResult = {
      totalQuestions: this.questions.length,
      attemptedCount: correct + incorrect,
      correctCount: correct,
      incorrectCount: incorrect,
      unattemptedCount: unattempted,
      markedForReviewCount: marked,
      score,
      maxScore,
      percentage,
      timeTakenSeconds: this.timeSpentTotalSeconds,
      subjectBreakdown: Object.values(subjectMap)
    };

    this.viewState = 'result';
  }

  // --- Result View Helpers ---
  get filteredQuestions(): BamsQuestion[] {
    if (this.reviewFilter === 'incorrect') {
      return this.questions.filter(q => {
        const ans = this.userAnswers[q.id];
        return ans.selectedOption !== null && ans.selectedOption !== q.correctAnswerIndex;
      });
    }
    if (this.reviewFilter === 'marked') {
      return this.questions.filter(q => this.userAnswers[q.id]?.markedForReview);
    }
    return this.questions;
  }

  isUserCorrect(question: BamsQuestion): boolean {
    const ans = this.userAnswers[question.id];
    return ans?.selectedOption === question.correctAnswerIndex;
  }

  getUserSelectedOption(question: BamsQuestion): number | null {
    return this.userAnswers[question.id]?.selectedOption ?? null;
  }

  retakeNewTest(): void {
    this.viewState = 'lobby';
    this.loadLobbyStats();
    this.startTest();
  }

  resetAllAttempts(): void {
    if (confirm('Are you sure you want to reset your question history? All questions will become unattempted again.')) {
      this.mcqService.resetAllHistory();
      this.loadLobbyStats();
    }
  }

  backToLobby(): void {
    this.stopTimer();
    this.viewState = 'lobby';
    this.loadLobbyStats();
  }

  closeMcq(): void {
    this.stopTimer();
    this.exit.emit();
  }

  formatSeconds(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }
}
