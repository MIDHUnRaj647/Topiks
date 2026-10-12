import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NodeService } from './services/node.service';
import { BamsMcqTestComponent } from './components/bams-mcq-test/bams-mcq-test.component';
import {
  KNode, KNodeTree, NodeType, Priority, Breadcrumb, SearchResult, OcrResult, NodeImage,
  getNodeTypeIcon, getChildNodeType, getPriorityColor, parseTags
} from './models/node.model';

declare const ClassicEditor: any;
declare const Tesseract: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, BamsMcqTestComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  // Navigation & Hierarchy (Dashboard-Driven)
  tree: KNodeTree[] = [];
  currentFolder: KNodeTree | null = null;
  selectedNode: KNode | null = null;
  breadcrumbs: Breadcrumb[] = [];
  activeView: 'dashboard' | 'editor' | 'mcq' = 'dashboard';

  // Filters
  filterFavoritesOnly = false;
  selectedTagFilter: string | null = null;
  availableTags: string[] = [];
  dashboardSearchQuery = '';

  // Quick Topic Navigator State (3 Cascading Dropdowns, Collapsed by default)
  isQuickNavOpen = false;
  quickNavBookId = '';
  quickNavKaalamId = '';
  quickNavChapterId = '';

  // Theme
  isDarkMode = false;

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

  // Photo Scanner & Image State (Direct photo display & compression)
  isScanningImage = false;
  scanStatusText = '';
  scanProgress = 0;
  scanSuccessBanner = false;
  scanCompressionInfo = '';
  scanError = '';
  lastScannedImageUrl: string | null = null;
  lastScannedFileName = '';
  ocrHistory: OcrResult[] = [];

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

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      if (this.activeView === 'editor' && this.selectedNode && this.editorViewMode === 'edit') {
        event.preventDefault();
        this.saveCurrentNode(true);
      }
    }
  }

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
      // Sync on window focus or when user returns to tab, without aggressive background polling
      window.addEventListener('focus', this.onWindowFocus);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private silentSync(): void {
    // Never run sync when in MCQ test mode, saving, or actively editing in rich editor
    if (this.activeView === 'mcq' || this.isSaving || (this.activeView === 'editor' && this.editorViewMode === 'edit')) {
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
    this.isDarkMode = saved ? saved === 'dark' : false;
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

  // ── Quick Topic Navigator (3 Cascading Dropdowns) ───────────
  toggleQuickNav(): void {
    this.isQuickNavOpen = !this.isQuickNavOpen;
  }

  getQuickNavBooks(): KNodeTree[] {
    return this.tree.filter(n => n.nodeType === NodeType.Book);
  }

  getQuickNavKaalams(): KNodeTree[] {
    if (!this.quickNavBookId) return [];
    const book = this.findNodeInTree(this.quickNavBookId, this.tree);
    if (!book || !book.children) return [];
    return book.children.filter(n => n.nodeType === NodeType.Kaalam);
  }

  getQuickNavChapters(): KNodeTree[] {
    if (!this.quickNavKaalamId) return [];
    const kaalam = this.findNodeInTree(this.quickNavKaalamId, this.tree);
    if (!kaalam || !kaalam.children) return [];
    return kaalam.children.filter(n => n.nodeType === NodeType.Chapter);
  }

  getQuickNavTopics(): KNodeTree[] {
    if (!this.quickNavChapterId) return [];
    const chapter = this.findNodeInTree(this.quickNavChapterId, this.tree);
    if (!chapter || !chapter.children) return [];
    return chapter.children.filter(n => n.nodeType === NodeType.Topic || n.nodeType === NodeType.Note);
  }

  getSelectedQuickChapter(): KNodeTree | null {
    if (!this.quickNavChapterId) return null;
    return this.findNodeInTree(this.quickNavChapterId, this.tree);
  }

  onQuickNavBookChange(): void {
    this.quickNavKaalamId = '';
    this.quickNavChapterId = '';
  }

  onQuickNavKaalamChange(): void {
    this.quickNavChapterId = '';
  }

  onQuickNavChapterChange(): void {
    // Keeps chapter selected and ready with topics
  }

  browseQuickNavChapter(): void {
    const chapter = this.getSelectedQuickChapter();
    if (chapter) {
      this.enterFolder(chapter);
    }
  }

  resetQuickNav(): void {
    this.quickNavBookId = '';
    this.quickNavKaalamId = '';
    this.quickNavChapterId = '';
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
          return this.loader.file.then(async (file: File) => {
            const { file: compressedFile } = await self.compressImageFile(file);
            return new Promise((resolve, reject) => {
              if (!self.selectedNode) {
                reject('No topic selected');
                return;
              }
              self.nodeService.uploadNodeImage(self.selectedNode.id, compressedFile).subscribe({
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
  saveCurrentNode(switchToViewMode: boolean = true): void {
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
        this.editorContent = updated.content || '';
        this.isSaving = false;
        this.saveSuccessMessage = true;
        if (switchToViewMode) {
          this.editorViewMode = 'preview';
        }
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
    this.saveCurrentNode(false);
  }

  // ── Tags Management ────────────────────────────────────────
  addTag(): void {
    if (!this.newTagInput.trim() || !this.selectedNode) return;
    const tag = this.newTagInput.trim().replace(/^#/, '');
    const currentTags = parseTags(this.selectedNode.tags);

    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
      this.selectedNode.tags = currentTags.join(',');
      this.saveCurrentNode(false);
      this.extractAllTags();
    }
    this.newTagInput = '';
  }

  removeTag(tagToRemove: string): void {
    if (!this.selectedNode) return;
    const currentTags = parseTags(this.selectedNode.tags).filter(t => t !== tagToRemove);
    this.selectedNode.tags = currentTags.join(',');
    this.saveCurrentNode(false);
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

  async onImageFileSelected(event: any): Promise<void> {
    const files: FileList | null = event.target.files;
    if (!files || files.length === 0 || !this.selectedNode) return;

    this.isUploadingImage = true;
    this.imageUploadError = '';

    const fileList = Array.from(files);
    let completed = 0;

    for (const file of fileList) {
      const { file: compressedFile } = await this.compressImageFile(file);
      this.nodeService.uploadNodeImage(this.selectedNode.id, compressedFile).subscribe({
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

    this.saveCurrentNode(false);
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

  // ── Client-side Image Compression & File Size Reduction ─────
  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async compressImageFile(file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.82): Promise<{ file: File; originalSize: number; compressedSize: number }> {
    const originalSize = file.size;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
      return { file, originalSize, compressedSize: file.size };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;

          // Scale dimensions if larger than maxWidth or maxHeight
          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ file, originalSize, compressedSize: file.size });
            return;
          }

          // White background prevents black artifacts when converting images with transparency to JPEG
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) {
              resolve({ file, originalSize, compressedSize: file.size });
              return;
            }
            if (blob.size < file.size) {
              const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
              const compressedFile = new File([blob], `${baseName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve({ file: compressedFile, originalSize, compressedSize: blob.size });
            } else {
              resolve({ file, originalSize, compressedSize: file.size });
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve({ file, originalSize, compressedSize: file.size });
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve({ file, originalSize, compressedSize: file.size });
      reader.readAsDataURL(file);
    });
  }

  // ── Photo Scanner Feature (Direct Image Display & File Size Reduction) ──
  async onScanImageSelected(event: any): Promise<void> {
    const file: File = event.target.files?.[0];
    if (!file || !this.selectedNode) return;
    event.target.value = '';

    this.isScanningImage = true;
    this.scanProgress = 25;
    this.scanStatusText = 'Optimizing & reducing file size...';
    this.scanError = '';
    this.scanSuccessBanner = false;

    try {
      // 1. File size reduction
      const { file: compressedFile, originalSize, compressedSize } = await this.compressImageFile(file);
      this.scanProgress = 65;
      this.scanStatusText = 'Uploading photo to note...';

      const savedPercent = originalSize > compressedSize
        ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
        : 0;

      // 2. Upload photo
      this.nodeService.uploadNodeImage(this.selectedNode.id, compressedFile).subscribe({
        next: (res) => {
          this.scanProgress = 100;
          this.isScanningImage = false;
          this.lastScannedImageUrl = res.url;
          this.lastScannedFileName = compressedFile.name;
          this.scanSuccessBanner = true;
          this.scanCompressionInfo = savedPercent > 0
            ? `Size reduced from ${this.formatBytes(originalSize)} to ${this.formatBytes(compressedSize)} (${savedPercent}% smaller)`
            : `File size: ${this.formatBytes(compressedSize)}`;

          // 3. Display the image as it is directly in the textbox / note
          const imgBlock = `
            <figure class="note-image-figure" style="margin: 1.5rem 0; text-align: center;">
              <img src="${res.url}" alt="${compressedFile.name}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.18);" />
            </figure>
          `;

          this.editorContent = (this.editorContent || '') + imgBlock;

          if (this.editorInstance) {
            this.editorInstance.setData(this.editorContent);
          }

          // Persist the updated note content
          this.saveCurrentNode(false);
          this.loadNodeImages(this.selectedNode!.id);
          this.cd.markForCheck();
        },
        error: (err) => {
          this.isScanningImage = false;
          this.scanError = 'Failed to upload scanned image. Please try again.';
          console.error('Scan upload error:', err);
          this.cd.markForCheck();
        }
      });
    } catch (err) {
      this.isScanningImage = false;
      this.scanError = 'Error processing image.';
      console.error(err);
      this.cd.markForCheck();
    }
  }

  onOcrFileSelected(event: any): void {
    this.onScanImageSelected(event);
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
