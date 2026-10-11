import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  KNode, KNodeTree, Breadcrumb, SearchResult, OcrResult, NodeImage,
  CreateNodeRequest, UpdateNodeRequest, ReorderItem
} from '../models/node.model';

@Injectable({ providedIn: 'root' })
export class NodeService {
  constructor(private http: HttpClient) {}

  public get apiUrl(): string {
    // 1. Check user-configured override in localStorage (useful for hosted GitHub Pages)
    if (typeof window !== 'undefined' && window.localStorage) {
      const customUrl = window.localStorage.getItem('topiks_api_url');
      if (customUrl && customUrl.trim()) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    }

    // 2. Check window runtime injection
    if (typeof window !== 'undefined' && (window as any).__TOPIKS_API_URL__) {
      return (window as any).__TOPIKS_API_URL__.replace(/\/+$/, '');
    }

    // 3. Check environment configuration (production build)
    if (environment && environment.apiUrl && environment.apiUrl.trim()) {
      return environment.apiUrl.trim().replace(/\/+$/, '');
    }

    // 4. Fallback to same host on port 5000 (local dev / Docker)
    if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost') {
      // If hosted on GitHub Pages or custom domain without configured API
      if (window.location.hostname.endsWith('github.io') || window.location.hostname.endsWith('pages.dev')) {
        return 'http://localhost:5000/api';
      }
      return `http://${window.location.hostname}:5000/api`;
    }
    return 'http://localhost:5000/api';
  }

  public setCustomApiUrl(url: string | null): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (url && url.trim()) {
        window.localStorage.setItem('topiks_api_url', url.trim());
      } else {
        window.localStorage.removeItem('topiks_api_url');
      }
    }
  }

  private getNoCacheOptions(extraParams?: Record<string, string>): { headers: HttpHeaders; params: HttpParams } {
    let params = new HttpParams().set('_t', Date.now().toString());
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params = params.set(key, value);
      }
    }
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    return { headers, params };
  }

  // ── Nodes ────────────────────────────────────────────

  getRootNodes(): Observable<KNode[]> {
    return this.http.get<KNode[]>(`${this.apiUrl}/nodes/root`, this.getNoCacheOptions());
  }

  getNode(id: string): Observable<KNode> {
    return this.http.get<KNode>(`${this.apiUrl}/nodes/${id}`, this.getNoCacheOptions());
  }

  getChildren(parentId: string): Observable<KNode[]> {
    return this.http.get<KNode[]>(`${this.apiUrl}/nodes/${parentId}/children`, this.getNoCacheOptions());
  }

  getTree(id: string): Observable<KNodeTree> {
    return this.http.get<KNodeTree>(`${this.apiUrl}/nodes/${id}/tree`, this.getNoCacheOptions());
  }

  getFullTree(): Observable<KNodeTree[]> {
    return this.http.get<KNodeTree[]>(`${this.apiUrl}/nodes/tree`, this.getNoCacheOptions());
  }

  getBreadcrumbs(id: string): Observable<Breadcrumb[]> {
    return this.http.get<Breadcrumb[]>(`${this.apiUrl}/nodes/${id}/breadcrumbs`, this.getNoCacheOptions());
  }

  getFavorites(): Observable<KNode[]> {
    return this.http.get<KNode[]>(`${this.apiUrl}/nodes/favorites`, this.getNoCacheOptions());
  }

  createNode(request: CreateNodeRequest): Observable<KNode> {
    return this.http.post<KNode>(`${this.apiUrl}/nodes`, request);
  }

  updateNode(id: string, request: UpdateNodeRequest): Observable<KNode> {
    return this.http.put<KNode>(`${this.apiUrl}/nodes/${id}`, request);
  }

  deleteNode(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/nodes/${id}`);
  }

  clearAllNodes(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/nodes/all`);
  }

  reorderNodes(items: ReorderItem[]): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/nodes/reorder`, { items });
  }

  moveNode(id: string, newParentId: string | null): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/nodes/${id}/move`, { newParentId });
  }

  // ── Search ───────────────────────────────────────────

  search(query: string): Observable<SearchResult[]> {
    return this.http.get<SearchResult[]>(`${this.apiUrl}/search`, this.getNoCacheOptions({ q: query }));
  }

  // ── Images & Attachments ──────────────────────────────
  getNodeImages(nodeId: string): Observable<NodeImage[]> {
    return this.http.get<NodeImage[]>(`${this.apiUrl}/nodes/${nodeId}/images`, this.getNoCacheOptions());
  }

  uploadNodeImage(nodeId: string, file: File): Observable<NodeImage> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<NodeImage>(`${this.apiUrl}/nodes/${nodeId}/images`, formData);
  }

  deleteImage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/images/${id}`);
  }

  // ── OCR ──────────────────────────────────────────────

  uploadOcr(nodeId: string, file: File, extractedText?: string): Observable<OcrResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (extractedText) {
      formData.append('extractedText', extractedText);
    }
    return this.http.post<OcrResult>(`${this.apiUrl}/nodes/${nodeId}/ocr`, formData);
  }

  getOcrHistory(nodeId: string): Observable<OcrResult[]> {
    return this.http.get<OcrResult[]>(`${this.apiUrl}/nodes/${nodeId}/ocr/history`, this.getNoCacheOptions());
  }
}
