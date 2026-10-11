import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NodeService } from './services/node.service';
import {
  KNode, KNodeTree, NodeType, Priority, Breadcrumb, SearchResult, OcrResult, NodeImage,
  getNodeTypeIcon, getChildNodeType, getPriorityColor, parseTags
} from './models/node.model';

declare const ClassicEditor: any;
declare const Tesseract: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  // Navigation & Hierarchy (Dashboard-Driven)
  tree: KNodeTree[] = [];
  currentFolder: KNodeTree | null = null;
  selectedNode: KNode | null = null;
  breadcrumbs: Breadcrumb[] = [];
  activeView: 'dashboard' | 'editor' = 'dashboard';

  // Filters
  filterFavoritesOnly = false;
  selectedTagFilter: string | null = null;
  availableTags: string[] = [];
  dashboardSearchQuery = '';

  // Theme
  isDarkMode = true;

  // Editor & View State
  editorInstance: any = null;
  editorContent = '';
  isSaving = false;
  saveSuccessMessage = false;
  editorViewMode: 'edit' | 'preview' = 'preview'; // Default to View Mode!
  isAttachmentOpen = false; // Attached OCR section
  isImagesPanelOpen = false; // Attached Images & Gallery section

  // Topic Images & Attachments State
  nodeImages: NodeImage[] = [];
  isUploadingImage = false;
  selectedPreviewImage: NodeImage | null = null;
  imageSuccessBanner = false;
  imageUploadError = '';

  // Search Modal
  searchQuery = '';
  searchResults: SearchResult[] = [];
  isSearching = false;
  isSearchModalOpen = false;

  // OCR Multi-Upload State
  isUploadingOcr = false;
  ocrExtractedText = '';
  ocrImageFileName = '';
  ocrPreviewUrl: string | null = null;
  ocrProgress = 0;
  ocrStatusText = '';
  ocrHistory: OcrResult[] = [];
  ocrSuccessBanner = false;
  ocrError = '';

  // Create / Edit Modal State
  isCreateModalOpen = false;
  modalParentNode: KNodeTree | KNode | null = null;
  newNodeType: NodeType = NodeType.Book;
  newNodeName = '';
  newNodePriority: Priority | null = null;

  // Edit Node Title Modal
  isRenameModalOpen = false;
  nodeToRename: KNodeTree | KNode | null = null;
  renameInput = '';

  // Tag Input
  newTagInput = '';

  // Helpers exposed to template
  Priority = Priority;
  NodeType = NodeType;
  getNodeTypeIcon = getNodeTypeIcon;
  getChildNodeType = getChildNodeType;
  getPriorityColor = getPriorityColor;
  parseTags = parseTags;

  @ViewChild('editorContainer') editorContainer!: ElementRef;

  private syncInterval: any;
  private onWindowFocus = () => this.silentSync();
  private onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.silentSync();
    }
  };

  constructor(
    private nodeService: NodeService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initTheme();
    this.loadTree();
    this.startRealtimeSync();
  }

  ngOnDestroy(): void {
    if (this.editorInstance) {
      this.editorInstance.destroy();
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocus);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private startRealtimeSync(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowFocus);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.syncInterval = setInterval(() => {
        this.silentSync();
      }, 2500);
    }
  }

  private silentSync(): void {
    // Never interrupt user when saving or actively editing in rich editor
    if (this.isSaving || (this.activeView === 'editor' && this.editorViewMode === 'edit')) {
      return;
    }

    this.nodeService.getFullTree().subscribe({
      next: (data) => {
        const currentJson = JSON.stringify(this.tree);
        const newJson = JSON.stringify(data);
        if (currentJson !== newJson) {
          this.tree = data;
          this.extractAllTags();

          if (this.currentFolder) {
            this.currentFolder = this.findNodeInTree(this.currentFolder.id, this.tree) || null;
          }

          if (this.activeView === 'editor' && this.selectedNode && this.editorViewMode === 'preview') {
            const updatedSelected = this.findNodeInTree(this.selectedNode.id, this.tree);
            if (updatedSelected && updatedSelected.name !== this.selectedNode.name) {
              this.selectedNode.name = updatedSelected.name;
            }
          }
          this.cd.detectChanges();
        }
      },
      error: () => {}
    });
  }

  // ── Theme Handling ─────────────────────────────────────────
  initTheme(): void {
    const saved = localStorage.getItem('topiks_theme');
    this.isDarkMode = saved ? saved === 'dark' : true;
    this.applyTheme();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('topiks_theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme(): void {
    if (this.isDarkMode) {
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
    } else {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    }
  }

  // ── Hierarchy & Dashboard Navigation ───────────────────────
  loadTree(preserveId?: string): void {
    this.nodeService.getFullTree().subscribe({
      next: (data) => {
        this.tree = data;
        this.extractAllTags();

        // Update currentFolder reference if set
        if (this.currentFolder) {
          this.currentFolder = this.findNodeInTree(this.currentFolder.id, this.tree) || null;
        }

        if (preserveId) {
          if (this.activeView === 'editor' && this.selectedNode?.id === preserveId) {
            this.selectNodeById(preserveId, false);
          }
        }
        this.cd.detectChanges();
      },
      error: (err) => console.error('Failed to load tree:', err)
    });
  }

  findNodeInTree(id: string, list: KNodeTree[]): KNodeTree | null {
    for (const item of list) {
      if (item.id === id) return item;
      if (item.children && item.children.length > 0) {
        const found = this.findNodeInTree(id, item.children);
        if (found) return found;
      }
    }
    return null;
  }

  // Get items to display on the dashboard (Strict 4-Tier Hierarchy)
  getDisplayedNodes(): KNodeTree[] {
    let list: KNodeTree[] = [];

    if (!this.currentFolder) {
      // 1. Dashboard ONLY lists Books
      list = this.tree.filter(n => n.nodeType === NodeType.Book);
    } else if (this.currentFolder.nodeType === NodeType.Book) {
      // 2. Books ONLY list Kaalams
      list = (this.currentFolder.children || []).filter(n => n.nodeType === NodeType.Kaalam);
    } else if (this.currentFolder.nodeType === NodeType.Kaalam) {
      // 3. Kaalams ONLY list Chapters
      list = (this.currentFolder.children || []).filter(n => n.nodeType === NodeType.Chapter);
    } else if (this.currentFolder.nodeType === NodeType.Chapter) {
      // 4. Chapters ONLY list Topics
      list = (this.currentFolder.children || []).filter(n => n.nodeType === NodeType.Topic || n.nodeType === NodeType.Note);
    } else {
      list = this.currentFolder.children || [];
    }

    // Apply Favorites filter
    if (this.filterFavoritesOnly) {
      list = list.filter(n => n.isFavorite);
    }

    // Apply Tag filter
    if (this.selectedTagFilter) {
      // Show nodes matching tag
      list = list.filter(n => n.name.toLowerCase().includes(this.selectedTagFilter!.toLowerCase()));
    }

    // Apply In-Dashboard quick search
    if (this.dashboardSearchQuery.trim()) {
      const q = this.dashboardSearchQuery.trim().toLowerCase();
      list = list.filter(n => n.name.toLowerCase().includes(q));
    }

    return list;
  }

  // Child counts strictly matching expected child type
  getChildCountForNode(node: KNodeTree): number {
    if (!node.children) return 0;
    if (node.nodeType === NodeType.Book) {
      return node.children.filter(c => c.nodeType === NodeType.Kaalam).length;
    }
    if (node.nodeType === NodeType.Kaalam) {
      return node.children.filter(c => c.nodeType === NodeType.Chapter).length;
    }
    if (node.nodeType === NodeType.Chapter) {
      return node.children.filter(c => c.nodeType === NodeType.Topic || c.nodeType === NodeType.Note).length;
    }
    return node.children.length;
  }

  getChildTypeLabelForNode(node: KNodeTree): string {
    const count = this.getChildCountForNode(node);
    if (node.nodeType === NodeType.Book) {
      return count === 1 ? '1 kaalam' : `${count} kaalams`;
    }
    if (node.nodeType === NodeType.Kaalam) {
      return count === 1 ? '1 chapter' : `${count} chapters`;
    }
    if (node.nodeType === NodeType.Chapter) {
      return count === 1 ? '1 topic' : `${count} topics`;
    }
    return node.nodeType;
  }

  // Check if a node is a container (Book, Kaalam, Chapter) - no note editing
  isContainerNode(node: KNodeTree | KNode): boolean {
    return node.nodeType === NodeType.Book ||
           node.nodeType === NodeType.Kaalam ||
           node.nodeType === NodeType.Chapter;
  }

  // Navigate deeper into a Book or Chapter folder
  enterFolder(node: KNodeTree): void {
    this.currentFolder = node;
    this.loadBreadcrumbs(node.id);
  }

  // Navigate to root or a specific ancestor breadcrumb
  navigateToCrumb(crumbId: string | null): void {
    if (!crumbId) {
      this.currentFolder = null;
      this.breadcrumbs = [];
      this.activeView = 'dashboard';
    } else {
      const target = this.findNodeInTree(crumbId, this.tree);
      if (target) {
        this.currentFolder = target;
        this.loadBreadcrumbs(target.id);
        this.activeView = 'dashboard';
      }
    }
  }

  // Step up one level
  goUpOneFolder(): void {
    if (!this.currentFolder) return;
    if (this.currentFolder.parentId) {
      const parent = this.findNodeInTree(this.currentFolder.parentId, this.tree);
      this.currentFolder = parent;
      if (parent) {
        this.loadBreadcrumbs(parent.id);
      } else {
        this.breadcrumbs = [];
      }
    } else {
      this.currentFolder = null;
      this.breadcrumbs = [];
    }
  }

  // Open a node directly in the Editor / Reader
  openNodeInEditor(node: KNodeTree | KNode): void {
    this.selectNodeById(node.id, true);
  }

  // Back from Editor to Dashboard
  backToDashboard(): void {
    this.activeView = 'dashboard';
  }

  // ── Node Selection & Editor Setup ──────────────────────────
  selectNodeById(id: string, switchView = true): void {
    this.nodeService.getNode(id).subscribe({
      next: (fullNode) => {
        this.selectedNode = fullNode;
        this.editorContent = fullNode.content || '';
        this.loadBreadcrumbs(id);
        this.loadOcrHistory(id);
        this.loadNodeImages(id);

        if (switchView) {
          this.activeView = 'editor';
          this.editorViewMode = 'preview'; // Default view mode!
          this.isAttachmentOpen = false;
          this.isImagesPanelOpen = false;
        }

        setTimeout(() => this.initOrUpdateEditor(this.editorContent), 60);
        this.cd.markForCheck();
      },
      error: (err) => console.error('Failed to get node:', err)
    });
  }

  toggleAttachments(): void {
    this.isAttachmentOpen = !this.isAttachmentOpen;
    if (this.isAttachmentOpen) {
      this.isImagesPanelOpen = false;
    }
  }

  toggleImagesPanel(): void {
    this.isImagesPanelOpen = !this.isImagesPanelOpen;
    if (this.isImagesPanelOpen) {
      this.isAttachmentOpen = false;
    }
  }

  enterEditMode(): void {
    this.editorViewMode = 'edit';
    setTimeout(() => this.initOrUpdateEditor(this.editorContent), 60);
  }

  exitEditMode(): void {
    this.editorViewMode = 'preview';
  }

  loadBreadcrumbs(nodeId: string): void {
    this.nodeService.getBreadcrumbs(nodeId).subscribe({
      next: (crumbs) => this.breadcrumbs = crumbs,
      error: () => this.breadcrumbs = []
    });
  }

  // ── CKEditor 5 Integration ────────────────────────────────
  private initOrUpdateEditor(content: string): void {
    const el = document.getElementById('ckeditor-target');
    if (!el) return;

    if (this.editorInstance) {
      this.editorInstance.setData(content);
      return;
    }

    if (typeof ClassicEditor !== 'undefined') {
      const self = this;
      class TopiksUploadAdapter {
        loader: any;
        constructor(loader: any) {
          this.loader = loader;
        }
        upload() {
          return this.loader.file.then((file: File) => {
            return new Promise((resolve, reject) => {
              if (!self.selectedNode) {
                reject('No topic selected');
                return;
              }
              self.nodeService.uploadNodeImage(self.selectedNode.id, file).subscribe({
                next: (res) => {
                  self.loadNodeImages(self.selectedNode!.id);
                  resolve({ default: res.url });
                },
                error: (err) => reject(err)
              });
            });
          });
        }
        abort() {}
      }

      ClassicEditor
        .create(el, {
          toolbar: [
            'heading', '|',
            'bold', 'italic', 'underline', '|',
            'bulletedList', 'numberedList', '|',
            'outdent', 'indent', '|',
            'link', 'blockQuote', 'insertTable', '|',
            'undo', 'redo'
          ],
          placeholder: 'Start writing knowledge notes here...',
          extraPlugins: [
            function(editor: any) {
              const fileRepo = editor.plugins.get('FileRepository');
              if (fileRepo) {
                fileRepo.createUploadAdapter = (loader: any) => new TopiksUploadAdapter(loader);
              }
            }
          ]
        })
        .then((editor: any) => {
          this.editorInstance = editor;
          editor.setData(content);
          editor.model.document.on('change:data', () => {
            this.editorContent = editor.getData();
          });
        })
        .catch((error: any) => {
          console.warn('CKEditor initialization fallback:', error);
        });
    }
  }

  // ── Save Content ───────────────────────────────────────────
  saveCurrentNode(): void {
    if (!this.selectedNode) return;

    if (this.editorInstance) {
      this.editorContent = this.editorInstance.getData();
    }

    this.isSaving = true;
    this.nodeService.updateNode(this.selectedNode.id, {
      name: this.selectedNode.name,
      content: this.editorContent,
      priority: this.selectedNode.priority || undefined,
      tags: this.selectedNode.tags || undefined,
      isFavorite: this.selectedNode.isFavorite
    }).subscribe({
      next: (updated) => {
        this.selectedNode = updated;
        this.isSaving = false;
        this.saveSuccessMessage = true;
        setTimeout(() => this.saveSuccessMessage = false, 2500);
        this.loadTree(this.selectedNode.id);
        this.cd.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Failed to save:', err);
      }
    });
  }

  toggleFavorite(node?: KNodeTree): void {
    const target = node || this.selectedNode;
    if (!target) return;

    const newState = !target.isFavorite;
    target.isFavorite = newState;

    this.nodeService.updateNode(target.id, {
      isFavorite: newState
    }).subscribe({
      next: () => this.loadTree()
    });
  }

  setPriority(p: Priority | null): void {
    if (!this.selectedNode) return;
    this.selectedNode.priority = p;
    this.saveCurrentNode();
  }

  // ── Tags Management ────────────────────────────────────────
  addTag(): void {
    if (!this.newTagInput.trim() || !this.selectedNode) return;
    const tag = this.newTagInput.trim().replace(/^#/, '');
    const currentTags = parseTags(this.selectedNode.tags);

    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
      this.selectedNode.tags = currentTags.join(',');
      this.saveCurrentNode();
      this.extractAllTags();
    }
    this.newTagInput = '';
  }

  removeTag(tagToRemove: string): void {
    if (!this.selectedNode) return;
    const currentTags = parseTags(this.selectedNode.tags).filter(t => t !== tagToRemove);
    this.selectedNode.tags = currentTags.join(',');
    this.saveCurrentNode();
    this.extractAllTags();
  }

  extractAllTags(): void {
    const tagsSet = new Set<string>();
    const walk = (nodes: KNodeTree[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) walk(n.children);
      }
    };
    walk(this.tree);
    this.availableTags = Array.from(tagsSet);
  }

  // ── Node Images & Photos Management ────────────────────────
  loadNodeImages(nodeId: string): void {
    this.nodeService.getNodeImages(nodeId).subscribe({
      next: (images) => {
        this.nodeImages = images;
        this.cd.markForCheck();
      },
      error: () => this.nodeImages = []
    });
  }

  onImageFileSelected(event: any): void {
    const files: FileList | null = event.target.files;
    if (!files || files.length === 0 || !this.selectedNode) return;

    this.isUploadingImage = true;
    this.imageUploadError = '';

    const fileList = Array.from(files);
    let completed = 0;

    for (const file of fileList) {
      this.nodeService.uploadNodeImage(this.selectedNode.id, file).subscribe({
        next: () => {
          completed++;
          if (completed === fileList.length) {
            this.isUploadingImage = false;
            this.imageSuccessBanner = true;
            setTimeout(() => this.imageSuccessBanner = false, 3000);
            this.loadNodeImages(this.selectedNode!.id);
            this.cd.markForCheck();
          }
        },
        error: (err) => {
          this.isUploadingImage = false;
          this.imageUploadError = 'Failed to upload image. Please try again.';
          console.error('Image upload error:', err);
          this.cd.markForCheck();
        }
      });
    }

    event.target.value = '';
  }

  insertImageIntoNote(image: NodeImage): void {
    if (!this.selectedNode) return;

    const imgBlock = `
      <figure class="note-image-figure" style="margin: 1.5rem 0; text-align: center;">
        <img src="${image.url}" alt="" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.18);" />
      </figure>
    `;

    this.editorContent = (this.editorContent || '') + imgBlock;

    if (this.editorInstance) {
      this.editorInstance.setData(this.editorContent);
    }

    this.saveCurrentNode();
    this.saveSuccessMessage = true;
    setTimeout(() => this.saveSuccessMessage = false, 2500);
  }

  deleteImage(image: NodeImage, event?: Event): void {
    if (event) event.stopPropagation();
    this.nodeService.deleteImage(image.id).subscribe({
      next: () => {
        if (this.selectedNode) this.loadNodeImages(this.selectedNode.id);
        if (this.selectedPreviewImage?.id === image.id) this.selectedPreviewImage = null;
        this.cd.markForCheck();
      }
    });
  }

  previewImage(image: NodeImage): void {
    this.selectedPreviewImage = image;
  }

  closeImagePreview(): void {
    this.selectedPreviewImage = null;
  }

  // ── OCR Multi-Upload Feature ───────────────────────────────
  onOcrFileSelected(event: any): void {
    const file: File = event.target.files?.[0];
    if (!file || !this.selectedNode) return;

    if (this.ocrPreviewUrl) {
      URL.revokeObjectURL(this.ocrPreviewUrl);
    }
    this.ocrPreviewUrl = URL.createObjectURL(file);
    event.target.value = '';

    this.isUploadingOcr = true;
    this.ocrImageFileName = file.name;
    this.ocrExtractedText = '';
    this.ocrError = '';
    this.ocrProgress = 10;
    this.ocrStatusText = 'Starting scanner...';

    const saveToServer = (text: string) => {
      this.ocrStatusText = 'Saving scan to vault...';
      this.nodeService.uploadOcr(this.selectedNode!.id, file, text).subscribe({
        next: (res) => {
          this.isUploadingOcr = false;
          this.ocrStatusText = '';
          this.ocrProgress = 100;
          this.ocrExtractedText = res.extractedText || text;
          this.loadOcrHistory(this.selectedNode!.id);
          this.loadNodeImages(this.selectedNode!.id);
          this.cd.markForCheck();
        },
        error: (err) => {
          this.isUploadingOcr = false;
          this.ocrStatusText = '';
          this.ocrExtractedText = text;
          console.error('OCR Upload save error:', err);
          this.cd.markForCheck();
        }
      });
    };

    if (typeof Tesseract !== 'undefined') {
      this.ocrStatusText = 'Reading text with OCR engine...';
      Tesseract.recognize(
        file,
        'eng',
        {
          logger: (m: any) => {
            if (m && m.status === 'recognizing text') {
              const p = Math.round((m.progress || 0) * 100);
              this.ocrProgress = Math.min(95, Math.round(p * 0.85) + 10);
              this.ocrStatusText = `Recognizing text (${p}%)...`;
              this.cd.markForCheck();
            }
          }
        }
      ).then((out: any) => {
        const text = out?.data?.text?.trim() || '[No readable text found in image]';
        saveToServer(text);
      }).catch((err: any) => {
        console.warn('Client Tesseract failed, falling back to server:', err);
        saveToServer('');
      });
    } else {
      saveToServer('');
    }
  }

  appendOcrToContent(includeImage = false): void {
    if (!this.ocrExtractedText || !this.selectedNode) return;

    let imgHtml = '';
    if (includeImage && this.ocrPreviewUrl) {
      const matched = this.nodeImages.find(i => i.fileName === this.ocrImageFileName);
      const src = matched ? matched.url : this.ocrPreviewUrl;
      imgHtml = `
        <div style="text-align: center; margin: 1rem 0;">
          <img src="${src}" alt="" style="max-width: 100%; max-height: 380px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.18);" />
        </div>
      `;
    }

    const ocrBlock = `
      <div class="ocr-import-block" style="margin: 1.5rem 0; padding: 1.2rem; border-left: 4px solid #588157; background: rgba(88, 129, 87, 0.12); border-radius: 10px;">
        ${imgHtml}
        <p style="white-space: pre-wrap; font-size: 0.95rem; margin: 0;">${this.ocrExtractedText}</p>
      </div>
    `;

    this.editorContent = (this.editorContent || '') + ocrBlock;

    if (this.editorInstance) {
      this.editorInstance.setData(this.editorContent);
    }

    this.saveCurrentNode();
    this.ocrSuccessBanner = true;
    setTimeout(() => this.ocrSuccessBanner = false, 3000);
  }

  loadOcrHistory(nodeId: string): void {
    this.nodeService.getOcrHistory(nodeId).subscribe({
      next: (history) => this.ocrHistory = history,
      error: () => this.ocrHistory = []
    });
  }

  // ── Global Search Feature ──────────────────────────────────
  onSearchInput(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }
    this.isSearching = true;
    this.nodeService.search(this.searchQuery).subscribe({
      next: (results) => {
        this.searchResults = results;
        this.isSearching = false;
        this.cd.markForCheck();
      },
      error: () => this.isSearching = false
    });
  }

  selectSearchResult(result: SearchResult): void {
    if (result.nodeType === NodeType.Book || result.nodeType === NodeType.Kaalam || result.nodeType === NodeType.Chapter) {
      this.navigateToCrumb(result.id);
    } else {
      this.selectNodeById(result.id, true);
    }
    this.isSearchModalOpen = false;
  }

  // ── Node Creation & Modals ─────────────────────────────────
  openCreateModal(parent?: KNodeTree | KNode): void {
    this.modalParentNode = parent || this.currentFolder || null;
    this.newNodeType = getChildNodeType(this.modalParentNode ? this.modalParentNode.nodeType : null);
    this.newNodeName = '';
    this.newNodePriority = null;
    this.isCreateModalOpen = true;
  }

  closeCreateModal(): void {
    this.isCreateModalOpen = false;
  }

  setNewNodePriority(p: Priority | null): void {
    this.newNodePriority = p;
  }

  confirmCreateNode(): void {
    if (!this.newNodeName.trim()) return;

    this.nodeService.createNode({
      parentId: this.modalParentNode ? this.modalParentNode.id : null,
      name: this.newNodeName.trim(),
      nodeType: this.newNodeType,
      priority: this.newNodePriority || undefined
    }).subscribe({
      next: (created) => {
        this.closeCreateModal();
        this.loadTree(created.id);
        // If created inside current folder or root, stay on dashboard or open
        if (this.newNodeType === NodeType.Topic || this.newNodeType === NodeType.Note) {
          this.selectNodeById(created.id, true);
        }
      },
      error: (err) => console.error('Failed to create node:', err)
    });
  }

  // ── Rename Modal ───────────────────────────────────────────
  openRenameModal(node: KNodeTree | KNode, event?: Event): void {
    if (event) event.stopPropagation();
    this.nodeToRename = node;
    this.renameInput = node.name;
    this.isRenameModalOpen = true;
  }

  confirmRename(): void {
    if (!this.nodeToRename || !this.renameInput.trim()) return;
    this.nodeService.updateNode(this.nodeToRename.id, {
      name: this.renameInput.trim()
    }).subscribe({
      next: () => {
        this.isRenameModalOpen = false;
        if (this.selectedNode && this.selectedNode.id === this.nodeToRename!.id) {
          this.selectedNode.name = this.renameInput.trim();
        }
        this.loadTree();
      }
    });
  }

  // ── Delete Modal & Logic ───────────────────────────────────
  isDeleteModalOpen = false;
  nodeToDelete: KNodeTree | KNode | null = null;

  deleteNode(node: KNodeTree | KNode, event?: Event): void {
    if (event) event.stopPropagation();
    this.nodeToDelete = node;
    this.isDeleteModalOpen = true;
  }

  cancelDelete(): void {
    this.isDeleteModalOpen = false;
    this.nodeToDelete = null;
  }

  confirmDelete(): void {
    if (!this.nodeToDelete) return;
    const target = this.nodeToDelete;
    this.nodeService.deleteNode(target.id).subscribe({
      next: () => {
        this.isDeleteModalOpen = false;
        if (this.selectedNode && this.selectedNode.id === target.id) {
          this.selectedNode = null;
          this.editorContent = '';
          this.activeView = 'dashboard';
        }
        if (this.currentFolder && this.currentFolder.id === target.id) {
          this.goUpOneFolder();
        }
        this.nodeToDelete = null;
        this.loadTree();
      },
      error: (err) => {
        console.error('Failed to delete node:', err);
        this.isDeleteModalOpen = false;
      }
    });
  }

  // ── Reordering (Move Sibling) ──────────────────────────────
  moveSibling(node: KNodeTree, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    const list = this.currentFolder ? this.currentFolder.children : this.tree;
    const idx = list.findIndex(n => n.id === node.id);
    if (idx < 0) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const current = list[idx];
    const target = list[targetIdx];
    const items = [
      { id: current.id, sortOrder: targetIdx },
      { id: target.id, sortOrder: idx }
    ];

    this.nodeService.reorderNodes(items).subscribe({
      next: () => this.loadTree()
    });
  }

  // ── Export Feature ─────────────────────────────────────────
  exportDocument(format: 'html' | 'markdown' | 'print'): void {
    if (!this.selectedNode) return;

    if (format === 'print') {
      window.print();
      return;
    }

    const title = this.selectedNode.name;
    let content = '';
    let mimeType = 'text/plain';
    let ext = 'txt';

    if (format === 'html') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;}</style></head><body><h1>${title}</h1>${this.editorContent}</body></html>`;
      mimeType = 'text/html';
      ext = 'html';
    } else {
      content = `# ${title}\n\n${this.editorContent.replace(/<[^>]+>/g, '')}`;
      ext = 'md';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Count total stats for dashboard
  getTotalBooksCount(): number {
    return this.tree.length;
  }

  getTotalFavoritesCount(): number {
    let count = 0;
    const walk = (nodes: KNodeTree[]) => {
      for (const n of nodes) {
        if (n.isFavorite) count++;
        if (n.children) walk(n.children);
      }
    };
    walk(this.tree);
    return count;
  }
}
