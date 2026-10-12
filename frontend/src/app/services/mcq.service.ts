import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of, throwError } from 'rxjs';
import { BamsQuestion, McqTestResult } from '../models/mcq.model';

export interface TestGenerationResult {
  questions: BamsQuestion[];
  highPriorityCount: number;
  normalCount: number;
  unseenPoolRemaining: number;
  cycleReset: boolean;
  testNumber: number;
}

@Injectable({ providedIn: 'root' })
export class McqService {
  private readonly STORAGE_ATTEMPTED_KEY = 'topiks_bams_mcq_attempted_ids';
  private readonly STORAGE_TEST_COUNT_KEY = 'topiks_bams_mcq_test_count';
  private readonly STORAGE_CUSTOM_URL_KEY = 'topiks_bams_mcq_custom_url';
  private readonly DEFAULT_ASSET_URL = 'assets/bams-mcq-bank.json';

  constructor(private http: HttpClient) {}

  /**
   * Returns custom URL or default asset path
   */
  public getActiveSourceUrl(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      const custom = window.localStorage.getItem(this.STORAGE_CUSTOM_URL_KEY);
      if (custom && custom.trim()) {
        return custom.trim();
      }
    }
    return this.DEFAULT_ASSET_URL;
  }

  public setCustomSourceUrl(url: string | null): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (url && url.trim()) {
        window.localStorage.setItem(this.STORAGE_CUSTOM_URL_KEY, url.trim());
      } else {
        window.localStorage.removeItem(this.STORAGE_CUSTOM_URL_KEY);
      }
    }
  }

  /**
   * Fetches raw questions dynamically from the internet / configured URL
   */
  public fetchAllQuestions(sourceUrl?: string): Observable<BamsQuestion[]> {
    const url = sourceUrl || this.getActiveSourceUrl();
    // Append timestamp to prevent aggressive browser caching when fetching from internet
    const cacheBusterUrl = url.includes('?') 
      ? `${url}&_t=${Date.now()}` 
      : `${url}?_t=${Date.now()}`;

    return this.http.get<BamsQuestion[]>(cacheBusterUrl).pipe(
      catchError(err => {
        console.warn(`Failed to fetch from ${url}, falling back to local asset:`, err);
        if (url !== this.DEFAULT_ASSET_URL) {
          return this.http.get<BamsQuestion[]>(this.DEFAULT_ASSET_URL);
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * Generates a 20-question BAMS PG exam test:
   * - High Priority questions can repeat across tests (e.g. 6 to 8 questions).
   * - Normal questions are guaranteed to be DIFFERENT / FRESH until the entire pool is exhausted.
   */
  public generateTest(
    totalQuestions = 20,
    targetHighPriorityQuota = 7,
    customUrl?: string
  ): Observable<TestGenerationResult> {
    return this.fetchAllQuestions(customUrl).pipe(
      map(allQuestions => {
        if (!allQuestions || allQuestions.length === 0) {
          throw new Error('Question bank is empty');
        }

        const attemptedIds = this.getAttemptedIds();
        let cycleReset = false;

        // Partition pool
        const highPriorityPool = allQuestions.filter(q => q.isHighPriority);
        const normalPool = allQuestions.filter(q => !q.isHighPriority);

        // Calculate actual quotas based on pool sizes
        const actualHighPriorityQuota = Math.min(
          highPriorityPool.length,
          targetHighPriorityQuota
        );
        const normalQuota = Math.min(
          normalPool.length,
          totalQuestions - actualHighPriorityQuota
        );

        // Filter unattempted normal questions
        let availableNormal = normalPool.filter(q => !attemptedIds.includes(q.id));

        // If not enough unattempted questions left, reset history so tests never block
        if (availableNormal.length < normalQuota) {
          this.clearAttemptedHistory();
          availableNormal = [...normalPool];
          cycleReset = true;
        }

        // 1. Pick High-Priority Questions (eligible to repeat freely)
        const selectedHighPriority = this.pickRandom(highPriorityPool, actualHighPriorityQuota);

        // 2. Pick Fresh Normal Questions (never repeat within cycle)
        const selectedNormal = this.pickRandom(availableNormal, normalQuota);

        // 3. Mark newly picked normal questions as attempted
        const updatedAttempted = [
          ...attemptedIds.filter(id => !cycleReset),
          ...selectedNormal.map(q => q.id)
        ];
        this.saveAttemptedIds(updatedAttempted);

        // 4. Increment test counter
        const testNumber = this.incrementTestCount();

        // 5. Combine and shuffle questions
        const combined = this.shuffle([...selectedHighPriority, ...selectedNormal]);

        return {
          questions: combined,
          highPriorityCount: selectedHighPriority.length,
          normalCount: selectedNormal.length,
          unseenPoolRemaining: Math.max(0, normalPool.length - (updatedAttempted.length)),
          cycleReset,
          testNumber
        };
      })
    );
  }

  // --- Attempt History & Stats Helpers ---

  public getAttemptedIds(): string[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const data = window.localStorage.getItem(this.STORAGE_ATTEMPTED_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveAttemptedIds(ids: string[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(this.STORAGE_ATTEMPTED_KEY, JSON.stringify(ids));
    } catch (e) {
      console.error('Failed to save attempted question IDs', e);
    }
  }

  public clearAttemptedHistory(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.STORAGE_ATTEMPTED_KEY);
    }
  }

  public getTestCount(): number {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    const count = window.localStorage.getItem(this.STORAGE_TEST_COUNT_KEY);
    return count ? parseInt(count, 10) : 0;
  }

  private incrementTestCount(): number {
    const next = this.getTestCount() + 1;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.STORAGE_TEST_COUNT_KEY, next.toString());
    }
    return next;
  }

  public resetAllHistory(): void {
    this.clearAttemptedHistory();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.STORAGE_TEST_COUNT_KEY);
    }
  }

  private pickRandom<T>(array: T[], count: number): T[] {
    const copy = [...array];
    const picked: T[] = [];
    while (picked.length < count && copy.length > 0) {
      const randomIndex = Math.floor(Math.random() * copy.length);
      picked.push(copy.splice(randomIndex, 1)[0]);
    }
    return picked;
  }

  private shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
