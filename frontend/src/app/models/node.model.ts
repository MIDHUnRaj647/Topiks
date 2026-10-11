export enum NodeType {
  Book = 'Book',
  Kaalam = 'Kaalam',
  Chapter = 'Chapter',
  Topic = 'Topic',
  Note = 'Note',
  Reference = 'Reference'
}

export enum Priority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High'
}

export interface KNode {
  id: string;
  parentId: string | null;
  name: string;
  nodeType: NodeType;
  priority: Priority | null;
  sortOrder: number;
  content: string | null;
  tags: string | null;
  isFavorite: boolean;
  hasChildren: boolean;
  childCount: number;
  createdOn: string;
  updatedOn: string;
}

export interface KNodeTree {
  id: string;
  parentId: string | null;
  name: string;
  nodeType: NodeType;
  priority: Priority | null;
  sortOrder: number;
  isFavorite: boolean;
  hasChildren: boolean;
  childCount: number;
  children: KNodeTree[];
}

export interface Breadcrumb {
  id: string;
  name: string;
  nodeType: NodeType;
}

export interface SearchResult {
  id: string;
  name: string;
  nodeType: NodeType;
  contentSnippet: string | null;
  matchSource: string;
  breadcrumbs: Breadcrumb[];
}

export interface OcrResult {
  importId: string;
  extractedText: string;
  imageFileName: string;
  imageUrl?: string;
  importedOn: string;
}

export interface NodeImage {
  id: string;
  nodeId: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  uploadedOn: string;
}

export interface CreateNodeRequest {
  parentId: string | null;
  name: string;
  nodeType: NodeType;
  priority?: Priority;
  content?: string;
  tags?: string;
}

export interface UpdateNodeRequest {
  name?: string;
  priority?: Priority;
  content?: string;
  tags?: string;
  isFavorite?: boolean;
}

export interface ReorderItem {
  id: string;
  sortOrder: number;
  newParentId?: string | null;
}

// Helper to get icon for node type
export function getNodeTypeIcon(type: NodeType): string {
  switch (type) {
    case NodeType.Book: return '📚';
    case NodeType.Kaalam: return '🏛️';
    case NodeType.Chapter: return '📖';
    case NodeType.Topic: return '📝';
    case NodeType.Note: return '📌';
    case NodeType.Reference: return '🔗';
    default: return '📄';
  }
}

// Helper to get child node type
export function getChildNodeType(parentType: NodeType | null): NodeType {
  if (!parentType) return NodeType.Book;
  switch (parentType) {
    case NodeType.Book: return NodeType.Kaalam;
    case NodeType.Kaalam: return NodeType.Chapter;
    case NodeType.Chapter: return NodeType.Topic;
    case NodeType.Topic: return NodeType.Note;
    case NodeType.Note: return NodeType.Reference;
    default: return NodeType.Reference;
  }
}

// Priority colors
export function getPriorityColor(priority: Priority | null): string {
  switch (priority) {
    case Priority.High: return '#ef4444';
    case Priority.Medium: return '#f59e0b';
    case Priority.Low: return '#22c55e';
    default: return '#94a3b8';
  }
}

// Parse tags string to array
export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
}
